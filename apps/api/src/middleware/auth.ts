/**
 * Authentication Middleware
 *
 * JWT verification and user context extraction
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '@neon/config';
import { prisma } from '@neon/database';
import { UnauthorizedError, ForbiddenError, type AccessTokenPayload, type AuthUser } from '@neon/shared';
import { resolveAvatarUrl } from '../services/auth';

const config = getConfig();

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      userId?: string;
      orgId?: string;
      token?: string;
    }
  }
}

/**
 * Extract token from Authorization header or cookie
 */
function extractToken(req: Request): string | null {
  // Try Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try cookie
  const cookieToken = req.signedCookies?.[config.auth.sessionCookieName];
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

/**
 * Verify JWT and attach user to request
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    // Verify token
    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(token, config.auth.jwtSecret) as AccessTokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      throw error;
    }

    // Validate token type
    if (payload.type !== 'access') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Fetch user from database to ensure they still exist and are active
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        orgId: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        departmentId: true,
        roleId: true,
        mfaEnabled: true,
        timezone: true,
        locale: true,
        settings: true,
        department: { select: { name: true } },
        role: { select: { name: true, permissions: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status === 'DEACTIVATED') {
      throw new ForbiddenError('Account has been deactivated');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError('Account is suspended');
    }

    // Combine role permissions with user-specific permissions from settings
    const rolePermissions = user.role?.permissions ?? [];
    const userSettings = user.settings as Record<string, unknown> | null;
    const userPermissions = (userSettings?.permissions as string[]) || [];

    // Combine all permissions
    let allPermissions = [...new Set([...rolePermissions, ...userPermissions])];

    // Check if user is super admin by role name (case insensitive)
    const roleName = user.role?.name?.toLowerCase();
    const isSuperAdminByRole = roleName === 'super admin' || roleName === 'superadmin';

    // Ensure super_admin permission is included for super admin roles
    if (isSuperAdminByRole && !allPermissions.includes('super_admin')) {
      allPermissions = [...allPermissions, 'super_admin'];
    }

    // Resolve avatar URL to fresh presigned URL
    const resolvedAvatarUrl = await resolveAvatarUrl(user.avatarUrl, user.orgId);

    // Attach user to request
    req.user = {
      id: user.id,
      orgId: user.orgId,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: resolvedAvatarUrl,
      status: user.status,
      departmentId: user.departmentId,
      roleId: user.roleId,
      departmentName: user.department?.name ?? null,
      roleName: user.role?.name ?? null,
      timezone: user.timezone,
      locale: user.locale,
      permissions: allPermissions,
      mfaEnabled: user.mfaEnabled,
    };

    req.userId = user.id;
    req.orgId = user.orgId;
    req.token = token;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication - doesn't fail if no token present
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    return next();
  }

  return authenticate(req, res, next);
}

/**
 * Require specific permissions
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Super admin has all permissions
    if (req.user.permissions.includes('super_admin')) {
      return next();
    }

    // Check if user has any of the required permissions
    const hasPermission = permissions.some((p) => req.user!.permissions.includes(p));

    if (!hasPermission) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Require user to be in same organization
 */
export function requireSameOrg(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const targetOrgId = req.params.orgId || req.body?.orgId;

  if (targetOrgId && targetOrgId !== req.orgId) {
    // Check if super admin
    if (!req.user?.permissions.includes('super_admin')) {
      return next(new ForbiddenError('Cross-organization access denied'));
    }
  }

  next();
}

/**
 * Require MFA to be completed (for sensitive operations)
 */
export function requireMfa(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // TODO: Implement MFA session check
  // For now, just check if user has MFA enabled
  // In production, would verify MFA was completed in current session

  next();
}
