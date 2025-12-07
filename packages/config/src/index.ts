/**
 * @neon/config
 *
 * Centralized configuration management with validation
 */

import { z } from 'zod';
import { config as loadEnv } from 'dotenv';

// Load .env file
loadEnv();

// =============================================================================
// Configuration Schema
// =============================================================================

const configSchema = z.object({
  // Environment
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // API Server
  api: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.coerce.number().int().positive().default(3001),
    url: z.string().url().default('http://localhost:3001'),
    corsOrigins: z.string().transform((s) => s.split(',').map((o) => o.trim())).default('http://localhost:3000'),
    trustProxy: z.coerce.boolean().default(false),
  }),

  // Web Client
  web: z.object({
    port: z.coerce.number().int().positive().default(3000),
    url: z.string().url().default('http://localhost:3000'),
  }),

  // Database
  database: z.object({
    url: z.string(),
    poolMin: z.coerce.number().int().positive().default(2),
    poolMax: z.coerce.number().int().positive().default(10),
  }),

  // Redis
  redis: z.object({
    url: z.string().default('redis://localhost:6379'),
    password: z.string().optional(),
    prefix: z.string().default('neon:'),
  }),

  // JWT & Sessions
  auth: z.object({
    jwtSecret: z.string().min(32),
    jwtAccessExpiresIn: z.string().default('15m'),
    jwtRefreshExpiresIn: z.string().default('7d'),
    sessionSecret: z.string().min(32),
    sessionCookieName: z.string().default('neon.sid'),
    sessionCookieSecure: z.coerce.boolean().default(false),
    sessionCookieMaxAge: z.coerce.number().int().positive().default(604800000),
  }),

  // Encryption
  encryption: z.object({
    key: z.string().length(64), // 32 bytes in hex
  }),

  // S3 Storage
  s3: z.object({
    endpoint: z.string().default('http://localhost:3900'),
    region: z.string().default('garage'),
    accessKey: z.string(),
    secretKey: z.string(),
    bucketMedia: z.string().default('neon-media'),
    bucketBackups: z.string().default('neon-backups'),
    bucketRecordings: z.string().default('neon-recordings'),
    forcePathStyle: z.coerce.boolean().default(true),
  }),

  // LiveKit
  livekit: z.object({
    url: z.string().default('ws://localhost:7880'),
    apiUrl: z.string().default('http://localhost:7880'),
    apiKey: z.string(),
    apiSecret: z.string(),
    recordingEnabled: z.coerce.boolean().default(true),
  }),

  // Push Notifications
  push: z.object({
    vapidPublicKey: z.string().optional(),
    vapidPrivateKey: z.string().optional(),
    vapidSubject: z.string().optional(),
  }),

  // Email (SMTP)
  email: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().int().positive().default(1025),
    secure: z.coerce.boolean().default(false),
    user: z.string().optional(),
    pass: z.string().optional(),
    fromName: z.string().default('NEON'),
    fromEmail: z.string().email().default('neon@example.com'),
  }),

  // Rate Limiting
  rateLimit: z.object({
    windowMs: z.coerce.number().int().positive().default(60000),
    maxRequests: z.coerce.number().int().positive().default(100),
    loginMax: z.coerce.number().int().positive().default(5),
    loginLockoutMs: z.coerce.number().int().positive().default(900000),
  }),

  // File Limits
  files: z.object({
    maxFileSize: z.coerce.number().int().positive().default(1073741824),
    maxBodySize: z.string().default('50mb'),
  }),

  // Compliance
  compliance: z.object({
    mode: z.enum(['HIPAA', 'GDPR']).default('HIPAA'),
    auditRetentionDays: z.coerce.number().int().positive().default(2190),
    gdprPurgeGraceDays: z.coerce.number().int().positive().default(30),
  }),

  // Federation
  federation: z.object({
    enabled: z.coerce.boolean().default(false),
    instanceId: z.string().optional(),
    instanceUrl: z.string().optional(),
    privateKeyPath: z.string().optional(),
  }),

  // Background Jobs
  jobs: z.object({
    enabled: z.coerce.boolean().default(true),
    backupSchedule: z.string().default('0 2 * * *'),
    purgeSchedule: z.string().default('0 3 * * *'),
  }),

  // Observability
  observability: z.object({
    otelEnabled: z.coerce.boolean().default(false),
    otelEndpoint: z.string().optional(),
    sentryDsn: z.string().optional(),
    sentryEnvironment: z.string().optional(),
  }),

  // Development
  dev: z.object({
    debugEnabled: z.coerce.boolean().default(false),
    skipEmailVerification: z.coerce.boolean().default(false),
    superAdminEmail: z.string().email().optional(),
    superAdminPassword: z.string().optional(),
  }),
});

