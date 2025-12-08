/**
 * Authentication Service
 *
 * Handles user authentication, JWT management, and password operations
 */

import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { authenticator } from 'otplib';
import { prisma } from '@neon/database';
import { getConfig } from '@neon/config';
import {
  UnauthorizedError,
  ForbiddenError,
  MfaRequiredError,
  NotFoundError,
  ValidationError,
  type AccessTokenPayload,
  type RefreshTokenPayload,
  type AuthUser,
  type LoginResponse,
} from '@neon/shared';
import { checkRateLimit, setCache, getCache, deleteCache } from './redis';
import { AuditService } from './audit';

const config = getConfig();

// =============================================================================
// Password Hashing
// =============================================================================

/**
 * Hash a password using Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// =============================================================================
// JWT Token Management
// =============================================================================

/**
 * Generate access token
 * Returns both the token and the unique jti for session storage
 */
export function generateAccessToken(user: {
  id: string;
  orgId: string;
  email: string;
  roleId: string | null;
  departmentId: string | null;
  permissions: string[];
}): { token: string; jti: string } {
  const jti = randomBytes(16).toString('hex');
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: user.id,
    org: user.orgId,
    type: 'access',
    email: user.email,
    role: user.roleId,
    dept: user.departmentId,
    perms: user.permissions,
    jti,
  };

  const token = jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtAccessExpiresIn as jwt.SignOptions['expiresIn'],
  });

  return { token, jti };
}

/**
 * Generate refresh token
 * Returns both the token and the unique jti for session storage
 */
export function generateRefreshToken(userId: string, deviceId?: string): { token: string; jti: string } {
  const jti = randomBytes(16).toString('hex');
  const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
    sub: userId,
    org: '', // Not needed for refresh
    type: 'refresh',
    device: deviceId,
    jti,
  };

  const token = jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtRefreshExpiresIn as jwt.SignOptions['expiresIn'],
  });

  return { token, jti };
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as RefreshTokenPayload;

    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    throw error;
  }
}

/**
 * Extract jti from access token (without full verification, for logout)
 */
export function extractTokenJti(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as AccessTokenPayload;
    return payload.jti || null;
  } catch {
    // Even if token is expired, try to decode it
    try {
      const decoded = jwt.decode(token) as AccessTokenPayload | null;
      return decoded?.jti || null;
    } catch {
      return null;
    }
  }
}

// =============================================================================
// MFA
// =============================================================================

/**
 * Generate TOTP secret
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Generate TOTP QR code URL
 */
export function generateTotpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, 'NEON', secret);
}

/**
 * Verify TOTP code
 */
export function verifyTotpCode(code: string, secret: string): boolean {
  return authenticator.verify({ token: code, secret });
}

/**
 * Generate backup codes
 */
export function generateBackupCodes(count: number = 10): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(4).toString('hex').toUpperCase()
  );
}

/**
 * Generate email verification code
 */
