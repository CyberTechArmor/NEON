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

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    elif [ -f /etc/debian_version ]; then
        OS="debian"
    elif [ -f /etc/redhat-release ]; then
        OS="rhel"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        OS="unknown"
    fi
}

install_docker() {
    print_info "Installing Docker..."
    echo ""

    detect_os

    case "$OS" in
        ubuntu|debian|pop|linuxmint)
            echo "  Detected: $OS"
            echo "  Installing Docker via official script..."
            echo ""

            # Install prerequisites
            sudo apt-get update
            sudo apt-get install -y ca-certificates curl gnupg

            # Use Docker's convenience script
            curl -fsSL https://get.docker.com | sudo sh

            # Start and enable Docker service
            sudo systemctl start docker
            sudo systemctl enable docker

            # Add current user to docker group
            sudo usermod -aG docker "$USER"

            print_success "Docker installed successfully."
            ;;

        fedora|rhel|centos|rocky|alma)
            echo "  Detected: $OS"
            echo "  Installing Docker via official script..."
            echo ""

            # Use Docker's convenience script
            curl -fsSL https://get.docker.com | sudo sh

            # Start and enable Docker
            sudo systemctl start docker
            sudo systemctl enable docker

            # Add current user to docker group
            sudo usermod -aG docker "$USER"

            print_success "Docker installed successfully."
            ;;

        arch|manjaro|endeavouros)
            echo "  Detected: $OS"
            echo "  Installing Docker via pacman..."
            echo ""

            sudo pacman -Sy --noconfirm docker docker-compose
            sudo systemctl start docker
            sudo systemctl enable docker
            sudo usermod -aG docker "$USER"

            print_success "Docker installed successfully."
            ;;

        opensuse*|sles)
            echo "  Detected: $OS"
            echo "  Installing Docker via zypper..."
            echo ""

            sudo zypper install -y docker docker-compose
            sudo systemctl start docker
            sudo systemctl enable docker
            sudo usermod -aG docker "$USER"

            print_success "Docker installed successfully."
            ;;

        macos)
            echo "  Detected: macOS"
            echo ""
            print_error "Please install Docker Desktop for Mac manually:"
            echo "    https://docs.docker.com/desktop/install/mac-install/"
            echo ""
            echo "  After installing, run this script again."
            exit 1
            ;;

        *)
            print_error "Unsupported operating system: $OS"
            echo ""
            echo "Please install Docker manually:"
            echo "  https://docs.docker.com/get-docker/"
            echo ""
            echo "  After installing, run this script again."
            exit 1
            ;;
    esac

    # Refresh shell's command hash table
    hash -r 2>/dev/null || true
}

check_docker_compose() {
    # Check for docker compose (v2) or docker-compose (v1)
    if docker compose version &>/dev/null 2>&1; then
        return 0
    elif command -v docker-compose &>/dev/null; then
        return 0
    else
        return 1
    fi
}

