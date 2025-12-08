/**
 * Authentication Routes
 *
 * Handles login, logout, token refresh, MFA, and password management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getConfig } from '@neon/config';
import { prisma } from '@neon/database';
import {
  loginSchema,
  refreshTokenSchema,
  passwordResetSchema,
  passwordResetConfirmSchema,
  passwordChangeSchema,
  mfaSetupSchema,
  mfaVerifySchema,
  type LoginResponse,
} from '@neon/shared';
import { authenticate, requireMfa } from '../middleware/auth';
import * as AuthService from '../services/auth';
import { setCache, getCache, deleteCache } from '../services/redis';

const config = getConfig();
const router = Router();

/**
 * POST /auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);

    const result = await AuthService.login(data.email, data.password, {
      orgSlug: data.orgSlug,
      mfaCode: data.mfaCode,
      deviceFingerprint: data.deviceFingerprint,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Check if MFA is required
    if ('requiresMfa' in result && result.requiresMfa) {
      return res.json({
        success: true,
        data: {
          requiresMfa: true,
          userId: result.userId,
          mfaMethods: result.mfaMethods,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // TypeScript narrowing: at this point result is LoginResponse (not MFA required)
    const loginResponse = result as LoginResponse;

    // Set refresh token as HTTP-only cookie
    res.cookie(config.auth.sessionCookieName, loginResponse.refreshToken, {
      httpOnly: true,
      secure: config.auth.sessionCookieSecure,
      signed: true,
      maxAge: config.auth.sessionCookieMaxAge,
      sameSite: 'lax',
    });

    return res.json({
      success: true,
      data: {
        user: loginResponse.user,
        accessToken: loginResponse.accessToken,
        refreshToken: loginResponse.refreshToken,
        expiresAt: loginResponse.expiresAt,
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/mfa/login
 * Complete login with MFA code (for users with MFA enabled)
 */