export function generateEmailCode(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

// =============================================================================
// Authentication Flow
// =============================================================================

/**
 * Login user
 */
export async function login(
  email: string,
  password: string,
  options: {
    orgSlug?: string;
    mfaCode?: string;
    deviceFingerprint?: string;
    ipAddress?: string;
    userAgent?: string;
  } = {}
): Promise<LoginResponse> {
  const { orgSlug, mfaCode, deviceFingerprint, ipAddress, userAgent } = options;

  // Check rate limiting
  const rateKey = `login:${email}`;
  const { remaining } = await checkRateLimit(
    rateKey,
    config.rateLimit.loginMax,
    config.rateLimit.loginLockoutMs / 1000
  );

  if (remaining <= 0) {
    throw new ForbiddenError('Account temporarily locked due to too many login attempts');
  }

  // Build query
  const whereClause: { email: string; organization?: { slug: string } } = { email };
  if (orgSlug) {
    whereClause.organization = { slug: orgSlug };
  }

  // Find user
  const user = await prisma.user.findFirst({
    where: whereClause,
    include: {
      organization: true,
      department: { select: { name: true } },
      role: { select: { name: true, permissions: true } },
    },
  });

  if (!user) {
    await AuditService.log({
      action: 'auth.login.failed',
      resourceType: 'user',
      details: { email, reason: 'user_not_found' },
      ipAddress,
      userAgent,
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.status === 'DEACTIVATED') {
    throw new ForbiddenError('This account has been deactivated');
  }

  if (user.status === 'SUSPENDED') {
    throw new ForbiddenError('This account is suspended');
  }

  // Verify password
  if (!user.passwordHash) {
    throw new UnauthorizedError('Password login not available for this account');
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    await AuditService.log({
      action: 'auth.login.failed',
      resourceType: 'user',
      resourceId: user.id,
      orgId: user.orgId,
      details: { reason: 'invalid_password' },
      ipAddress,
      userAgent,
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  // Check MFA
  if (user.mfaEnabled) {
    if (!mfaCode) {
      throw new MfaRequiredError(['TOTP', 'EMAIL']);
    }

    // Verify MFA code
    const mfaValid = user.mfaSecret
      ? verifyTotpCode(mfaCode, user.mfaSecret)
      : false;

    // Check backup codes if TOTP failed
    if (!mfaValid) {
      const backupCodeIndex = user.mfaBackupCodes.indexOf(mfaCode.toUpperCase());
      if (backupCodeIndex === -1) {
        await AuditService.log({
          action: 'auth.login.failed',
          resourceType: 'user',
          resourceId: user.id,
          orgId: user.orgId,
          details: { reason: 'invalid_mfa' },
          ipAddress,
          userAgent,
        });
        throw new UnauthorizedError('Invalid MFA code');
      }

      // Remove used backup code
      const newBackupCodes = [...user.mfaBackupCodes];
      newBackupCodes.splice(backupCodeIndex, 1);
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaBackupCodes: newBackupCodes },
      });
    }
  }

  // Generate tokens
  const { token: accessToken, jti: accessJti } = generateAccessToken({
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    roleId: user.roleId,
    departmentId: user.departmentId,
    permissions: user.role?.permissions ?? [],
  });

  const { token: refreshToken, jti: refreshJti } = generateRefreshToken(user.id, deviceFingerprint);

  // Create session - store unique jti values to allow multiple sessions per user
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      token: accessJti, // Store unique jti for session identification
      refreshToken: refreshJti, // Store unique jti for refresh token lookup
      userAgent,
      ipAddress,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Log successful login
  await AuditService.log({
    action: 'auth.login.success',
    resourceType: 'user',
    resourceId: user.id,
    orgId: user.orgId,
    actorId: user.id,
    details: { sessionId: session.id },
    ipAddress,
    userAgent,
  });

  // Calculate expiry
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15);

  const authUser: AuthUser = {
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    departmentId: user.departmentId,
    roleId: user.roleId,
    departmentName: user.department?.name ?? null,
    roleName: user.role?.name ?? null,
    timezone: user.timezone,
    locale: user.locale,
    permissions: user.role?.permissions ?? [],
    mfaEnabled: user.mfaEnabled,
  };

  return {
    user: authUser,
    accessToken,
    refreshToken,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthUser;
}> {
  const payload = verifyRefreshToken(refreshToken);

  // Find user with full details
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      role: { select: { name: true, permissions: true } },
      department: { select: { name: true } },
    },
  });

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  if (user.status !== 'ACTIVE') {
    throw new ForbiddenError('Account is not active');
  }

  // Verify session exists using the jti from the refresh token payload
  const session = await prisma.session.findFirst({
    where: {
      userId: user.id,
      refreshToken: payload.jti, // Look up by jti stored in session
      revokedAt: null,
    },
  });

  if (!session) {
    throw new UnauthorizedError('Session not found or revoked');
  }

  // Generate new access token
  const { token: accessToken, jti: accessJti } = generateAccessToken({
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    roleId: user.roleId,
    departmentId: user.departmentId,
    permissions: user.role?.permissions ?? [],
  });

  // Generate new refresh token for rotation
  const { token: newRefreshToken, jti: newRefreshJti } = generateRefreshToken(user.id);

  // Update session with new tokens and activity timestamp
  await prisma.session.update({
    where: { id: session.id },
    data: {
      token: accessJti,
      refreshToken: newRefreshJti,
      lastActivityAt: new Date(),
    },
  });

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15);

  const authUser: AuthUser = {
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    departmentId: user.departmentId,
    roleId: user.roleId,
    departmentName: user.department?.name ?? null,
    roleName: user.role?.name ?? null,
    timezone: user.timezone,
    locale: user.locale,
    permissions: user.role?.permissions ?? [],
    mfaEnabled: user.mfaEnabled,
  };

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresAt: expiresAt.toISOString(),
    user: authUser,
  };
}