check_dependencies() {
    local docker_missing=false
    local compose_missing=false
    local docker_installed=false

    # Check if docker command exists
    if ! command -v docker &>/dev/null; then
        docker_missing=true
    fi

    if [ "$docker_missing" = true ]; then
        print_warning "Docker is not installed."
        echo ""
        prompt_yes_no "Would you like to install Docker now?" "y" INSTALL_DOCKER

        if [ "$INSTALL_DOCKER" = true ]; then
            install_docker
            docker_installed=true

            # Refresh path
            hash -r 2>/dev/null || true
            export PATH="/usr/bin:/usr/local/bin:$PATH"

            # Verify docker binary exists
            if ! command -v docker &>/dev/null; then
                print_error "Docker installation failed - docker command not found."
                echo ""
                echo "Please install Docker manually: https://docs.docker.com/get-docker/"
                exit 1
            fi

            print_success "Docker command found."

            # Check if docker daemon is running
            echo ""
            print_info "Checking Docker service..."

            if ! sudo docker info &>/dev/null; then
                print_warning "Docker daemon not responding. Starting Docker service..."
                sudo systemctl start docker || true
                sleep 3
            fi

            # Verify docker is working (using sudo since user might not have group perms yet)
            if sudo docker ps &>/dev/null; then
                print_success "Docker is running."
            else
                print_error "Docker service is not running properly."
                echo ""
                echo "Try manually:"
                echo "  sudo systemctl start docker"
                echo "  sudo systemctl status docker"
                exit 1
            fi

            # Check if current user can run docker without sudo
            if ! docker ps &>/dev/null 2>&1; then
                print_warning "Docker requires sudo or group membership."
                echo ""
                echo "Your user has been added to the 'docker' group."
                echo "To apply this change, you have two options:"
                echo ""
                echo "  Option 1: Log out and back in, then run:"
                echo "            ./scripts/setup.sh"
                echo ""
                echo "  Option 2: Run this command now:"
                echo "            newgrp docker"
                echo "            ./scripts/setup.sh"
                echo ""
                prompt_yes_no "Continue with sudo for now? (not recommended for production)" "n" USE_SUDO_DOCKER

                if [ "$USE_SUDO_DOCKER" = true ]; then
                    DOCKER_CMD="sudo docker"
                    DOCKER_COMPOSE_CMD="sudo docker compose"
                    print_warning "Using sudo for Docker commands."
                else
                    exit 0
                fi
            else
                DOCKER_CMD="docker"
                print_success "Docker is accessible without sudo."
            fi
        else
            print_error "Docker is required to run NEON."
            echo ""
            echo "Install Docker manually: https://docs.docker.com/get-docker/"
            exit 1
        fi
    else
        # Docker exists, check if it's running
        if ! docker info &>/dev/null 2>&1; then
            if ! sudo docker info &>/dev/null 2>&1; then
                print_warning "Docker is installed but not running."
                echo ""
                print_info "Starting Docker service..."
                sudo systemctl start docker || true
                sleep 2

                if ! sudo docker info &>/dev/null; then
                    print_error "Failed to start Docker service."
                    echo "Try: sudo systemctl start docker"
                    exit 1
                fi
            fi

            # Docker running but user needs sudo
            if ! docker ps &>/dev/null 2>&1; then
                print_warning "Docker requires sudo. Add your user to the docker group:"
                echo "  sudo usermod -aG docker \$USER"
                echo "  Then log out and back in."
                echo ""
                prompt_yes_no "Continue with sudo for now?" "y" USE_SUDO_DOCKER

                if [ "$USE_SUDO_DOCKER" = true ]; then
                    DOCKER_CMD="sudo docker"
                    DOCKER_COMPOSE_CMD="sudo docker compose"
                else
                    exit 0
                fi
            else
                DOCKER_CMD="docker"
            fi
        else
            DOCKER_CMD="docker"
            print_success "Docker is installed and running."
        fi
    fi

    # Check for Docker Compose
    if [ -z "$DOCKER_COMPOSE_CMD" ]; then
        if docker compose version &>/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="docker compose"
        elif sudo docker compose version &>/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="sudo docker compose"
        elif command -v docker-compose &>/dev/null; then
            DOCKER_COMPOSE_CMD="docker-compose"
        else
            print_error "Docker Compose is not available."
            echo ""
            echo "Docker Compose should be included with Docker. Try:"
            echo "  - Update Docker: sudo apt-get update && sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
            echo "  - Or install separately: sudo apt-get install docker-compose-plugin"
            exit 1
        fi
    fi

    print_success "Docker Compose is available."

    # Export for use later in script
    export DOCKER_CMD
    export DOCKER_COMPOSE_CMD
}

# Total steps for progress indicator
TOTAL_STEPS=8

#
# MAIN SCRIPT
#

print_banner

echo "Welcome to the NEON setup wizard!"
echo "This script will help you configure your NEON installation."
echo ""
print_info "Press Enter to accept default values shown in [green]."
echo ""

