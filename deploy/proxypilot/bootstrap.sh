#!/usr/bin/env bash
# =============================================================================
# NEON guest bootstrap — the script registered with ProxyPilot
# =============================================================================
# This is the thin half of the deployment. It keeps a checkout of the NEON
# repository at $SRC in step with $BRANCH and then hands over to startup.sh
# inside it, so a deploy is "push, then rerun_startup" and the deployment logic
# stays versioned with the code rather than pinned inside the guest.
#
# `git fetch` + `reset --hard` leaves untracked files alone, so the credentials
# in deploy/proxypilot/env/*.env survive every update.
#
# It returns as soon as the work is under way. A full deploy takes minutes —
# longer than a ProxyPilot tool call or a boot job wants to block for — so the
# real work runs as its own transient unit and is followed afterwards:
#
#   systemctl status neon-deploy
#   journalctl -u neon-deploy -f
#   /var/log/neon-deploy.log
#
# Set NEON_DEPLOY_DETACH=0 to run it in the foreground instead.
# =============================================================================
set -euo pipefail

REPO=https://github.com/CyberTechArmor/NEON.git
BRANCH=claude/neon-deploy-fractionate-proxypilot-x0bzcs
SRC=/opt/neon
DEPLOY="$SRC/deploy/proxypilot"

log() { echo "[bootstrap $(date -u +%H:%M:%S)] $*"; }

command -v git >/dev/null || { export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq git; }

if [ -d "$SRC/.git" ]; then
  log "updating $SRC to origin/$BRANCH"
  git -C "$SRC" remote set-url origin "$REPO"
  git -C "$SRC" fetch --depth 1 origin "$BRANCH"
  git -C "$SRC" checkout -B "$BRANCH" FETCH_HEAD
  git -C "$SRC" reset --hard FETCH_HEAD
else
  log "cloning $BRANCH into $SRC"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
fi
log "checkout is at $(git -C "$SRC" rev-parse --short HEAD)"

if [ ! -f "$DEPLOY/env/deploy.env" ] || [ ! -f "$DEPLOY/env/api.env" ]; then
  log "source is in place, but $DEPLOY/env/{deploy,api}.env are not written yet."
  log "Write them (see env/*.env.example), then run this script again."
  exit 0
fi

chmod +x "$DEPLOY/startup.sh" "$DEPLOY/scripts/"*.sh

if [ "${NEON_DEPLOY_DETACH:-1}" = "1" ] && command -v systemd-run >/dev/null 2>&1; then
  systemctl reset-failed neon-deploy.service 2>/dev/null || true
  if systemctl is-active --quiet neon-deploy.service; then
    log "neon-deploy.service is already running — leaving it alone"
    exit 0
  fi
  systemd-run --unit=neon-deploy --description="NEON deploy" \
    --property=Type=oneshot --property=TimeoutStartSec=3600 \
    --setenv=NEON_DEPLOY_DETACH=0 \
    "$DEPLOY/startup.sh" >/dev/null
  log "deploy running as neon-deploy.service — follow it with:"
  log "  systemctl status neon-deploy   journalctl -u neon-deploy -f   /var/log/neon-deploy.log"
  exit 0
fi

log "handing over to $DEPLOY/startup.sh"
exec "$DEPLOY/startup.sh"
