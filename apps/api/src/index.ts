/**
 * NEON API Server Entry Point
 *
 * Initializes and starts the Express server with Socket.io
 */

import { createServer } from 'http';
import { getConfig } from '@neon/config';
import { connectDatabase, disconnectDatabase } from '@neon/database';
import { createApp } from './app';
import { createSocketServer } from './socket';
import { connectRedis, disconnectRedis } from './services/redis';
import { initializeEventBus, shutdownEventBus } from './services/eventbus';
import { initializeS3, startHeartbeat, stopHeartbeat } from './services/s3';
import { initializeWebhookDispatch } from './services/webhookDispatch';
import { startJobScheduler, stopJobScheduler } from './jobs';

const config = getConfig();

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     ███╗   ██╗███████╗ ██████╗ ███╗   ██╗                ║
║     ████╗  ██║██╔════╝██╔═══██╗████╗  ██║                ║
║     ██╔██╗ ██║█████╗  ██║   ██║██╔██╗ ██║                ║
║     ██║╚██╗██║██╔══╝  ██║   ██║██║╚██╗██║                ║
║     ██║ ╚████║███████╗╚██████╔╝██║ ╚████║                ║
║     ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝                ║
║                                                           ║
║     Real-time Collaboration Platform                      ║
║     Version 0.1.0                                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  console.log(`[Server] Environment: ${config.nodeEnv}`);
  console.log(`[Server] Compliance Mode: ${config.compliance.mode}`);

  // Connect to database
  console.log('[Database] Connecting...');
  await connectDatabase();

  // Connect to Redis
  console.log('[Redis] Connecting...');
  await connectRedis();

  // Initialize EventBus (for real-time messaging)
  console.log('[EventBus] Initializing...');
  await initializeEventBus();

  // Initialize webhook dispatch service (depends on EventBus)
  console.log('[Webhook] Initializing dispatch service...');
  initializeWebhookDispatch();

  // Initialize S3 storage (non-blocking - server starts even if S3 is unavailable)
  console.log('[S3] Initializing...');
  const s3Connected = await initializeS3();
  if (!s3Connected) {
    console.warn('[Server] Starting with degraded S3 functionality - file uploads may fail');
  }

  // Start S3 heartbeat monitoring
  console.log('[S3] Starting heartbeat monitoring...');
  startHeartbeat();

  // Create Express app
  const app = createApp();

  // Create HTTP server
  const httpServer = createServer(app);

  // Initialize Socket.io
  console.log('[Socket.io] Initializing...');
  createSocketServer(httpServer);

  // Start background job scheduler
  if (config.jobs.enabled) {
    console.log('[Jobs] Starting scheduler...');
    startJobScheduler();
  }

  // Start server
  const { host, port } = config.api;
  httpServer.listen(port, host, () => {
    console.log(`[Server] API server listening on http://${host}:${port}`);
    console.log(`[Server] Health check: http://${host}:${port}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

    // Stop accepting new connections
    httpServer.close(async () => {
      console.log('[Server] HTTP server closed');

      // Stop job scheduler
      if (config.jobs.enabled) {
        console.log('[Jobs] Stopping scheduler...');
        stopJobScheduler();
      }

      // Stop S3 heartbeat
      console.log('[S3] Stopping heartbeat...');
      stopHeartbeat();

      // Shutdown EventBus
      console.log('[EventBus] Shutting down...');
      await shutdownEventBus();

      // Disconnect from Redis
      console.log('[Redis] Disconnecting...');
      await disconnectRedis();

      // Disconnect from database
      console.log('[Database] Disconnecting...');
      await disconnectDatabase();

      console.log('[Server] Shutdown complete');
      process.exit(0);
    });

    // Force exit after 30 seconds
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
    shutdown('unhandledRejection');
  });
}

main().catch((error) => {
  console.error('[Server] Fatal error during startup:', error);
  process.exit(1);
});
