#!/usr/bin/env bash
#
# NEON Setup Script
# Interactive onboarding for NEON collaboration platform
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
USE_BUILTIN_PROXY="true"
PROXY_TYPE=""
LIVEKIT_SEPARATE_DOMAIN="false"

# Helper functions
print_banner() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "  _   _ _____ ___  _   _ "
    echo " | \ | | ____/ _ \| \ | |"
    echo " |  \| |  _|| | | |  \| |"
    echo " | |\  | |__| |_| | |\  |"
    echo " |_| \_|_____\___/|_| \_|"
    echo ""
    echo -e "${NC}${BOLD}  Real-time Collaboration Platform${NC}"
    echo -e "  Setup Wizard v1.0"
    echo ""
}

print_step() {
    echo ""
    echo -e "${BLUE}${BOLD}[$1/${TOTAL_STEPS}]${NC} ${BOLD}$2${NC}"
    echo -e "${CYAN}────────────────────────────────────────${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ${NC}  $1"
}

print_success() {
    echo -e "${GREEN}✓${NC}  $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

print_error() {
    echo -e "${RED}✗${NC}  $1"
}

prompt() {
    local prompt_text="$1"
    local default_value="$2"
    local var_name="$3"

    if [ -n "$default_value" ]; then
        echo -ne "${BOLD}$prompt_text${NC} [${GREEN}$default_value${NC}]: "
    else
        echo -ne "${BOLD}$prompt_text${NC}: "
    fi

    read -r input
    if [ -z "$input" ] && [ -n "$default_value" ]; then
        eval "$var_name=\"$default_value\""
    else
        eval "$var_name=\"$input\""
    fi
}

prompt_yes_no() {
    local prompt_text="$1"
    local default="$2"
    local var_name="$3"

    local options
    if [ "$default" = "y" ]; then
        options="[${GREEN}Y${NC}/n]"
    else
        options="[y/${GREEN}N${NC}]"
    fi

    echo -ne "${BOLD}$prompt_text${NC} $options: "
    read -r input

    input=$(echo "$input" | tr '[:upper:]' '[:lower:]')

    if [ -z "$input" ]; then
        input="$default"
    fi

    if [ "$input" = "y" ] || [ "$input" = "yes" ]; then
        eval "$var_name=true"
    else
        eval "$var_name=false"
    fi
}

generate_secret() {
    local length="${1:-32}"
    openssl rand -hex "$length" 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w "$length" | head -n 1
}

generate_password() {
    local length="${1:-24}"
    openssl rand -base64 "$length" 2>/dev/null | tr -dc 'a-zA-Z0-9' | head -c "$length"
}

check_dependencies() {
    local missing=()

    if ! command -v docker &> /dev/null; then
        missing+=("docker")
    fi

    if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
        missing+=("docker-compose")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        print_error "Missing required dependencies: ${missing[*]}"
        echo ""
        echo "Please install Docker and Docker Compose before running this script."
        echo "  - Docker: https://docs.docker.com/get-docker/"
        echo "  - Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
}

# Total steps for progress indicator
TOTAL_STEPS=6

#
# MAIN SCRIPT
#

print_banner

echo "Welcome to the NEON setup wizard!"
echo "This script will help you configure your NEON installation."
echo ""
print_info "Press Enter to accept default values shown in [green]."
echo ""

# Check dependencies
print_info "Checking dependencies..."
check_dependencies
print_success "All dependencies found."

# Step 1: Domain Configuration
print_step 1 "Domain Configuration"

echo "NEON requires a domain name for secure access."
echo ""

prompt "Enter your main domain (e.g., neon.example.com)" "" DOMAIN

if [ -z "$DOMAIN" ]; then
    print_error "Domain is required."
    exit 1
fi

# Validate domain format
if ! echo "$DOMAIN" | grep -qE '^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'; then
    print_warning "Domain format may be invalid. Continuing anyway..."
fi

# Extract base domain for LiveKit default
BASE_DOMAIN=$(echo "$DOMAIN" | sed 's/^[^.]*\.//')
if [ "$BASE_DOMAIN" = "$DOMAIN" ]; then
    BASE_DOMAIN="$DOMAIN"
fi

echo ""
print_info "LiveKit (video/audio) can run on the same domain or a separate subdomain."

prompt_yes_no "Use separate subdomain for LiveKit?" "y" LIVEKIT_SEPARATE_DOMAIN

if [ "$LIVEKIT_SEPARATE_DOMAIN" = "true" ]; then
    prompt "Enter LiveKit domain" "livekit.$BASE_DOMAIN" LIVEKIT_DOMAIN
else
    LIVEKIT_DOMAIN="$DOMAIN"
    print_info "LiveKit will be accessible at: $DOMAIN/livekit"
fi

print_success "Domains configured:"
echo "    Main app:  https://$DOMAIN"
if [ "$LIVEKIT_SEPARATE_DOMAIN" = "true" ]; then
    echo "    LiveKit:   https://$LIVEKIT_DOMAIN"
fi

# Step 2: Organization Setup
print_step 2 "Organization Setup"

prompt "Organization name" "My Organization" ORG_NAME
prompt "Admin email" "admin@$BASE_DOMAIN" ADMIN_EMAIL
prompt "Admin username" "admin" ADMIN_USERNAME

echo ""
print_info "Generating secure admin password..."
ADMIN_PASSWORD=$(generate_password 16)
print_success "Admin password generated (will be shown at the end)."

# Step 3: SSL/Reverse Proxy Configuration
print_step 3 "SSL & Reverse Proxy Configuration"

echo "NEON includes a built-in reverse proxy (Caddy) with automatic"
echo "Let's Encrypt SSL certificates. This is the easiest option."
echo ""

prompt_yes_no "Use built-in reverse proxy with auto SSL?" "y" USE_BUILTIN_PROXY

if [ "$USE_BUILTIN_PROXY" = "false" ]; then
    echo ""
    print_info "You'll need to configure your own reverse proxy."
    echo ""
    echo "Select your reverse proxy for config generation:"
    echo "  1) Nginx"
    echo "  2) Caddy"
    echo "  3) HAProxy"
    echo "  4) Traefik"
    echo "  5) Apache"
    echo "  6) Skip (I'll configure manually)"
    echo ""

    prompt "Enter choice" "1" PROXY_CHOICE

    case "$PROXY_CHOICE" in
        1) PROXY_TYPE="nginx" ;;
        2) PROXY_TYPE="caddy" ;;
        3) PROXY_TYPE="haproxy" ;;
        4) PROXY_TYPE="traefik" ;;
        5) PROXY_TYPE="apache" ;;
        *) PROXY_TYPE="manual" ;;
    esac

    if [ "$PROXY_TYPE" != "manual" ]; then
        print_success "Will generate $PROXY_TYPE configuration."
    fi