/**
 * Logout - revoke session
 */
export async function logout(
  userId: string,
  token: string,
  options: { ipAddress?: string; userAgent?: string } = {}
): Promise<void> {
  // Extract jti from the token to find the session
  const jti = extractTokenJti(token);

  let session = null;
  if (jti) {
    session = await prisma.session.findFirst({
      where: {
        userId,
        token: jti, // Look up by jti stored in session
        revokedAt: null,
      },
    });
  }

  if (session) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }

  await AuditService.log({
    action: 'auth.logout',
    resourceType: 'session',
    resourceId: session?.id,
    actorId: userId,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });
}

/**
 * Logout from all sessions
 */
export async function logoutAll(
  userId: string,
  options: { ipAddress?: string; userAgent?: string } = {}
): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  await AuditService.log({
    action: 'auth.logout.all',
    resourceType: 'user',
    resourceId: userId,
    actorId: userId,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });
}

/**
 * Request password reset
 */
export async function requestPasswordReset(
  email: string,
  options: { ipAddress?: string; userAgent?: string } = {}
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email },
    include: { organization: true },
  });

  // Always return success to prevent email enumeration
  if (!user) {
    return;
  }

  // Generate reset token
  const resetToken = randomBytes(32).toString('hex');
  const resetTokenHash = await hashPassword(resetToken);

  // Store token with 1 hour expiry
  await setCache(`password_reset:${user.id}`, resetTokenHash, 3600);

  // TODO: Send email with reset link
  // For now, log token in development
  if (config.nodeEnv === 'development') {
    console.log(`[Auth] Password reset token for ${email}: ${resetToken}`);
  }

  await AuditService.log({
    action: 'auth.password_reset.requested',
    resourceType: 'user',
    resourceId: user.id,
    orgId: user.orgId,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });
}

/**
 * Reset password with token
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  options: { ipAddress?: string; userAgent?: string } = {}
): Promise<void> {
  // Find user with valid reset token
  // This is inefficient but secure - in production, store user ID with token
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, orgId: true },
  });

  let validUserId: string | null = null;
  let validOrgId: string | null = null;

  for (const user of users) {
    const storedHash = await getCache<string>(`password_reset:${user.id}`);
    if (storedHash && await verifyPassword(token, storedHash)) {
      validUserId = user.id;
      validOrgId = user.orgId;
      break;
    }
  }

  if (!validUserId) {
    throw new ValidationError('Invalid or expired reset token');
  }

  // Update password
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: validUserId },
    data: { passwordHash },
  });

  // Delete reset token
  await deleteCache(`password_reset:${validUserId}`);

  // Revoke all sessions
  await prisma.session.updateMany({
    where: { userId: validUserId },
    data: { revokedAt: new Date() },
  });

  await AuditService.log({
    action: 'auth.password_reset.completed',
    resourceType: 'user',
    resourceId: validUserId,
    orgId: validOrgId ?? undefined,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });
}

/**
 * Change password (when logged in)
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  options: { ipAddress?: string; userAgent?: string } = {}
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, orgId: true, passwordHash: true },
  });

  if (!user || !user.passwordHash) {
    throw new NotFoundError('User');
  }

  // Verify current password
  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  // Update password
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await AuditService.log({
    action: 'auth.password.changed',
    resourceType: 'user',
    resourceId: userId,
    actorId: userId,
    orgId: user.orgId,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });
}
