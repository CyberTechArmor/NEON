#!/bin/bash
# =============================================================================
# NEON Platform - Docker Cleanup Script
# =============================================================================
# This script removes all NEON Docker resources including containers, images,
# volumes, and networks to ensure a clean slate for rebuilding.
#
# Usage:
#   ./scripts/docker-cleanup.sh         # Interactive mode (asks for confirmation)
#   ./scripts/docker-cleanup.sh --force # Force mode (no confirmation)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}==============================================================================${NC}"
echo -e "${YELLOW}NEON Platform - Docker Cleanup Script${NC}"
echo -e "${YELLOW}==============================================================================${NC}"
echo ""

# Check for force flag
FORCE=false
if [[ "$1" == "--force" ]] || [[ "$1" == "-f" ]]; then
    FORCE=true
fi

# Warning and confirmation
if [[ "$FORCE" != true ]]; then
    echo -e "${RED}WARNING: This will remove all NEON Docker resources:${NC}"
    echo "  - All NEON containers (neon-*)"
    echo "  - All NEON images"
    echo "  - All NEON volumes (postgres_data, redis_data, garage_data, etc.)"
    echo "  - NEON network"
    echo ""
    read -p "Are you sure you want to continue? (y/N): " confirm
    if [[ "$confirm" != "y" ]] && [[ "$confirm" != "Y" ]]; then
        echo "Cleanup cancelled."
        exit 0
    fi
    echo ""
fi

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Step 1: Stop and remove containers using docker-compose
echo "Stopping containers..."
cd "$DOCKER_DIR"
docker compose down --remove-orphans 2>/dev/null || true
print_status "Containers stopped"

# Step 2: Remove NEON containers (in case any are orphaned)
echo ""
echo "Removing NEON containers..."
NEON_CONTAINERS=$(docker ps -a --filter "name=neon-" --format "{{.Names}}" 2>/dev/null || true)
if [[ -n "$NEON_CONTAINERS" ]]; then
    echo "$NEON_CONTAINERS" | xargs -r docker rm -f 2>/dev/null || true
    print_status "Removed containers: $NEON_CONTAINERS"
else
    print_status "No NEON containers found"
fi

# Step 3: Remove NEON volumes
echo ""
echo "Removing NEON volumes..."
VOLUME_PREFIX="docker_"  # docker-compose prefixes volumes with directory name
VOLUMES_TO_REMOVE=(
    "${VOLUME_PREFIX}postgres_data"
    "${VOLUME_PREFIX}redis_data"
    "${VOLUME_PREFIX}minio_data"
    "${VOLUME_PREFIX}garage_data"
    "${VOLUME_PREFIX}garage_meta"
    "${VOLUME_PREFIX}egress_tmp"
)

for vol in "${VOLUMES_TO_REMOVE[@]}"; do
    if docker volume inspect "$vol" >/dev/null 2>&1; then
        docker volume rm "$vol" 2>/dev/null || print_warning "Could not remove volume: $vol"
        print_status "Removed volume: $vol"
    fi
done

# Also try without prefix (in case compose project name differs)
VOLUMES_NO_PREFIX=(
    "postgres_data"
    "redis_data"
    "minio_data"
    "garage_data"
    "garage_meta"
    "egress_tmp"
)

for vol in "${VOLUMES_NO_PREFIX[@]}"; do
    if docker volume inspect "$vol" >/dev/null 2>&1; then
        docker volume rm "$vol" 2>/dev/null || print_warning "Could not remove volume: $vol"
        print_status "Removed volume: $vol"
    fi
done

# Step 4: Remove NEON images
echo ""
echo "Removing NEON images..."
NEON_IMAGES=$(docker images --filter "reference=*neon*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
if [[ -n "$NEON_IMAGES" ]]; then
    echo "$NEON_IMAGES" | xargs -r docker rmi -f 2>/dev/null || true
    print_status "Removed NEON images"
else
    print_status "No NEON images found"
fi

# Also remove docker-api and docker-web images (built by docker-compose)
COMPOSE_IMAGES=$(docker images --filter "reference=docker-api*" --filter "reference=docker-web*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
if [[ -n "$COMPOSE_IMAGES" ]]; then
    echo "$COMPOSE_IMAGES" | xargs -r docker rmi -f 2>/dev/null || true
    print_status "Removed compose-built images"
fi

# Step 5: Remove NEON network
echo ""
echo "Removing NEON network..."
if docker network inspect neon-network >/dev/null 2>&1; then
    docker network rm neon-network 2>/dev/null || print_warning "Could not remove network"
    print_status "Removed neon-network"
else
    print_status "Network neon-network not found"
fi

# Also try with docker_ prefix
if docker network inspect docker_neon-network >/dev/null 2>&1; then
    docker network rm docker_neon-network 2>/dev/null || print_warning "Could not remove network"
    print_status "Removed docker_neon-network"
fi

# Step 6: Prune dangling resources
echo ""
echo "Pruning dangling resources..."
docker system prune -f 2>/dev/null || true
print_status "Pruned dangling resources"

# Step 7: Remove build cache (optional but helps with stale builds)
echo ""
echo "Removing build cache..."
docker builder prune -f 2>/dev/null || true
print_status "Build cache cleared"

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Cleanup complete!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""
echo "To rebuild the NEON platform, run:"
echo "  cd docker && docker compose up -d"
echo ""