fi

# Step 4: Database Configuration
print_step 4 "Database & Storage Configuration"

print_info "Generating secure credentials for all services..."
echo ""

# PostgreSQL
DB_PASSWORD=$(generate_password 32)
print_success "PostgreSQL password generated."

# Redis
REDIS_PASSWORD=$(generate_password 32)
print_success "Redis password generated."

# JWT Secrets
JWT_SECRET=$(generate_secret 64)
JWT_REFRESH_SECRET=$(generate_secret 64)
print_success "JWT secrets generated."

# LiveKit Credentials
LIVEKIT_API_KEY="API$(generate_secret 12 | tr '[:lower:]' '[:upper:]')"
LIVEKIT_API_SECRET=$(generate_secret 32)
print_success "LiveKit credentials generated."

# S3/Garage Storage Credentials
S3_ACCESS_KEY="NEON$(generate_secret 16 | tr '[:lower:]' '[:upper:]')"
S3_SECRET_KEY=$(generate_secret 40)
S3_BUCKET="neon-storage"
print_success "S3 storage credentials generated."

# Encryption Key
ENCRYPTION_KEY=$(generate_secret 32)
print_success "Encryption key generated."

# Session Secret
SESSION_SECRET=$(generate_secret 32)
print_success "Session secret generated."

# Step 5: Advanced Options
print_step 5 "Advanced Options"

prompt_yes_no "Enable federation (cross-instance communication)?" "n" ENABLE_FEDERATION
prompt_yes_no "Enable email notifications?" "n" ENABLE_EMAIL

