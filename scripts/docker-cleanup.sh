#!/bin/bash
# =============================================================================
# NEON Platform - Docker Cleanup Script
# =============================================================================
# This script removes all NEON Docker resources including containers, images,
# volumes, and networks to ensure a clean slate for rebuilding.
#
# Usage:
#   ./scripts/docker-cleanup.sh              # Interactive mode (asks for confirmation)
#   ./scripts/docker-cleanup.sh --force      # Force mode (no confirmation)
#   ./scripts/docker-cleanup.sh --all        # Remove everything including base images
#   ./scripts/docker-cleanup.sh --nuclear    # Complete Docker reset (removes ALL Docker resources)
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
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${YELLOW}==============================================================================${NC}"
echo -e "${YELLOW}NEON Platform - Docker Cleanup Script${NC}"
echo -e "${YELLOW}==============================================================================${NC}"
echo ""

# Check for flags
FORCE=false
REMOVE_ALL=false
NUCLEAR=false
for arg in "$@"; do
    case $arg in
        --force|-f)
            FORCE=true
            ;;
        --all|-a)
            REMOVE_ALL=true
            ;;
        --nuclear|-n)
            NUCLEAR=true
            REMOVE_ALL=true
            ;;
    esac
done

# Warning and confirmation
if [[ "$FORCE" != true ]]; then
    if [[ "$NUCLEAR" == true ]]; then
        echo -e "${RED}!!! NUCLEAR MODE - COMPLETE DOCKER RESET !!!${NC}"
        echo -e "${RED}WARNING: This will remove ALL Docker resources on this system:${NC}"
        echo "  - ALL containers (running and stopped)"
        echo "  - ALL images (including base images)"
        echo "  - ALL volumes (including data)"
        echo "  - ALL networks (except default)"
        echo "  - ALL build cache"
        echo ""
        echo -e "${MAGENTA}This is a complete Docker reset. All data will be lost!${NC}"
    else
        echo -e "${RED}WARNING: This will remove all NEON Docker resources:${NC}"
        echo "  - All NEON and docker_* containers"
        echo "  - All built images (api, web, garage)"
        echo "  - All volumes (postgres, redis, garage, caddy, etc.)"
        echo "  - NEON networks"
        if [[ "$REMOVE_ALL" == true ]]; then
            echo -e "  ${RED}- All base images (postgres, redis, livekit, etc.)${NC}"
        fi
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

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# =============================================================================
# NUCLEAR MODE - Complete Docker Reset
# =============================================================================
if [[ "$NUCLEAR" == true ]]; then
    echo -e "${MAGENTA}==============================================================================${NC}"
    echo -e "${MAGENTA}NUCLEAR MODE: Removing ALL Docker resources${NC}"
    echo -e "${MAGENTA}==============================================================================${NC}"
    echo ""

    # Step 1: Stop all running containers
    echo -e "${BLUE}Step 1: Stopping ALL running containers...${NC}"
    RUNNING=$(docker ps -q 2>/dev/null || true)
    if [[ -n "$RUNNING" ]]; then
        docker stop $RUNNING 2>/dev/null || true
        print_status "Stopped all running containers"
    else
        print_info "No running containers"
    fi

    # Step 2: Remove all containers
    echo ""
    echo -e "${BLUE}Step 2: Removing ALL containers...${NC}"
    ALL_CONTAINERS=$(docker ps -aq 2>/dev/null || true)
    if [[ -n "$ALL_CONTAINERS" ]]; then
        docker rm -f $ALL_CONTAINERS 2>/dev/null || true
        print_status "Removed all containers"
    else
        print_info "No containers to remove"
    fi

    # Step 3: Remove all volumes
    echo ""
    echo -e "${BLUE}Step 3: Removing ALL volumes...${NC}"
    ALL_VOLUMES=$(docker volume ls -q 2>/dev/null || true)
    if [[ -n "$ALL_VOLUMES" ]]; then
        docker volume rm -f $ALL_VOLUMES 2>/dev/null || true
        print_status "Removed all volumes"
    else
        print_info "No volumes to remove"
    fi

    # Step 4: Remove all images
    echo ""
    echo -e "${BLUE}Step 4: Removing ALL images...${NC}"
    ALL_IMAGES=$(docker images -q 2>/dev/null || true)
    if [[ -n "$ALL_IMAGES" ]]; then
        docker rmi -f $ALL_IMAGES 2>/dev/null || true
        print_status "Removed all images"
    else
        print_info "No images to remove"
    fi

    # Step 5: Remove all custom networks
    echo ""
    echo -e "${BLUE}Step 5: Removing ALL custom networks...${NC}"
    NETWORKS=$(docker network ls --filter "type=custom" -q 2>/dev/null || true)
    if [[ -n "$NETWORKS" ]]; then
        docker network rm $NETWORKS 2>/dev/null || true
        print_status "Removed all custom networks"
    else
        print_info "No custom networks to remove"
    fi

    # Step 6: Complete system prune
    echo ""
    echo -e "${BLUE}Step 6: Running complete system prune...${NC}"
    docker system prune -af --volumes 2>/dev/null || true
    print_status "System prune completed"

    # Step 7: Clear all build cache
    echo ""
    echo -e "${BLUE}Step 7: Clearing ALL build cache...${NC}"
    docker builder prune -af 2>/dev/null || true
    print_status "Build cache cleared"

    # Summary
    echo ""
    echo -e "${GREEN}==============================================================================${NC}"
    echo -e "${GREEN}Nuclear cleanup complete! Docker has been completely reset.${NC}"
    echo -e "${GREEN}==============================================================================${NC}"
    echo ""
    echo "To rebuild the NEON platform from scratch, run:"
    echo "  ./scripts/setup.sh"
    echo ""
    echo "Or manually:"
    echo "  cd docker && docker compose up -d --build"
    echo ""
    exit 0
