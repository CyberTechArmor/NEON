# NEON Web Client Dockerfile
# Multi-stage build for production

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Update npm to latest version
RUN npm install -g npm@latest

# Copy all package files first for better layer caching
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy workspace package.json files
COPY apps/web/package*.json ./apps/web/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/config/package*.json ./packages/config/

# Install all dependencies
RUN npm install

# Copy source files
COPY apps/web ./apps/web
COPY packages ./packages

# Build arguments for environment variables
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_LIVEKIT_URL
ARG VITE_APP_NAME=NEON

# Set environment variables for build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
ENV VITE_APP_NAME=$VITE_APP_NAME

# Build packages in correct dependency order
# 1. Build @neon/config (no internal dependencies)
RUN cd packages/config && npm run build

# 2. Build @neon/shared (no internal dependencies)
RUN cd packages/shared && npm run build

# Build the web client (skip turbo, build directly)
RUN cd apps/web && npm run build

# Production stage - serve with nginx
FROM nginx:alpine AS runner

# Copy custom nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy env substitution script
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Start nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