# Check dependencies (will install Docker if missing)
print_info "Checking dependencies..."
echo ""
check_dependencies
echo ""

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

BIND_ADDRESS="127.0.0.1"

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

    echo ""
    print_info "By default, services bind to 127.0.0.1 (localhost only)."
    print_info "If your reverse proxy is on a different machine, you may need to bind to 0.0.0.0 or a specific IP."
    echo ""
    prompt_yes_no "Bind services to a different IP address?" "n" CUSTOM_BIND

    if [ "$CUSTOM_BIND" = "true" ]; then
        echo ""
        echo "  Common options:"
        echo "    127.0.0.1  - Localhost only (most secure, same machine)"
        echo "    0.0.0.0    - All interfaces (required for external proxy)"
        echo "    <IP>       - Specific interface IP"
        echo ""
        prompt "Enter bind address" "0.0.0.0" BIND_ADDRESS
        print_success "Services will bind to: $BIND_ADDRESS"
    else
        print_info "Services will bind to: $BIND_ADDRESS (localhost)"
    fi
fi

# Step 4: Database Configuration
print_step 4 "Database Configuration"

print_info "Generating secure credentials for database services..."
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

# Encryption Key
ENCRYPTION_KEY=$(generate_secret 32)
print_success "Encryption key generated."

# Session Secret
SESSION_SECRET=$(generate_secret 32)
print_success "Session secret generated."

# Step 5: S3 Storage Configuration
print_step 5 "S3 Storage Configuration"

echo "NEON requires S3-compatible object storage for file uploads,"
echo "attachments, and media storage."
echo ""
echo "Choose your S3 storage option:"
echo ""
echo "  1) Built-in Garage (recommended for self-hosted)"
echo "     - Lightweight S3-compatible storage included with NEON"
echo "     - No external services required"
echo ""
echo "  2) External S3 service (AWS S3, Wasabi, Backblaze, etc.)"
echo "     - Configure connection via environment variables"
echo "     - Includes options for path-style and SSL settings"
echo ""
echo "  3) Frontend-configurable (admin settings)"
echo "     - Configure S3 settings from the web admin panel"
echo "     - Flexible for multi-tenant or changing configurations"
echo ""

prompt "Enter choice" "1" S3_CHOICE

case "$S3_CHOICE" in
    1)
        S3_MODE="builtin"
        print_success "Using built-in Garage S3 storage."
        echo ""
        print_info "Generating Garage credentials..."
        S3_ACCESS_KEY="NEON$(generate_secret 16 | tr '[:lower:]' '[:upper:]')"
        S3_SECRET_KEY=$(generate_secret 40)
        S3_BUCKET="neon-storage"
        S3_ENDPOINT="http://garage:3900"
        S3_REGION="garage"
        S3_FORCE_PATH_STYLE="true"
        S3_IGNORE_SSL="false"
        print_success "Garage credentials generated."
        ;;
    2)
        S3_MODE="external"
        print_info "Configure your external S3 service:"
        echo ""
        prompt "S3 Endpoint URL (e.g., https://s3.amazonaws.com)" "" S3_ENDPOINT
        prompt "S3 Region (e.g., us-east-1)" "us-east-1" S3_REGION
        prompt "S3 Bucket name" "neon-storage" S3_BUCKET
        prompt "S3 Access Key ID" "" S3_ACCESS_KEY
        prompt "S3 Secret Access Key" "" S3_SECRET_KEY
        echo ""
        print_info "Advanced S3 options:"
        prompt_yes_no "Use path-style URLs? (required for MinIO, Garage, some S3-compatible)" "n" S3_FORCE_PATH_STYLE
        prompt_yes_no "Ignore SSL certificate errors? (not recommended for production)" "n" S3_IGNORE_SSL
        print_success "External S3 configured."
        ;;
    3)
        S3_MODE="frontend"
        print_info "S3 will be configured from the admin panel after installation."
        echo ""
        print_warning "Note: File uploads will not work until S3 is configured in admin settings."
        echo ""
        # Set placeholder values
        S3_ACCESS_KEY=""
        S3_SECRET_KEY=""
        S3_BUCKET="neon-storage"
        S3_ENDPOINT=""
        S3_REGION=""
        S3_FORCE_PATH_STYLE="true"
        S3_IGNORE_SSL="false"
        print_success "Frontend S3 configuration enabled."
        ;;
    *)
        print_warning "Invalid choice. Using built-in Garage."
        S3_MODE="builtin"
        S3_ACCESS_KEY="NEON$(generate_secret 16 | tr '[:lower:]' '[:upper:]')"
        S3_SECRET_KEY=$(generate_secret 40)
        S3_BUCKET="neon-storage"
        S3_ENDPOINT="http://garage:3900"
        S3_REGION="garage"
        S3_FORCE_PATH_STYLE="true"
        S3_IGNORE_SSL="false"
        ;;
