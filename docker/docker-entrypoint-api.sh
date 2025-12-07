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

# First wait for the database to be reachable
echo "[Entrypoint] Waiting for database to be ready..."
until echo "SELECT 1" | npx prisma db execute --stdin > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "[Entrypoint] Error: Database not reachable after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "[Entrypoint] Database not ready... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "[Entrypoint] Database is reachable, running migrations..."

# Run migrations (show output for debugging)
if npx prisma migrate deploy; then
  echo "[Entrypoint] Database migrations completed successfully"
else
  echo "[Entrypoint] Error: Database migration failed"
  echo "[Entrypoint] Attempting to push schema as fallback..."
  if npx prisma db push --accept-data-loss; then
    echo "[Entrypoint] Schema pushed successfully"
  else
    echo "[Entrypoint] Error: Schema push also failed"
    exit 1
  fi
fi

# Run seed if SEED_DATABASE is set and seed file exists
if [ "$SEED_DATABASE" = "true" ] && [ -f "/app/packages/database/prisma/seed.js" ]; then
  echo "[Entrypoint] Running database seed..."
  if node /app/packages/database/prisma/seed.js; then
    echo "[Entrypoint] Database seed completed successfully"
  else
    echo "[Entrypoint] Warning: Database seed failed (may already be seeded)"
  fi
fi

# Return to app directory and start the server
cd /app
echo "[Entrypoint] Starting API server..."
exec node apps/api/dist/index.js