if [ "$ENABLE_EMAIL" = "true" ]; then
    echo ""
    prompt "SMTP host" "smtp.example.com" SMTP_HOST
    prompt "SMTP port" "587" SMTP_PORT
    prompt "SMTP username" "" SMTP_USER
    prompt "SMTP password" "" SMTP_PASS
    prompt "From email address" "neon@$BASE_DOMAIN" SMTP_FROM
fi

# Step 6: Generate Configuration Files
print_step 6 "Generating Configuration Files"

# Create directories
mkdir -p "$PROJECT_ROOT/docker/configs"
mkdir -p "$PROJECT_ROOT/apps/api"
mkdir -p "$PROJECT_ROOT/apps/web"

# Generate API .env file
print_info "Creating API environment file..."
cat > "$PROJECT_ROOT/apps/api/.env" << EOF
# NEON API Configuration
# Generated by setup script on $(date)

# Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Domain
DOMAIN=$DOMAIN
APP_URL=https://$DOMAIN
CORS_ORIGINS=https://$DOMAIN

# Database
DATABASE_URL=postgresql://neon:${DB_PASSWORD}@postgres:5432/neon?schema=public

# Redis
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# JWT Authentication
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# LiveKit
LIVEKIT_URL=wss://$LIVEKIT_DOMAIN
LIVEKIT_API_URL=https://$LIVEKIT_DOMAIN
LIVEKIT_API_KEY=$LIVEKIT_API_KEY
LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET

# S3 Storage (Garage)
S3_ENDPOINT=http://garage:3900
S3_REGION=garage
S3_BUCKET=$S3_BUCKET
S3_ACCESS_KEY=$S3_ACCESS_KEY
S3_SECRET_KEY=$S3_SECRET_KEY

# Encryption
ENCRYPTION_KEY=$ENCRYPTION_KEY

# Session
SESSION_SECRET=$SESSION_SECRET

# Admin
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Organization
ORG_NAME=$ORG_NAME

# Federation
FEDERATION_ENABLED=$ENABLE_FEDERATION

# Email
EMAIL_ENABLED=$ENABLE_EMAIL
EOF

if [ "$ENABLE_EMAIL" = "true" ]; then
    cat >> "$PROJECT_ROOT/apps/api/.env" << EOF
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_FROM
EOF
fi

print_success "API environment file created."

# Generate Web .env file
print_info "Creating Web environment file..."
cat > "$PROJECT_ROOT/apps/web/.env" << EOF
# NEON Web Client Configuration
# Generated by setup script on $(date)

VITE_APP_NAME=NEON
VITE_API_URL=https://$DOMAIN/api
VITE_WS_URL=wss://$DOMAIN
VITE_LIVEKIT_URL=wss://$LIVEKIT_DOMAIN
EOF
print_success "Web environment file created."

# Generate Docker environment file
print_info "Creating Docker environment file..."
cat > "$PROJECT_ROOT/docker/.env" << EOF
# NEON Docker Configuration
# Generated by setup script on $(date)

# Domains
DOMAIN=$DOMAIN
LIVEKIT_DOMAIN=$LIVEKIT_DOMAIN

# PostgreSQL
POSTGRES_USER=neon
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=neon

# Redis
REDIS_PASSWORD=$REDIS_PASSWORD

# LiveKit
LIVEKIT_API_KEY=$LIVEKIT_API_KEY
LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET

# Garage S3
GARAGE_ADMIN_TOKEN=$(generate_secret 32)
S3_ACCESS_KEY=$S3_ACCESS_KEY
S3_SECRET_KEY=$S3_SECRET_KEY
S3_BUCKET=$S3_BUCKET

# Admin
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
print_success "Docker environment file created."

# Generate LiveKit config
print_info "Creating LiveKit configuration..."
cat > "$PROJECT_ROOT/docker/configs/livekit.yaml" << EOF
# LiveKit Server Configuration
# Generated by setup script

port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  tcp_port: 7881

redis:
  address: redis:6379
  password: $REDIS_PASSWORD

keys:
  $LIVEKIT_API_KEY: $LIVEKIT_API_SECRET

logging:
  level: info
  json: true

