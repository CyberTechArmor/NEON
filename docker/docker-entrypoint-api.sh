#!/bin/sh
# =============================================================================
# NEON API Docker Entrypoint
# =============================================================================
# Handles database migrations and startup

set -e

echo "[Entrypoint] Starting NEON API..."

# Run database migrations
echo "[Entrypoint] Running database migrations..."
cd /app/packages/database

# Wait for database to be ready (with retries)
MAX_RETRIES=30
RETRY_COUNT=0
until npx prisma migrate deploy 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "[Entrypoint] Error: Database migration failed after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "[Entrypoint] Waiting for database... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "[Entrypoint] Database migrations completed successfully"

# Return to app directory and start the server
cd /app
echo "[Entrypoint] Starting API server..."
exec node apps/api/dist/index.js
