/**
 * Prisma Client Singleton
 *
 * Ensures a single instance of PrismaClient is used throughout the application.
 * Handles connection pooling and prevents connection exhaustion in serverless environments.
 */

import { PrismaClient } from '@prisma/client';

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
 * Connect to the database
 * Call this during application startup
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('[Database] Connected successfully');
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