room:
  auto_create: true
  empty_timeout: 300
  max_participants: 100
EOF
print_success "LiveKit configuration created."

# Generate Garage config
print_info "Creating Garage S3 configuration..."
cat > "$PROJECT_ROOT/docker/configs/garage.toml" << EOF
# Garage S3-compatible Storage Configuration
# Generated by setup script

metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"

replication_mode = "none"

rpc_bind_addr = "[::]:3901"
rpc_public_addr = "garage:3901"
rpc_secret = "$(generate_secret 32)"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage.localhost"

[s3_web]
bind_addr = "[::]:3902"
root_domain = ".web.garage.localhost"

[admin]
api_bind_addr = "[::]:3903"
EOF
print_success "Garage configuration created."

# Generate appropriate Docker Compose file
if [ "$USE_BUILTIN_PROXY" = "true" ]; then
    print_info "Creating Docker Compose with built-in proxy..."
    cat > "$PROJECT_ROOT/docker/docker-compose.yml" << 'EOF'
version: '3.8'

services:
  # Caddy Reverse Proxy with Auto SSL
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./configs/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api
      - web
      - livekit
    networks:
      - neon

  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - neon

  # Redis Cache
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - neon

  # LiveKit Server
  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    command: --config /etc/livekit.yaml
    volumes:
      - ./configs/livekit.yaml:/etc/livekit.yaml:ro
    ports:
      - "7881:7881"
      - "50000-50100:50000-50100/udp"
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - neon

  # Garage S3 Storage
  garage:
    image: dxflrs/garage:v0.9.0
    restart: unless-stopped
    volumes:
      - ./configs/garage.toml:/etc/garage.toml:ro
      - garage_meta:/var/lib/garage/meta
      - garage_data:/var/lib/garage/data
    command: -c /etc/garage.toml server
    networks:
      - neon

  # NEON API Server
  api:
    build:
      context: ../
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    env_file:
      - ../apps/api/.env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      garage:
        condition: service_started
    networks:
      - neon

  # NEON Web Client
  web:
    build:
      context: ../
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    env_file:
      - ../apps/web/.env
    networks:
      - neon

volumes:
  caddy_data:
  caddy_config:
  postgres_data:
  redis_data:
  garage_meta:
  garage_data:

networks:
  neon:
    driver: bridge
EOF
    print_success "Docker Compose file created."

    # Generate Caddyfile
    print_info "Creating Caddyfile..."
    if [ "$LIVEKIT_SEPARATE_DOMAIN" = "true" ]; then
        cat > "$PROJECT_ROOT/docker/configs/Caddyfile" << EOF
# NEON Caddyfile
# Auto-generated SSL with Let's Encrypt

