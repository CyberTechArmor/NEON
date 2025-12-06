/**
 * Audit Service
 *
 * Immutable audit logging for compliance (HIPAA/GDPR)
 */

import { prisma } from '@neon/database';
import { getConfig } from '@neon/config';

const config = getConfig();

export interface AuditLogEntry {
  orgId?: string;
  actorId?: string;
  actorType?: 'user' | 'system' | 'federation' | 'api_key';
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export class AuditService {
  /**
   * Log an audit event
   *
   * Uses raw SQL to insert into the append-only audit.logs table
   * which has hash chaining for tamper evidence
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      const {
        orgId,
        actorId,
        actorType = 'user',
        action,
        resourceType,
        resourceId,
        details,
        ipAddress,
        userAgent,
        requestId,
      } = entry;

      // Insert into audit log (trigger handles hash chaining)
      await prisma.$executeRaw`
        INSERT INTO audit.logs (
          org_id,
          actor_id,
          actor_type,
          action,
          resource_type,
          resource_id,
          details,
          ip_address,
          user_agent,
          request_id,
          partition_key
        ) VALUES (
          ${orgId ? orgId : null}::uuid,
          ${actorId ? actorId : null}::uuid,
          ${actorType},
          ${action},
          ${resourceType},
          ${resourceId ? resourceId : null}::uuid,
          ${details ? JSON.stringify(details) : null}::jsonb,
          ${ipAddress ? ipAddress : null}::inet,
          ${userAgent ? userAgent : null},
          ${requestId ? requestId : null}::uuid,
          CURRENT_DATE
        )
      `;
    } catch (error) {
      // Log error but don't throw - audit logging should not break main flow
      console.error('[Audit] Failed to write audit log:', error);

      // In production, might want to queue failed logs for retry
      if (config.nodeEnv === 'production') {
        // TODO: Queue for retry
      }
    }
  }

  /**
   * Query audit logs
   *
   * For admin dashboard and compliance reporting
   */
  static async query(filters: {
    orgId?: string;
    actorId?: string;
    action?: string | string[];
    resourceType?: string | string[];
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    entries: Array<{
      id: string;
      createdAt: Date;
      orgId: string | null;
      actorId: string | null;
      actorType: string;
      action: string;
      resourceType: string;
      resourceId: string | null;
      details: Record<string, unknown> | null;
      ipAddress: string | null;
      userAgent: string | null;
      requestId: string | null;
    }>;
    total: number;
  }> {
    const {
      orgId,
      actorId,
      action,
      resourceType,
      resourceId,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    // Build WHERE clauses
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (orgId) {
      conditions.push(`org_id = $${paramIndex}::uuid`);
      params.push(orgId);
      paramIndex++;
    }

    if (actorId) {
      conditions.push(`actor_id = $${paramIndex}::uuid`);
      params.push(actorId);
      paramIndex++;
    }

    if (action) {
      if (Array.isArray(action)) {
        conditions.push(`action = ANY($${paramIndex}::text[])`);
        params.push(action);
      } else {
        conditions.push(`action = $${paramIndex}`);
        params.push(action);
      }
      paramIndex++;
    }

    if (resourceType) {
      if (Array.isArray(resourceType)) {
        conditions.push(`resource_type = ANY($${paramIndex}::text[])`);
        params.push(resourceType);
      } else {
        conditions.push(`resource_type = $${paramIndex}`);
        params.push(resourceType);
      }
      paramIndex++;
    }

    if (resourceId) {
      conditions.push(`resource_id = $${paramIndex}::uuid`);
      params.push(resourceId);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM audit.logs ${whereClause}`,
      ...params
    );
    const total = Number(countResult[0]?.count ?? 0);

    // Fetch entries
    params.push(limit, offset);
    const entries = await prisma.$queryRawUnsafe<
      Array<{
        id: bigint;
        created_at: Date;
        org_id: string | null;
        actor_id: string | null;
        actor_type: string;
        action: string;
        resource_type: string;
        resource_id: string | null;
        details: Record<string, unknown> | null;
        ip_address: string | null;
        user_agent: string | null;
        request_id: string | null;
      }>
    >(
      `SELECT
        id,
        created_at,
        org_id,
        actor_id,
        actor_type,
        action,
        resource_type,
        resource_id,
        details,
        ip_address::text,
        user_agent,
        request_id
      FROM audit.logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      ...params
    );

    return {
      entries: entries.map((e) => ({
        id: e.id.toString(),
        createdAt: e.created_at,
        orgId: e.org_id,
        actorId: e.actor_id,
        actorType: e.actor_type,
        action: e.action,
        resourceType: e.resource_type,
        resourceId: e.resource_id,
        details: e.details,
        ipAddress: e.ip_address,
        userAgent: e.user_agent,
        requestId: e.request_id,
      })),
      total,
    };
  }

  /**
   * Verify audit log integrity
   *
   * Checks hash chain for tampering
   */
  static async verifyIntegrity(options?: {
    startId?: string;
    endId?: string;
    limit?: number;
  }): Promise<{
    valid: boolean;
    entriesChecked: number;
    firstInvalidId?: string;
    error?: string;
  }> {
    const { limit = 1000 } = options ?? {};

    try {
      // Fetch entries with their hashes
      const entries = await prisma.$queryRaw<
        Array<{
          id: bigint;
          created_at: Date;
          org_id: string | null;
          actor_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          details: Record<string, unknown> | null;
          previous_hash: string | null;
          entry_hash: string;
        }>
      >`
        SELECT
          id,
          created_at,
          org_id,
          actor_id,
          action,
          resource_type,
          resource_id,
          details,
          previous_hash,
          entry_hash
        FROM audit.logs
        ORDER BY id ASC
        LIMIT ${limit}
      `;

      if (entries.length === 0) {
        return { valid: true, entriesChecked: 0 };
      }

      // Verify chain
      let previousHash: string | null = null;

      for (const entry of entries) {
        // Check previous_hash matches what we expect
        if (entry.previous_hash !== previousHash) {
          return {
            valid: false,
            entriesChecked: entries.indexOf(entry),
            firstInvalidId: entry.id.toString(),
            error: 'Previous hash mismatch - possible tampering detected',
          };
        }

        // Recalculate hash and verify
        const calculatedHash = await prisma.$queryRaw<[{ hash: string }]>`
          SELECT audit.calculate_entry_hash(
            ${entry.created_at},
            ${entry.org_id}::uuid,
            ${entry.actor_id}::uuid,
            ${entry.action},
            ${entry.resource_type},
            ${entry.resource_id}::uuid,
            ${entry.details ? JSON.stringify(entry.details) : null}::jsonb,
            ${previousHash}
          ) as hash
        `;

        if (calculatedHash[0]?.hash !== entry.entry_hash) {
          return {
            valid: false,
            entriesChecked: entries.indexOf(entry),
            firstInvalidId: entry.id.toString(),
            error: 'Entry hash mismatch - possible tampering detected',
          };
        }

        previousHash = entry.entry_hash;
      }

      return { valid: true, entriesChecked: entries.length };
    } catch (error) {
      return {
        valid: false,
        entriesChecked: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Export audit logs for compliance reporting
   */
  static async export(filters: {
    orgId: string;
    startDate: Date;
    endDate: Date;
    format: 'json' | 'csv';
  }): Promise<string> {
    const { entries } = await this.query({
      orgId: filters.orgId,
      startDate: filters.startDate,
      endDate: filters.endDate,
      limit: 100000, // Large limit for export
    });

    if (filters.format === 'csv') {
      const headers = [
        'id',
        'timestamp',
        'actor_id',
        'actor_type',
        'action',
        'resource_type',
        'resource_id',
        'ip_address',
        'details',
      ].join(',');

      const rows = entries.map((e) =>
        [
          e.id,
          e.createdAt.toISOString(),
          e.actorId ?? '',
          e.actorType,
          e.action,
          e.resourceType,
          e.resourceId ?? '',
          e.ipAddress ?? '',
          e.details ? JSON.stringify(e.details).replace(/"/g, '""') : '',
        ]
          .map((v) => `"${v}"`)
          .join(',')
      );

      return [headers, ...rows].join('\n');
    }

    return JSON.stringify(entries, null, 2);
  }
}