esac

# Step 6: Advanced Options
print_step 6 "Advanced Options"

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

# Step 7: Generate Configuration Files
print_step 7 "Generating Configuration Files"

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

# S3 Storage Configuration
S3_MODE=$S3_MODE
S3_ENDPOINT=$S3_ENDPOINT
S3_REGION=$S3_REGION
S3_BUCKET=$S3_BUCKET
S3_ACCESS_KEY=$S3_ACCESS_KEY
S3_SECRET_KEY=$S3_SECRET_KEY
S3_FORCE_PATH_STYLE=$S3_FORCE_PATH_STYLE
S3_IGNORE_SSL=$S3_IGNORE_SSL

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

# Generate Garage config only if using built-in S3
if [ "$S3_MODE" = "builtin" ]; then
    print_info "Creating Garage S3 configuration..."

    # Copy Garage Dockerfile to configs
    mkdir -p "$PROJECT_ROOT/docker/garage"
    if [ -f "$PROJECT_ROOT/docker/garage/Dockerfile" ]; then
        print_success "Garage Dockerfile already exists."
    else
        cat > "$PROJECT_ROOT/docker/garage/Dockerfile" << 'DOCKEREOF'
# Garage S3-compatible storage with Alpine base
FROM alpine:3.19 as downloader

ARG GARAGE_VERSION=v0.9.3
ARG TARGETARCH

RUN apk add --no-cache curl

RUN case "${TARGETARCH}" in \
    amd64) ARCH="x86_64" ;; \
    arm64) ARCH="aarch64" ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    curl -fsSL "https://garagehq.deuxfleurs.fr/_releases/${GARAGE_VERSION}/${ARCH}-unknown-linux-musl/garage" -o /garage && \
    chmod +x /garage

FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata wget

COPY --from=downloader /garage /usr/local/bin/garage

RUN mkdir -p /var/lib/garage/data /var/lib/garage/meta /etc/garage && \
    addgroup -S garage && adduser -S garage -G garage && \
    chown -R garage:garage /var/lib/garage

VOLUME ["/var/lib/garage/data", "/var/lib/garage/meta"]

EXPOSE 3900 3901 3902

ENV GARAGE_CONFIG_FILE=/etc/garage.toml

USER garage

ENTRYPOINT ["/usr/local/bin/garage"]
CMD ["server"]
DOCKEREOF
        print_success "Garage Dockerfile created."
    fi

    cat > "$PROJECT_ROOT/docker/configs/garage.toml" << EOF
# Garage S3-compatible Storage Configuration
# Generated by setup script

metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"

replication_mode = "none"

[rpc]
bind_addr = "[::]:3901"
secret = "$(generate_secret 32)"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage.localhost"

[s3_web]
bind_addr = "[::]:3902"
root_domain = ".web.garage.localhost"

[admin]
api_bind_addr = "[::]:3903"
admin_token = "$(generate_secret 32)"
EOF
    print_success "Garage configuration created."
else
    print_info "Skipping Garage configuration (using external S3)."