$DOMAIN {
    # API routes
    handle /api/* {
        reverse_proxy api:3001
    }

    # WebSocket
    handle /socket.io/* {
        reverse_proxy api:3001
    }

    # Web client (default)
    handle {
        reverse_proxy web:80
    }

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}

$LIVEKIT_DOMAIN {
    reverse_proxy livekit:7880

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}
EOF
    else
        cat > "$PROJECT_ROOT/docker/configs/Caddyfile" << EOF
# NEON Caddyfile
# Auto-generated SSL with Let's Encrypt

$DOMAIN {
    # API routes
    handle /api/* {
        reverse_proxy api:3001
    }

    # WebSocket
    handle /socket.io/* {
        reverse_proxy api:3001
    }

    # LiveKit
    handle /livekit/* {
        uri strip_prefix /livekit
        reverse_proxy livekit:7880
    }

    # Web client (default)
    handle {
        reverse_proxy web:80
    }

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}
EOF
    fi
    print_success "Caddyfile created."

else
    # Generate Docker Compose without proxy
    print_info "Creating Docker Compose without built-in proxy..."
    cat > "$PROJECT_ROOT/docker/docker-compose.yml" << 'EOF'
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - neon

  # Redis Cache
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - neon

  # LiveKit Server
  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    command: --config /etc/livekit.yaml
    volumes:
      - ./configs/livekit.yaml:/etc/livekit.yaml:ro
    ports:
      - "7880:7880"
      - "7881:7881"
      - "50000-50100:50000-50100/udp"
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - neon

  # Garage S3 Storage
  garage:
    image: dxflrs/garage:v0.9.0
    restart: unless-stopped
    volumes:
      - ./configs/garage.toml:/etc/garage.toml:ro
      - garage_meta:/var/lib/garage/meta
      - garage_data:/var/lib/garage/data
    command: -c /etc/garage.toml server
    networks:
      - neon

  # NEON API Server
  api:
    build:
      context: ../
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    ports:
      - "3001:3001"
    env_file:
      - ../apps/api/.env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      garage:
        condition: service_started
    networks:
      - neon

  # NEON Web Client
  web:
    build:
      context: ../
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    ports:
      - "3000:80"
    env_file:
      - ../apps/web/.env
    networks:
      - neon

volumes:
  postgres_data:
  redis_data:
  garage_meta:
  garage_data:

networks:
  neon:
    driver: bridge
EOF
    print_success "Docker Compose file created."
fi

# Generate reverse proxy configs if needed
if [ "$USE_BUILTIN_PROXY" = "false" ] && [ "$PROXY_TYPE" != "manual" ]; then
    print_info "Generating $PROXY_TYPE configuration..."

    mkdir -p "$PROJECT_ROOT/docker/proxy-configs"

    "$SCRIPT_DIR/generate-proxy-config.sh" "$PROXY_TYPE" "$DOMAIN" "$LIVEKIT_DOMAIN" "$LIVEKIT_SEPARATE_DOMAIN"

    print_success "Proxy configuration generated at: docker/proxy-configs/"
fi

# Summary
echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}                    SETUP COMPLETE!                          ${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Configuration Summary:${NC}"
echo ""
echo -e "  ${CYAN}Domains:${NC}"
echo "    Main App:     https://$DOMAIN"
if [ "$LIVEKIT_SEPARATE_DOMAIN" = "true" ]; then
echo "    LiveKit:      https://$LIVEKIT_DOMAIN"
fi
echo ""
echo -e "  ${CYAN}Admin Credentials:${NC}"
echo "    Email:        $ADMIN_EMAIL"
echo "    Username:     $ADMIN_USERNAME"
echo -e "    Password:     ${YELLOW}$ADMIN_PASSWORD${NC}"
echo ""
echo -e "  ${RED}${BOLD}⚠ SAVE THESE CREDENTIALS! They won't be shown again.${NC}"
echo ""
echo -e "${BOLD}Next Steps:${NC}"
echo ""

if [ "$USE_BUILTIN_PROXY" = "true" ]; then
echo "  1. Make sure your domain(s) point to this server:"
echo "     - $DOMAIN -> $(curl -s ifconfig.me 2>/dev/null || echo '<your-server-ip>')"
if [ "$LIVEKIT_SEPARATE_DOMAIN" = "true" ]; then
echo "     - $LIVEKIT_DOMAIN -> $(curl -s ifconfig.me 2>/dev/null || echo '<your-server-ip>')"
fi
echo ""
echo "  2. Start NEON:"
echo -e "     ${CYAN}cd docker && docker compose up -d${NC}"
echo ""
echo "  3. Initialize the database:"
echo -e "     ${CYAN}docker compose exec api npm run db:migrate${NC}"
echo -e "     ${CYAN}docker compose exec api npm run db:seed${NC}"
echo ""
echo "  4. Access NEON at: https://$DOMAIN"
else
echo "  1. Configure your reverse proxy using the generated config:"
echo -e "     ${CYAN}cat docker/proxy-configs/${PROXY_TYPE}.conf${NC}"
echo ""
echo "  2. Make sure ports are accessible:"
echo "     - API:      localhost:3001"
echo "     - Web:      localhost:3000"
echo "     - LiveKit:  localhost:7880"
echo ""
echo "  3. Start NEON:"
echo -e "     ${CYAN}cd docker && docker compose up -d${NC}"
echo ""
echo "  4. Initialize the database:"
echo -e "     ${CYAN}docker compose exec api npm run db:migrate${NC}"
echo -e "     ${CYAN}docker compose exec api npm run db:seed${NC}"
fi
echo ""
echo -e "${GREEN}${BOLD}Happy collaborating!${NC}"
echo ""
