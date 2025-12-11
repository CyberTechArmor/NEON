/**
 * Feature Flags Service
 *
 * Utility functions for managing organization-level feature flags.
 * Features can be toggled per-organization to control access to
 * voice calls, video calls, meetings, and other functionality.
 */

import { prisma } from '@neon/database';
import { getRedis } from './redis';

// Default feature flags for new organizations
export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  voice_calls: true,
  video_calls: true,
  meetings: true,
  screen_share: true,
  file_uploads: true,
  rich_attachments: false, // New feature, disabled by default
};

// Cache TTL in seconds
const CACHE_TTL = 60; // 1 minute

/**
 * Check if a feature is enabled for an organization
 * Uses Redis cache for performance, falls back to database
 */
export async function isFeatureEnabled(orgId: string, featureKey: string): Promise<boolean> {
  const cacheKey = `feature_flag:${orgId}:${featureKey}`;

  try {
    // Try cache first
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }
  } catch {
    // Redis unavailable, proceed to database
  }

  // Query database
  const flag = await prisma.organizationFeatureFlag.findUnique({
    where: {
      organizationId_featureKey: {
        organizationId: orgId,
        featureKey,
      },
    },
    select: { enabled: true },
  });

  // If no flag exists, use default
  const enabled = flag?.enabled ?? (DEFAULT_FEATURE_FLAGS[featureKey] ?? false);

  // Cache the result
  try {
    const redis = getRedis();
    await redis.set(cacheKey, enabled.toString(), 'EX', CACHE_TTL);
  } catch {
    // Ignore cache errors
  }

  return enabled;
}

/**
 * Get all feature flags for an organization
 */
export async function getAllFeatureFlags(orgId: string): Promise<Record<string, boolean>> {
  // Get all flags from database
  const flags = await prisma.organizationFeatureFlag.findMany({
    where: { organizationId: orgId },
    select: { featureKey: true, enabled: true },
  });

  // Start with defaults
  const result: Record<string, boolean> = { ...DEFAULT_FEATURE_FLAGS };

  // Override with database values
  for (const flag of flags) {
    result[flag.featureKey] = flag.enabled;
  }

  return result;
}

/**
 * Set a feature flag for an organization
 * Creates the flag if it doesn't exist
 */
export async function setFeatureFlag(
  orgId: string,
  featureKey: string,
  enabled: boolean
): Promise<void> {
  await prisma.organizationFeatureFlag.upsert({
    where: {
      organizationId_featureKey: {
        organizationId: orgId,
        featureKey,
      },
    },
    create: {
      organizationId: orgId,
      featureKey,
      enabled,
    },
    update: {
      enabled,
    },
  });

  // Invalidate cache
  try {
    const redis = getRedis();
    await redis.del(`feature_flag:${orgId}:${featureKey}`);
  } catch {
    // Ignore cache errors
  }
}

/**
 * Set multiple feature flags at once
 */
export async function setFeatureFlags(
  orgId: string,
  flags: Record<string, boolean>
): Promise<void> {
  const operations = Object.entries(flags).map(([featureKey, enabled]) =>
    prisma.organizationFeatureFlag.upsert({
      where: {
        organizationId_featureKey: {
          organizationId: orgId,
          featureKey,
        },
      },
      create: {
        organizationId: orgId,
        featureKey,
        enabled,
      },
      update: {
        enabled,
      },
    })
  );

  await prisma.$transaction(operations);

  // Invalidate cache for all flags
  try {
    const redis = getRedis();
    const keys = Object.keys(flags).map((key) => `feature_flag:${orgId}:${key}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Ignore cache errors
  }
}

/**
 * Get list of all available feature keys
 */
export function getAvailableFeatureKeys(): Array<{ key: string; name: string; description: string }> {
  return [
    { key: 'voice_calls', name: 'Voice Calls', description: 'Enable voice call functionality' },
    { key: 'video_calls', name: 'Video Calls', description: 'Enable video call functionality' },
    { key: 'meetings', name: 'Scheduled Meetings', description: 'Enable scheduled meetings feature' },
    { key: 'screen_share', name: 'Screen Sharing', description: 'Enable screen sharing in calls and meetings' },
    { key: 'file_uploads', name: 'File Uploads', description: 'Enable file upload functionality' },
    { key: 'rich_attachments', name: 'Rich Attachments', description: 'Enable inline image/video/audio preview in chat' },
  ];
}