router.post('/mfa/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId and code are required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        department: { select: { name: true } },
        role: { select: { name: true, permissions: true } },
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid MFA session' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({
        success: false,
        error: { code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled for this user' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Verify MFA code
    let mfaValid = AuthService.verifyTotpCode(code, user.mfaSecret);

    // Check backup codes if TOTP failed
    if (!mfaValid) {
      const backupCodeIndex = user.mfaBackupCodes.indexOf(code.toUpperCase());
      if (backupCodeIndex !== -1) {
        // Remove used backup code
        const newBackupCodes = [...user.mfaBackupCodes];
        newBackupCodes.splice(backupCodeIndex, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { mfaBackupCodes: newBackupCodes },
        });
        mfaValid = true;
      }
    }

    if (!mfaValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_MFA_CODE', message: 'Invalid MFA code' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Generate tokens
    const { token: accessToken, jti: accessJti } = AuthService.generateAccessToken({
      id: user.id,
      orgId: user.orgId,
      email: user.email,
      roleId: user.roleId,
      departmentId: user.departmentId,
      permissions: user.role?.permissions ?? [],
    });

    const { token: refreshToken, jti: refreshJti } = AuthService.generateRefreshToken(user.id);

    // Create session
    await prisma.session.create({
      data: {
        userId: user.id,
        token: accessJti,
        refreshToken: refreshJti,
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Set refresh token as HTTP-only cookie
    res.cookie(config.auth.sessionCookieName, refreshToken, {
      httpOnly: true,
      secure: config.auth.sessionCookieSecure,
      signed: true,
      maxAge: config.auth.sessionCookieMaxAge,
      sameSite: 'lax',
    });

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    return res.json({
      success: true,
      data: {
        user: {
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
        },
        accessToken,
        refreshToken,
        expiresAt: expiresAt.toISOString(),
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Try cookie first, then body
    const refreshToken =
      req.signedCookies?.[config.auth.sessionCookieName] ||
      refreshTokenSchema.parse(req.body).refreshToken;

    const result = await AuthService.refreshAccessToken(refreshToken);

    // Update refresh token cookie with rotated token
    res.cookie(config.auth.sessionCookieName, result.refreshToken, {
      httpOnly: true,
      secure: config.auth.sessionCookieSecure,
      signed: true,
      maxAge: config.auth.sessionCookieMaxAge,
      sameSite: 'lax',
    });

    res.json({
      success: true,
      data: result,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/logout
 * Logout current session
 */
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.logout(req.userId!, req.token!, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Clear cookie
    res.clearCookie(config.auth.sessionCookieName);

    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/logout-all
 * Logout from all sessions
 */
router.post('/logout-all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.logoutAll(req.userId!, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Clear cookie
    res.clearCookie(config.auth.sessionCookieName);

    res.json({
      success: true,
      data: { message: 'Logged out from all sessions' },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/me
 * Get current user
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: req.user,
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /auth/password/forgot
 * Request password reset
 */
router.post('/password/forgot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = passwordResetSchema.parse(req.body);

    await AuthService.requestPasswordReset(email, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      data: { message: 'If an account exists, a password reset email has been sent' },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/password/reset
 * Reset password with token
 */
router.post('/password/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = passwordResetConfirmSchema.parse(req.body);

    await AuthService.resetPassword(token, newPassword, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: { message: 'Password reset successfully' },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/password/change
 * Change password (when logged in)
 */
router.post(
  '/password/change',
  authenticate,
  requireMfa,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = passwordChangeSchema.parse(req.body);

      await AuthService.changePassword(req.userId!, currentPassword, newPassword, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        data: { message: 'Password changed successfully' },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/mfa/setup
 * Setup MFA
 */
router.post('/mfa/setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { method } = mfaSetupSchema.parse(req.body);

    if (method === 'TOTP') {
      const secret = AuthService.generateTotpSecret();
      const qrCode = AuthService.generateTotpUri(req.user!.email, secret);

      // Store secret temporarily in Redis with 10-minute expiry
      const cacheKey = `mfa_setup:${req.userId}`;
      await setCache(cacheKey, { secret, method }, 600); // 10 minutes

      res.json({
        success: true,
        data: {
          secret,
          qrCode,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      // Email MFA - send code
      const code = AuthService.generateEmailCode();

      // Store code temporarily in Redis
      const cacheKey = `mfa_setup:${req.userId}`;
      await setCache(cacheKey, { code, method }, 600); // 10 minutes
      // TODO: Send email with code

      res.json({
        success: true,
        data: { message: 'Verification code sent to your email' },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/mfa/verify
 * Verify and enable MFA
 */
router.post('/mfa/verify', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, method, secret } = req.body;

    let mfaSecret = secret;

    // Try to get the pending secret from Redis first (from setup step)
    const cacheKey = `mfa_setup:${req.userId}`;
    const cachedSetup = await getCache<{ secret?: string; code?: string; method: string }>(cacheKey);

    if (!mfaSecret && cachedSetup?.secret) {
      mfaSecret = cachedSetup.secret;
    }

    // If still no secret, check if user already has MFA secret (re-verification)
    if (!mfaSecret && req.user) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { mfaSecret: true, mfaEnabled: true },
      });

      if (user?.mfaSecret) {
        mfaSecret = user.mfaSecret;
      }
    }

    if (!mfaSecret) {
      return res.status(400).json({
        success: false,
        error: { code: 'MFA_SECRET_MISSING', message: 'MFA secret not found. Please restart the setup process.' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Verify the TOTP code
    const isValid = AuthService.verifyTotpCode(code, mfaSecret);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MFA_CODE', message: 'Invalid verification code. Please try again.' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Generate backup codes
    const backupCodes = AuthService.generateBackupCodes();

    // Update the user to enable MFA and save the secret
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        mfaEnabled: true,
        mfaSecret: mfaSecret,
        mfaBackupCodes: backupCodes,
      },
    });

    // Clear the cached setup data
    await deleteCache(cacheKey);

    return res.json({
      success: true,
      data: {
        message: 'MFA enabled successfully',
        backupCodes,
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /auth/mfa
 * Disable MFA
 */
router.delete(
  '/mfa',
  authenticate,
  requireMfa,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // TODO: Implement MFA disable

      res.json({
        success: true,
        data: { message: 'MFA disabled' },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as authRouter };