fi

# =============================================================================
# STANDARD MODE - Project-specific cleanup
# =============================================================================

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
    "neon-caddy"
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
    "caddy"
    "livekit"
)

for vol in $ALL_VOLUMES; do
    for keyword in "${VOLUME_KEYWORDS[@]}"; do
        if [[ "$vol" == *"$keyword"* ]]; then
            docker volume rm -f "$vol" 2>/dev/null && print_status "Removed volume: $vol" || print_warning "Could not remove: $vol"
            break
        fi
    done
done

# Also try to remove volumes by exact docker-compose names
COMPOSE_VOLUMES=(
    "docker_postgres_data"
    "docker_redis_data"
    "docker_garage_data"
    "docker_garage_meta"
    "docker_caddy_data"
    "docker_caddy_config"
    "docker_egress_tmp"
)

for vol in "${COMPOSE_VOLUMES[@]}"; do
    docker volume rm -f "$vol" 2>/dev/null && print_status "Removed volume: $vol" || true
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
    "docker-garage*"
    "docker_api*"
    "docker_web*"
    "docker_garage*"
)

for pattern in "${IMAGE_PATTERNS[@]}"; do
    IMAGES=$(docker images --filter "reference=${pattern}" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
    if [[ -n "$IMAGES" ]]; then
        echo "$IMAGES" | while read -r image; do
            docker rmi -f "$image" 2>/dev/null && print_status "Removed image: $image" || true
        done
    fi
done

# Remove dangling images
echo ""
print_info "Removing dangling images..."
docker image prune -f 2>/dev/null || true

# Remove base images if --all flag is set
if [[ "$REMOVE_ALL" == true ]]; then
    echo ""
    print_info "Removing base images (--all flag)..."
    BASE_IMAGES=(
        "postgres:16-alpine"
        "postgres:15-alpine"
        "redis:7-alpine"
        "minio/minio:latest"
        "dxflrs/garage:v0.9.3"
        "livekit/livekit-server:v1.5"
        "livekit/livekit-server:v1.9"
        "livekit/egress:v1.8"
        "axllent/mailpit:latest"
        "caddy:2-alpine"
        "nginx:alpine"
        "node:20-alpine"
        "alpine:3.19"
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
    "docker-default"
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
echo "  ./scripts/setup.sh"
echo ""
echo "Or manually:"
echo "  cd docker && docker compose up -d --build"
echo ""
echo "For a completely fresh build with no cache:"
echo "  cd docker && docker compose build --no-cache && docker compose up -d"
echo ""
