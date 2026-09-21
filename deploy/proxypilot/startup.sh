#!/usr/bin/env bash
# =============================================================================
# NEON — ProxyPilot startup script
# =============================================================================
# Registered as the guest's startup script, so it runs on boot and on every
# `rerun_startup`. It is idempotent by design: each step checks whether it has
# already been done, so a re-run after a code change rebuilds and restarts
# without touching data, layout or credentials.
#
# It expects two operator-written files (kept out of git, see env/README):
#   env/deploy.env  — compose interpolation: passwords, public URLs
#   env/api.env     — the API container's environment
# and writes one itself:
#   env/garage.env  — the S3 credentials Garage minted on first boot
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

LOG=/var/log/neon-deploy.log
exec > >(tee -a "$LOG") 2>&1

log()  { echo "[neon $(date -u +%H:%M:%S)] $*"; }
fail() { echo "[neon ERROR] $*" >&2; exit 1; }

ENV_DIR="$HERE/env"
DEPLOY_ENV="$ENV_DIR/deploy.env"
API_ENV="$ENV_DIR/api.env"
GARAGE_ENV="$ENV_DIR/garage.env"

log "=== NEON deploy starting (${HERE}) ==="

# -----------------------------------------------------------------------------
# 1. Docker Engine + Compose v2
# -----------------------------------------------------------------------------
# Debian's docker.io ships no compose plugin and no buildx, and Compose v2 needs
# buildx to build. Install Docker's own packages once, then never again.
if ! docker compose version >/dev/null 2>&1; then
  log "Installing Docker Engine and Compose v2 from download.docker.com"
  export DEBIAN_FRONTEND=noninteractive
  apt-get remove -y docker.io docker-compose containerd runc >/dev/null 2>&1 || true
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian %s stable\n' \
    "$(dpkg --print-architecture)" "$(. /etc/os-release && echo "$VERSION_CODENAME")" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
systemctl is-active --quiet docker || systemctl start docker
log "docker $(docker --version | awk '{print $3}' | tr -d ,) / compose $(docker compose version --short)"

COMPOSE=(docker compose --env-file "$DEPLOY_ENV" -f "$HERE/docker-compose.prod.yml")

# -----------------------------------------------------------------------------
# 2. Preflight
# -----------------------------------------------------------------------------
[ -f "$DEPLOY_ENV" ] || fail "missing $DEPLOY_ENV — write it before the first run"
[ -f "$API_ENV" ]    || fail "missing $API_ENV — write it before the first run"
# garage.env only exists after the first bootstrap; compose needs the file to
# exist to read it, so create an empty one on the first pass.
[ -f "$GARAGE_ENV" ] || { install -m 0600 /dev/null "$GARAGE_ENV"; log "created empty $GARAGE_ENV"; }
chmod 600 "$DEPLOY_ENV" "$API_ENV" "$GARAGE_ENV"

# -----------------------------------------------------------------------------
# 3. Build images
# -----------------------------------------------------------------------------
log "Building images (api, web) — first build pulls and compiles, expect several minutes"
"${COMPOSE[@]}" build

# -----------------------------------------------------------------------------
# 4. Bring up the data plane
# -----------------------------------------------------------------------------
# --remove-orphans clears containers from services this file no longer defines
# — notably the livekit that used to live here before calls moved to MEET.
log "Starting postgres, redis, garage"
"${COMPOSE[@]}" up -d --remove-orphans postgres redis garage

log "Waiting for postgres to report healthy"
for _ in $(seq 1 60); do
  [ "$("${COMPOSE[@]}" ps --format json postgres | grep -c '"Health":"healthy"' || true)" -gt 0 ] && break
  sleep 2
done

# -----------------------------------------------------------------------------
# 5. Garage bootstrap (layout, key, buckets, CORS) — first run only
# -----------------------------------------------------------------------------
"$HERE/scripts/bootstrap-garage.sh" "$DEPLOY_ENV" "$GARAGE_ENV" "$HERE/docker-compose.prod.yml"
chmod 600 "$GARAGE_ENV"

# -----------------------------------------------------------------------------
# 6. Database schema and first-run seed
# -----------------------------------------------------------------------------
log "Applying Prisma migrations"
"${COMPOSE[@]}" run --rm -T api \
  npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma

# The seed is a no-op once an organization exists, so it is safe on every run.
log "Seeding (no-op if the instance is already seeded)"
"${COMPOSE[@]}" run --rm -T api node packages/database/prisma/seed.js || \
  log "WARNING: seed returned non-zero — already seeded, or check the log above"

# -----------------------------------------------------------------------------
# 7. Application
# -----------------------------------------------------------------------------
log "Starting api and web"
"${COMPOSE[@]}" up -d api web

# -----------------------------------------------------------------------------
# 8. Report
# -----------------------------------------------------------------------------
log "Waiting for the API to answer /health"
api_ok=no
for _ in $(seq 1 45); do
  if curl -fsS -o /dev/null --max-time 3 http://127.0.0.1:3001/health; then api_ok=yes; break; fi
  sleep 2
done
web_ok=no
for _ in $(seq 1 15); do
  if curl -fsS -o /dev/null --max-time 3 http://127.0.0.1:3000/health; then web_ok=yes; break; fi
  sleep 2
done

"${COMPOSE[@]}" ps
log "api /health: $api_ok   web /health: $web_ok"
[ "$api_ok" = yes ] || fail "API did not come up — see: docker compose logs api"
[ "$web_ok" = yes ] || fail "web did not come up — see: docker compose logs web"
log "=== NEON deploy complete ==="