fi

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
      - redis
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
      - postgres
      - redis
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

networks:
  neon:
    driver: bridge
EOF

    # Add Garage service if using built-in S3
    if [ "$S3_MODE" = "builtin" ]; then
        print_info "Adding Garage S3 storage service..."
        # Insert Garage service before API service
        sed -i '/# NEON API Server/i\
  # Garage S3 Storage (built-in)\
  garage:\
    build:\
      context: ./garage\
      dockerfile: Dockerfile\
    restart: unless-stopped\
    environment:\
      - GARAGE_CONFIG_FILE=/etc/garage.toml\
    volumes:\
      - ./configs/garage.toml:/etc/garage.toml:ro\
      - garage_meta:/var/lib/garage/meta\
      - garage_data:/var/lib/garage/data\
    ports:\
      - "3900:3900"\
      - "3901:3901"\
    healthcheck:\
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3900"]\
      interval: 30s\
      timeout: 10s\
      retries: 3\
    networks:\
      - neon\
\
' "$PROJECT_ROOT/docker/docker-compose.yml"

        # Add garage volumes
        sed -i '/^volumes:/a\
  garage_meta:\
  garage_data:' "$PROJECT_ROOT/docker/docker-compose.yml"

        # Add garage dependency to api
        sed -i '/depends_on:/,/networks:/{
            /- redis/a\
      - garage
        }' "$PROJECT_ROOT/docker/docker-compose.yml"
    fi

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
    cat > "$PROJECT_ROOT/docker/docker-compose.yml" << EOF
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: \${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER} -d \${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - neon

  # Redis Cache
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass \${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "\${REDIS_PASSWORD}", "ping"]
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
      - "${BIND_ADDRESS}:7880:7880"
      - "${BIND_ADDRESS}:7881:7881"
      - "50000-50100:50000-50100/udp"
    depends_on:
      - redis
    networks:
      - neon

  # NEON API Server
  api:
    build:
      context: ../
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    ports:
      - "${BIND_ADDRESS}:3001:3001"
    env_file:
      - ../apps/api/.env
    depends_on:
      - postgres
      - redis
    networks:
      - neon

  # NEON Web Client
  web:
    build:
      context: ../
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    ports:
      - "${BIND_ADDRESS}:3000:80"
    env_file:
      - ../apps/web/.env
    networks:
      - neon

volumes:
  postgres_data:
  redis_data:

networks:
  neon:
    driver: bridge
EOF

    # Add Garage service if using built-in S3
    if [ "$S3_MODE" = "builtin" ]; then
        print_info "Adding Garage S3 storage service..."
        # Insert Garage service before API service
        sed -i '/# NEON API Server/i\
  # Garage S3 Storage (built-in)\
  garage:\
    build:\
      context: ./garage\
      dockerfile: Dockerfile\
    restart: unless-stopped\
    environment:\
      - GARAGE_CONFIG_FILE=/etc/garage.toml\
    volumes:\
      - ./configs/garage.toml:/etc/garage.toml:ro\
      - garage_meta:/var/lib/garage/meta\
      - garage_data:/var/lib/garage/data\
    ports:\
      - "3900:3900"\
      - "3901:3901"\
    healthcheck:\
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3900"]\
      interval: 30s\
      timeout: 10s\
      retries: 3\
    networks:\
      - neon\
\
' "$PROJECT_ROOT/docker/docker-compose.yml"

        # Add garage volumes
        sed -i '/^volumes:/a\
  garage_meta:\
  garage_data:' "$PROJECT_ROOT/docker/docker-compose.yml"

        # Add garage dependency to api
        sed -i '/depends_on:/,/networks:/{
            /- redis/a\
      - garage
        }' "$PROJECT_ROOT/docker/docker-compose.yml"
    fi

    print_success "Docker Compose file created."
    print_info "Services will bind to: ${BIND_ADDRESS}"
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

