#!/usr/bin/env bash
#
# NEON Docker Smoke Test
# Tests that the Docker setup builds and runs correctly
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}  NEON Docker Smoke Test${NC}"
    echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_test() {
    echo -ne "  ${BOLD}Testing:${NC} $1... "
}

pass() {
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}FAIL${NC}"
    if [ -n "$1" ]; then
        echo -e "    ${RED}Error: $1${NC}"
    fi
    ((TESTS_FAILED++))
}

warn() {
    echo -e "${YELLOW}WARN${NC}"
    if [ -n "$1" ]; then
        echo -e "    ${YELLOW}Warning: $1${NC}"
    fi
}

cleanup() {
    echo ""
    echo -e "${CYAN}Cleaning up...${NC}"
    cd "$DOCKER_DIR"
    docker compose down -v 2>/dev/null || true
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

print_header

# Check prerequisites
echo -e "${BOLD}Checking prerequisites...${NC}"
echo ""

print_test "Docker is installed"
if command -v docker &>/dev/null; then
    pass
else
    fail "Docker not found"
    exit 1
fi

print_test "Docker Compose is available"
if docker compose version &>/dev/null; then
    pass
else
    fail "Docker Compose not found"
    exit 1
fi

print_test "Docker daemon is running"
if docker info &>/dev/null; then
    pass
else
    fail "Docker daemon not running"
    exit 1
fi

# Check configuration files
echo ""
echo -e "${BOLD}Checking configuration files...${NC}"
echo ""

print_test "docker-compose.yml exists"
if [ -f "$DOCKER_DIR/docker-compose.yml" ]; then
    pass
elif [ -f "$DOCKER_DIR/docker-compose.yml.example" ]; then
    echo -ne "${YELLOW}copying from example${NC}... "
    cp "$DOCKER_DIR/docker-compose.yml.example" "$DOCKER_DIR/docker-compose.yml"
    pass
else
    fail "No docker-compose.yml or docker-compose.yml.example found"
    exit 1
fi

print_test "docker-compose.yml is valid"
cd "$DOCKER_DIR"
if docker compose config > /dev/null 2>&1; then
    pass
else
    fail "Invalid docker-compose.yml syntax"
    exit 1
fi

print_test "Dockerfile.api exists"
if [ -f "$DOCKER_DIR/Dockerfile.api" ]; then
    pass
else
    fail "Dockerfile.api not found"
fi

print_test "Dockerfile.web exists"
if [ -f "$DOCKER_DIR/Dockerfile.web" ]; then
    pass
else
    fail "Dockerfile.web not found"
fi

# Check for common configuration issues
echo ""
echo -e "${BOLD}Checking for common configuration issues...${NC}"
echo ""

print_test "Healthcheck tools in API Dockerfile"
if grep -q "wget\|curl" "$DOCKER_DIR/Dockerfile.api"; then
    pass
else
    fail "Neither wget nor curl found in Dockerfile.api (required for healthchecks)"
fi

print_test "VITE_API_URL uses browser-accessible URL"
if grep -q 'VITE_API_URL.*http://api:' "$DOCKER_DIR/docker-compose.yml" 2>/dev/null; then
    fail "VITE_API_URL uses Docker internal hostname 'api:' - browsers cannot resolve this"
elif grep -q 'VITE_API_URL.*localhost\|VITE_API_URL.*127.0.0.1\|VITE_API_URL.*https://' "$DOCKER_DIR/docker-compose.yml" 2>/dev/null; then
    pass
else
    warn "Could not verify VITE_API_URL configuration"
fi

print_test "SEED_DATABASE defaults to true"
if grep -q 'SEED_DATABASE.*true' "$DOCKER_DIR/docker-compose.yml" 2>/dev/null; then
    pass
else
    warn "SEED_DATABASE may not default to true - admin user might not be created"
fi

# Build test
echo ""
echo -e "${BOLD}Building Docker images...${NC}"
echo ""

print_test "Docker images build successfully"
cd "$DOCKER_DIR"
if docker compose build 2>&1 | tail -5; then
    pass
else
    fail "Docker build failed"
    exit 1
fi

# Start infrastructure
echo ""
echo -e "${BOLD}Starting infrastructure services...${NC}"
echo ""

docker compose up -d postgres redis

print_test "PostgreSQL starts"
RETRIES=30
while [ $RETRIES -gt 0 ]; do
    if docker compose exec -T postgres pg_isready -U neon -d neon &>/dev/null; then
        pass
        break
    fi
    ((RETRIES--))
    sleep 2
done
if [ $RETRIES -eq 0 ]; then
    fail "PostgreSQL did not become ready"
fi

print_test "Redis starts"
RETRIES=15
while [ $RETRIES -gt 0 ]; do
    if docker compose exec -T redis redis-cli -a neon_redis_dev ping 2>/dev/null | grep -q PONG; then
        pass
        break
    fi
    ((RETRIES--))
    sleep 2
done
if [ $RETRIES -eq 0 ]; then
    fail "Redis did not become ready"
fi

# Start API
echo ""
echo -e "${BOLD}Starting API service...${NC}"
echo ""

docker compose up -d api

print_test "API container starts"
RETRIES=60
while [ $RETRIES -gt 0 ]; do
    if docker compose ps api 2>/dev/null | grep -q "Up"; then
        pass
        break
    fi
    ((RETRIES--))
    sleep 3
done
if [ $RETRIES -eq 0 ]; then
    fail "API container did not start"
    docker compose logs api --tail=50
fi

print_test "API healthcheck passes"
RETRIES=60
while [ $RETRIES -gt 0 ]; do
    if curl -sf http://localhost:3001/health &>/dev/null; then
        pass
        break
    fi
    ((RETRIES--))
    sleep 3
done
if [ $RETRIES -eq 0 ]; then
    fail "API healthcheck did not pass"
    docker compose logs api --tail=50
fi

print_test "API /api/status/init endpoint works"
if curl -sf http://localhost:3001/api/status/init &>/dev/null; then
    pass
else
    fail "API /api/status/init endpoint failed"
fi

# Start Web
echo ""
echo -e "${BOLD}Starting Web service...${NC}"
echo ""

docker compose up -d web

print_test "Web container starts"
RETRIES=30
while [ $RETRIES -gt 0 ]; do
    if docker compose ps web 2>/dev/null | grep -q "Up"; then
        pass
        break
    fi
    ((RETRIES--))
    sleep 2
done
if [ $RETRIES -eq 0 ]; then
    fail "Web container did not start"
    docker compose logs web --tail=50
fi

print_test "Web is accessible on port 3000"
RETRIES=30
while [ $RETRIES -gt 0 ]; do
    if curl -sf http://localhost:3000 &>/dev/null; then
        pass
        break
    fi
    ((RETRIES--))
    sleep 2
done
if [ $RETRIES -eq 0 ]; then
    fail "Web not accessible on port 3000"
    docker compose logs web --tail=50
fi

# Summary
echo ""
echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Test Summary${NC}"
echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC} $TESTS_PASSED"
echo -e "  ${RED}Failed:${NC} $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}${BOLD}All smoke tests passed!${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}Some tests failed. Please review the errors above.${NC}"
    exit 1
fi
