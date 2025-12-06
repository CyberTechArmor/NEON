/**
 * Authentication Types
 *
 * Types for authentication, sessions, and user context
 */

// =============================================================================
// Authentication
// =============================================================================

export interface LoginRequest {
  email: string;
  password: string;
  orgSlug?: string; // Optional for multi-tenant login page
  mfaCode?: string; // For MFA flow
  deviceFingerprint?: string;
  rememberDevice?: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  mfaRequired?: boolean;
  mfaMethods?: MfaMethod[];
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresAt: string;
}

export interface MfaSetupRequest {
  method: MfaMethod;
}

export interface MfaSetupResponse {
  secret?: string; // For TOTP
  qrCode?: string; // Base64 QR code for TOTP
  backupCodes?: string[];
}

export interface MfaVerifyRequest {
  code: string;
  method: MfaMethod;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

// =============================================================================
// User Context
// =============================================================================

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  status: UserStatus;
  departmentId: string | null;
  roleId: string | null;
  departmentName: string | null;
  roleName: string | null;
  timezone: string;
  locale: string;
  permissions: string[]; // System permissions
  mfaEnabled: boolean;
}

export interface SessionInfo {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActivityAt: string;
  current: boolean;
}

// =============================================================================
// SSO
// =============================================================================

export interface SsoInitRequest {
  provider: SsoProviderType;
  orgSlug: string;
  redirectUri: string;
}

export interface SsoInitResponse {
  authUrl: string;
  state: string;
}

export interface SsoCallbackRequest {
  provider: SsoProviderType;
  code: string;
  state: string;
}

export type SsoProviderType = 'ldap' | 'oauth2' | 'oidc' | 'saml';

// =============================================================================
// Enums (matching database)
// =============================================================================

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export type MfaMethod = 'TOTP' | 'EMAIL';

export type PresenceStatus = 'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE';

// =============================================================================
// JWT Payload
// =============================================================================

export interface JwtPayload {
  sub: string; // User ID
  org: string; // Organization ID
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  jti: string; // Token ID for revocation
}

export interface AccessTokenPayload extends JwtPayload {
  type: 'access';
  email: string;
  role: string | null;
  dept: string | null;
  perms: string[]; // System permissions
}

export interface RefreshTokenPayload extends JwtPayload {
  type: 'refresh';
  device?: string;
}
