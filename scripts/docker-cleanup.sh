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
#   ./scripts/docker-cleanup.sh --all   # Remove everything including base images
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}==============================================================================${NC}"
echo -e "${YELLOW}NEON Platform - Docker Cleanup Script${NC}"
echo -e "${YELLOW}==============================================================================${NC}"
echo ""

# Check for flags
FORCE=false
REMOVE_ALL=false
for arg in "$@"; do
    case $arg in
        --force|-f)
            FORCE=true
            ;;
        --all|-a)
            REMOVE_ALL=true
            ;;
    esac
done

# Warning and confirmation
if [[ "$FORCE" != true ]]; then
    echo -e "${RED}WARNING: This will remove all NEON Docker resources:${NC}"
    echo "  - All NEON and docker_* containers"
    echo "  - All built images (api, web)"
    echo "  - All volumes (postgres, redis, minio, etc.)"
    echo "  - NEON networks"
    if [[ "$REMOVE_ALL" == true ]]; then
        echo -e "  ${RED}- All base images (postgres, redis, minio, livekit)${NC}"
    fi
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

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# =============================================================================
# Step 1: Stop containers using docker-compose (try both v1 and v2)
# =============================================================================
echo -e "${BLUE}Step 1: Stopping containers via docker-compose...${NC}"
cd "$DOCKER_DIR"

# Try docker compose v2 first, then v1
docker compose down --remove-orphans --volumes 2>/dev/null || \
docker-compose down --remove-orphans --volumes 2>/dev/null || true
print_status "Docker compose down completed"

# =============================================================================
# Step 2: Force remove ALL project containers (multiple naming patterns)
# =============================================================================
echo ""
echo -e "${BLUE}Step 2: Removing all project containers...${NC}"

# Container name patterns used by docker-compose
CONTAINER_PATTERNS=(
    "neon-"
    "docker_"
    "docker-"
    "neon_"
)

for pattern in "${CONTAINER_PATTERNS[@]}"; do
    CONTAINERS=$(docker ps -a --filter "name=${pattern}" --format "{{.Names}}" 2>/dev/null || true)
    if [[ -n "$CONTAINERS" ]]; then
        echo "$CONTAINERS" | while read -r container; do
            docker rm -f "$container" 2>/dev/null && print_status "Removed container: $container" || true
        done
    fi
done

# Also remove by specific container names
SPECIFIC_CONTAINERS=(
    "neon-postgres"
    "neon-redis"
    "neon-minio"
    "neon-garage"
    "neon-livekit"
    "neon-livekit-egress"
    "neon-mailpit"
    "neon-api"
    "neon-web"
)

for container in "${SPECIFIC_CONTAINERS[@]}"; do
    if docker ps -a --format "{{.Names}}" | grep -q "^${container}$"; then
        docker rm -f "$container" 2>/dev/null && print_status "Removed container: $container" || true
    fi
done

print_status "Container cleanup completed"

# =============================================================================
# Step 3: Remove ALL project volumes (multiple naming patterns)
# =============================================================================
echo ""
echo -e "${BLUE}Step 3: Removing all project volumes...${NC}"

# Get all volumes and filter by known patterns
ALL_VOLUMES=$(docker volume ls -q 2>/dev/null || true)

# Volume name patterns
VOLUME_KEYWORDS=(
    "postgres"
    "redis"
    "minio"
    "garage"
    "egress"
    "neon"
)

for vol in $ALL_VOLUMES; do
    for keyword in "${VOLUME_KEYWORDS[@]}"; do
        if [[ "$vol" == *"$keyword"* ]]; then
            docker volume rm -f "$vol" 2>/dev/null && print_status "Removed volume: $vol" || print_warning "Could not remove: $vol"
            break
        fi
    done
done

print_status "Volume cleanup completed"

# =============================================================================
# Step 4: Remove project images
# =============================================================================
echo ""
echo -e "${BLUE}Step 4: Removing project images...${NC}"

# Remove built images (various naming patterns)
IMAGE_PATTERNS=(
    "*neon*"
    "docker-api*"
    "docker-web*"
    "docker_api*"
    "docker_web*"
)

for pattern in "${IMAGE_PATTERNS[@]}"; do
    IMAGES=$(docker images --filter "reference=${pattern}" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
    if [[ -n "$IMAGES" ]]; then
        echo "$IMAGES" | while read -r image; do
            docker rmi -f "$image" 2>/dev/null && print_status "Removed image: $image" || true
        done
    fi
done

# Remove base images if --all flag is set
if [[ "$REMOVE_ALL" == true ]]; then
    echo ""
    print_info "Removing base images (--all flag)..."
    BASE_IMAGES=(
        "postgres:16-alpine"
        "redis:7-alpine"
        "minio/minio:latest"
        "dxflrs/garage:v0.9.3"
        "livekit/livekit-server:v1.5"
        "livekit/egress:v1.8"
        "axllent/mailpit:latest"
    )

    for image in "${BASE_IMAGES[@]}"; do
        if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${image}$"; then
            docker rmi -f "$image" 2>/dev/null && print_status "Removed base image: $image" || true
        fi
    done
fi

print_status "Image cleanup completed"

# =============================================================================
# Step 5: Remove project networks
# =============================================================================
echo ""
echo -e "${BLUE}Step 5: Removing project networks...${NC}"

NETWORK_PATTERNS=(
    "neon"
    "docker_neon"
    "docker_default"
)

for pattern in "${NETWORK_PATTERNS[@]}"; do
    NETWORKS=$(docker network ls --filter "name=${pattern}" --format "{{.Name}}" 2>/dev/null || true)
    if [[ -n "$NETWORKS" ]]; then
        echo "$NETWORKS" | while read -r network; do
            # Don't remove default bridge networks
            if [[ "$network" != "bridge" && "$network" != "host" && "$network" != "none" ]]; then
                docker network rm "$network" 2>/dev/null && print_status "Removed network: $network" || true
            fi
        done
    fi
done

print_status "Network cleanup completed"

# =============================================================================
# Step 6: Prune dangling resources
# =============================================================================
echo ""
echo -e "${BLUE}Step 6: Pruning dangling resources...${NC}"
docker system prune -f 2>/dev/null || true
print_status "Dangling resources pruned"

# =============================================================================
# Step 7: Clear build cache
# =============================================================================
echo ""
echo -e "${BLUE}Step 7: Clearing build cache...${NC}"
docker builder prune -af 2>/dev/null || true
print_status "Build cache cleared"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Cleanup complete!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""
echo "To rebuild the NEON platform, run:"
echo "  cd docker && docker-compose up -d"
echo ""
echo "Or with docker compose v2:"
echo "  cd docker && docker compose up -d"
echo ""
