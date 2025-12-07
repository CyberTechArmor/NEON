/**
 * Prisma Client Singleton
 *
 * Ensures a single instance of PrismaClient is used throughout the application.
 * Handles connection pooling and prevents connection exhaustion in serverless environments.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { execSync } from 'child_process';
import * as path from 'path';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const prismaClientOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
};

/**
 * Get the Prisma client instance
 * In development, stores the client in global to prevent hot-reload issues
 */
function createPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return new PrismaClient(prismaClientOptions);
  }

  if (!global.__prisma) {
    global.__prisma = new PrismaClient(prismaClientOptions);
  }

  return global.__prisma;
}

export const prisma = createPrismaClient();

/**
 * Check if database migrations have been applied
 */
async function checkMigrationsApplied(): Promise<boolean> {
  try {
    // Check if _prisma_migrations table exists
    await prisma.$queryRaw`SELECT 1 FROM _prisma_migrations LIMIT 1`;
    return true;
  } catch (error) {
    // Table doesn't exist = migrations haven't been run
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return false;
    }
    throw error;
  }
}

/**
 * Run database migrations
 */
async function runMigrations(): Promise<boolean> {
  console.log('[Database] Running migrations...');

  try {
    // Find the prisma schema path
    const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');

    // Run prisma migrate deploy
    execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });

    console.log('[Database] Migrations completed successfully');
    return true;
  } catch (error) {
    console.error('[Database] Migration failed, trying db push as fallback...');

    try {
      const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
      execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss`, {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..'),
      });
      console.log('[Database] Schema pushed successfully');
      return true;
    } catch (pushError) {
      console.error('[Database] Schema push also failed:', pushError);
      return false;
    }
  }
}

/**
 * Check if database has been seeded (has users and organizations)
 */
async function checkDatabaseSeeded(): Promise<boolean> {
  try {
    const userCount = await prisma.user.count();
    const orgCount = await prisma.organization.count();
    return userCount > 0 && orgCount > 0;
  } catch {
    // Tables might not exist yet
    return false;
  }
}

/**
 * Run database seed script
 */
async function runSeed(): Promise<boolean> {
  console.log('[Database] Running seed script...');

  try {
    // Check for compiled seed.js first, then fall back to ts-node
    const seedJsPath = path.resolve(__dirname, '../prisma/seed.js');
    const seedTsPath = path.resolve(__dirname, '../prisma/seed.ts');
    const fs = await import('fs');

    if (fs.existsSync(seedJsPath)) {
      execSync(`node "${seedJsPath}"`, {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'thomas@tagarmor.com',
          ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'd9zuzaZ9b2BMjm6x',
          ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'thomas',
        },
      });
    } else if (fs.existsSync(seedTsPath)) {
      execSync(`npx ts-node "${seedTsPath}"`, {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'thomas@tagarmor.com',
          ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'd9zuzaZ9b2BMjm6x',
          ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'thomas',
        },
      });
    } else {
      console.warn('[Database] No seed script found at', seedJsPath, 'or', seedTsPath);
      return false;
    }

    console.log('[Database] Seed completed successfully');
    return true;
  } catch (error) {
    console.error('[Database] Seed failed:', error);
    return false;
  }
}

/**
 * Connect to the database
 * Call this during application startup
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('[Database] Connected successfully');

    // Check if migrations have been applied
    const migrationsApplied = await checkMigrationsApplied();

    if (!migrationsApplied) {
      console.log('[Database] Migrations not found, applying...');
      const success = await runMigrations();

      if (!success) {
        console.warn('[Database] WARNING: Migrations could not be applied automatically.');
        console.warn('[Database] Please run: npx prisma migrate deploy');
      }
    }

    // Check if database needs to be seeded
    const isSeeded = await checkDatabaseSeeded();

    if (!isSeeded) {
      console.log('[Database] Database is empty, running seed...');
      const seedSuccess = await runSeed();

      if (!seedSuccess) {
        console.warn('[Database] WARNING: Database could not be seeded automatically.');
        console.warn('[Database] Please run: npm run db:seed');
      }
    }
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    throw error;
  }
}

/**
 * Disconnect from the database
 * Call this during graceful shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('[Database] Disconnected successfully');
  } catch (error) {
    console.error('[Database] Disconnect failed:', error);
    throw error;
  }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      healthy: true,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export { PrismaClient, Prisma } from '@prisma/client';
export type { Prisma as PrismaType } from '@prisma/client';