# Show proxy configuration if not using built-in
if [ "$USE_BUILTIN_PROXY" = "false" ] && [ "$PROXY_TYPE" != "manual" ]; then
    echo -e "${BOLD}Reverse Proxy Configuration:${NC}"
    echo ""
    echo -e "  ${CYAN}Generated config file:${NC} docker/proxy-configs/"
    echo ""
    case "$PROXY_TYPE" in
        nginx)
            echo -e "  ${BOLD}Nginx Setup:${NC}"
            echo "    1. Copy config: sudo cp docker/proxy-configs/nginx.conf /etc/nginx/sites-available/neon.conf"
            echo "    2. Enable site: sudo ln -s /etc/nginx/sites-available/neon.conf /etc/nginx/sites-enabled/"
            echo "    3. Get SSL:     sudo certbot --nginx -d $DOMAIN${LIVEKIT_SEPARATE_DOMAIN:+ -d $LIVEKIT_DOMAIN}"
            echo "    4. Reload:      sudo nginx -t && sudo systemctl reload nginx"
            ;;
        caddy)
            echo -e "  ${BOLD}Caddy Setup:${NC}"
            echo "    1. Copy config: sudo cp docker/proxy-configs/Caddyfile /etc/caddy/Caddyfile"
            echo "    2. Reload:      sudo systemctl reload caddy"
            echo "    (Caddy will automatically obtain SSL certificates)"
            ;;
        haproxy)
            echo -e "  ${BOLD}HAProxy Setup:${NC}"
            echo "    1. Copy config: sudo cp docker/proxy-configs/haproxy.cfg /etc/haproxy/haproxy.cfg"
            echo "    2. Get SSL:     sudo certbot certonly --standalone -d $DOMAIN${LIVEKIT_SEPARATE_DOMAIN:+ -d $LIVEKIT_DOMAIN}"
            echo "    3. Combine:     sudo cat /etc/letsencrypt/live/$DOMAIN/{fullchain,privkey}.pem > /etc/haproxy/certs/$DOMAIN.pem"
            echo "    4. Reload:      sudo systemctl reload haproxy"
            ;;
        traefik)
            echo -e "  ${BOLD}Traefik Setup:${NC}"
            echo "    1. Copy configs: sudo cp docker/proxy-configs/traefik.yml /etc/traefik/"
            echo "                     sudo cp docker/proxy-configs/traefik-dynamic.yml /etc/traefik/dynamic/"
            echo "    2. Create ACME: sudo touch /etc/traefik/acme.json && sudo chmod 600 /etc/traefik/acme.json"
            echo "    3. Restart:     sudo systemctl restart traefik"
            ;;
        apache)
            echo -e "  ${BOLD}Apache Setup:${NC}"
            echo "    1. Enable mods: sudo a2enmod proxy proxy_http proxy_wstunnel ssl headers rewrite"
            echo "    2. Copy config: sudo cp docker/proxy-configs/apache.conf /etc/apache2/sites-available/neon.conf"
            echo "    3. Enable site: sudo a2ensite neon"
            echo "    4. Get SSL:     sudo certbot --apache -d $DOMAIN${LIVEKIT_SEPARATE_DOMAIN:+ -d $LIVEKIT_DOMAIN}"
            echo "    5. Reload:      sudo systemctl reload apache2"
            ;;
    esac
    echo ""
    echo -e "  ${CYAN}Service ports (for your proxy to connect to):${NC}"
    echo "    - API:      ${BIND_ADDRESS}:3001"
    echo "    - Web:      ${BIND_ADDRESS}:3000"
    echo "    - LiveKit:  ${BIND_ADDRESS}:7880"
    echo ""
fi

# Pause for user to save credentials
echo -e "${CYAN}────────────────────────────────────────${NC}"
echo ""
if [ "$USE_BUILTIN_PROXY" = "true" ]; then
    echo -e "${BOLD}Before continuing, make sure your domain(s) point to this server:${NC}"
    SERVER_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s --connect-timeout 5 icanhazip.com 2>/dev/null || echo '<your-server-ip>')
    echo "  - $DOMAIN -> $SERVER_IP"
    if [ "$LIVEKIT_SEPARATE_DOMAIN" = "true" ]; then
        echo "  - $LIVEKIT_DOMAIN -> $SERVER_IP"
    fi
    echo ""
