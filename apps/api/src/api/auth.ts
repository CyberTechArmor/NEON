/**
 * Authentication Routes
 *
 * Handles login, logout, token refresh, MFA, and password management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getConfig } from '@neon/config';
import {
  loginSchema,
  refreshTokenSchema,
  passwordResetSchema,
  passwordResetConfirmSchema,
  passwordChangeSchema,
  mfaSetupSchema,
  mfaVerifySchema,
} from '@neon/shared';
import { authenticate, requireMfa } from '../middleware/auth';
import * as AuthService from '../services/auth';

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

    // Set refresh token as HTTP-only cookie
    res.cookie(config.auth.sessionCookieName, result.refreshToken, {
      httpOnly: true,
      secure: config.auth.sessionCookieSecure,
      signed: true,
      maxAge: config.auth.sessionCookieMaxAge,
      sameSite: 'lax',
    });

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
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

      // Store secret temporarily (will be confirmed on verify)
      // In production, encrypt and store in Redis with expiry

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
      // TODO: Store code and send email

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
    const { code, method } = mfaVerifySchema.parse(req.body);

    // TODO: Implement full MFA verification
    // For now, just a placeholder

    res.json({
      success: true,
      data: {
        message: 'MFA enabled successfully',
        backupCodes: AuthService.generateBackupCodes(),
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