// =============================================================================
// Load and Validate Configuration
// =============================================================================

function loadConfig() {
  const env = process.env;

  const rawConfig = {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,

    api: {
      host: env.API_HOST,
      port: env.API_PORT,
      url: env.API_URL,
      corsOrigins: env.CORS_ORIGINS,
      trustProxy: env.TRUST_PROXY,
    },

    web: {
      port: env.WEB_PORT,
      url: env.WEB_URL,
    },

    database: {
      url: env.DATABASE_URL,
      poolMin: env.DATABASE_POOL_MIN,
      poolMax: env.DATABASE_POOL_MAX,
    },

    redis: {
      url: env.REDIS_URL,
      password: env.REDIS_PASSWORD,
      prefix: env.REDIS_PREFIX,
    },

    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtAccessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
      sessionSecret: env.SESSION_SECRET,
      sessionCookieName: env.SESSION_COOKIE_NAME,
      sessionCookieSecure: env.SESSION_COOKIE_SECURE,
      sessionCookieMaxAge: env.SESSION_COOKIE_MAX_AGE,
    },

    encryption: {
      key: env.ENCRYPTION_KEY,
    },

    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      bucketMedia: env.S3_BUCKET_MEDIA,
      bucketBackups: env.S3_BUCKET_BACKUPS,
      bucketRecordings: env.S3_BUCKET_RECORDINGS,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    },

    livekit: {
      url: env.LIVEKIT_URL,
      apiUrl: env.LIVEKIT_API_URL,
      apiKey: env.LIVEKIT_API_KEY,
      apiSecret: env.LIVEKIT_API_SECRET,
      recordingEnabled: env.LIVEKIT_RECORDING_ENABLED,
    },

    push: {
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
      vapidPrivateKey: env.VAPID_PRIVATE_KEY,
      vapidSubject: env.VAPID_SUBJECT,
    },

    email: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      fromName: env.SMTP_FROM_NAME,
      fromEmail: env.SMTP_FROM_EMAIL,
    },

    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      loginMax: env.RATE_LIMIT_LOGIN_MAX,
      loginLockoutMs: env.RATE_LIMIT_LOGIN_LOCKOUT_MS,
    },

    files: {
      maxFileSize: env.MAX_FILE_SIZE,
      maxBodySize: env.MAX_BODY_SIZE,
    },

    compliance: {
      mode: env.COMPLIANCE_MODE,
      auditRetentionDays: env.AUDIT_RETENTION_DAYS,
      gdprPurgeGraceDays: env.GDPR_PURGE_GRACE_DAYS,
    },

    federation: {
      enabled: env.FEDERATION_ENABLED,
      instanceId: env.FEDERATION_INSTANCE_ID,
      instanceUrl: env.FEDERATION_INSTANCE_URL,
      privateKeyPath: env.FEDERATION_PRIVATE_KEY_PATH,
    },

    jobs: {
      enabled: env.JOBS_ENABLED,
      backupSchedule: env.BACKUP_SCHEDULE,
      purgeSchedule: env.PURGE_SCHEDULE,
    },

    observability: {
      otelEnabled: env.OTEL_ENABLED,
      otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
      sentryDsn: env.SENTRY_DSN,
      sentryEnvironment: env.SENTRY_ENVIRONMENT,
    },

    dev: {
      debugEnabled: env.DEBUG_ENABLED,
      skipEmailVerification: env.SKIP_EMAIL_VERIFICATION,
      superAdminEmail: env.SUPER_ADMIN_EMAIL,
      superAdminPassword: env.SUPER_ADMIN_PASSWORD,
    },
  };

  return configSchema.parse(rawConfig);
}

// =============================================================================
// Export Configuration
// =============================================================================

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}

// For convenience, export config directly (lazy loaded)
export const config = new Proxy({} as Config, {
  get(_, prop: string) {
    return getConfig()[prop as keyof Config];
  },
});

// Export schema for testing
export { configSchema };