fi

echo -e "${YELLOW}${BOLD}Press Enter to start NEON (or Ctrl+C to exit and start manually later)...${NC}"
read -r

# Start Docker
echo ""
print_step "8" "Starting NEON Services"
echo ""
print_info "Starting Docker containers..."

cd "$PROJECT_ROOT/docker"

# Use the DOCKER_COMPOSE_CMD set during dependency check
# Fall back to detection if not set
if [ -z "$DOCKER_COMPOSE_CMD" ]; then
    if docker compose version &>/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker compose"
    elif sudo docker compose version &>/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="sudo docker compose"
    elif command -v docker-compose &>/dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
    else
        print_error "Docker Compose not found."
        exit 1
    fi
fi

print_info "Using: $DOCKER_COMPOSE_CMD"
echo ""

# Start services
$DOCKER_COMPOSE_CMD up -d

if [ $? -ne 0 ]; then
    print_error "Failed to start Docker containers."
    echo ""
    echo "Please check the error above and try running manually:"
    echo -e "  ${CYAN}cd docker && $DOCKER_COMPOSE_CMD up -d${NC}"
    exit 1
fi

print_success "Docker containers started."
echo ""

# Wait for services to be healthy
print_info "Waiting for services to be ready..."
echo ""

# Wait for PostgreSQL
echo -n "  Waiting for PostgreSQL..."
for i in {1..30}; do
    if $DOCKER_COMPOSE_CMD exec -T postgres pg_isready -U neon -d neon &>/dev/null; then
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e " ${YELLOW}timeout (continuing anyway)${NC}"
    fi
    sleep 2
done

# Wait for Redis
echo -n "  Waiting for Redis..."
for i in {1..30}; do
    if $DOCKER_COMPOSE_CMD exec -T redis redis-cli -a "$REDIS_PASSWORD" ping &>/dev/null; then
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e " ${YELLOW}timeout (continuing anyway)${NC}"
    fi
    sleep 2
done

# Wait for API to be built and running
echo -n "  Waiting for API..."
for i in {1..60}; do
    if $DOCKER_COMPOSE_CMD exec -T api wget -q --spider http://localhost:3001/api/health 2>/dev/null; then
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e " ${YELLOW}timeout (continuing anyway)${NC}"
    fi
    sleep 3
done

echo ""

# Initialize database
print_info "Initializing database..."
echo ""

echo "  Running migrations..."
if $DOCKER_COMPOSE_CMD exec -T api npm run db:migrate 2>&1 | grep -v "^>" | head -20; then
    print_success "Database migrations complete."
else
    print_warning "Migration may have had issues. Check logs if needed."
fi

echo ""
echo "  Seeding initial data..."
if $DOCKER_COMPOSE_CMD exec -T api npm run db:seed 2>&1 | grep -v "^>" | head -20; then
    print_success "Database seeding complete."
else
    print_warning "Seeding may have had issues. Check logs if needed."
fi

# Final summary
echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}                    NEON IS RUNNING!                         ${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Access NEON at:${NC}  https://$DOMAIN"
echo ""
echo -e "  ${CYAN}Admin Login:${NC}"
echo "    Username:     $ADMIN_USERNAME"
echo -e "    Password:     ${YELLOW}$ADMIN_PASSWORD${NC}"
echo ""
echo -e "  ${CYAN}Useful Commands:${NC}"
echo "    View logs:    cd docker && docker compose logs -f"
echo "    Stop NEON:    cd docker && docker compose down"
echo "    Restart:      cd docker && docker compose restart"
echo ""
echo -e "${GREEN}${BOLD}Happy collaborating!${NC}"
echo ""
