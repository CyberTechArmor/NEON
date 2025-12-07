# NEON API Server Dockerfile
# Multi-stage build for production

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies (including openssl for Prisma) and update npm
RUN apk add --no-cache python3 make g++ openssl openssl-dev && \
    npm install -g npm@latest

# Copy all package files first for better layer caching
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy workspace package.json files
COPY apps/api/package*.json ./apps/api/
COPY packages/database/package*.json ./packages/database/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/config/package*.json ./packages/config/

# Copy Prisma schema early (needed for postinstall)
COPY packages/database/prisma ./packages/database/prisma

# Install all dependencies
RUN npm install

# Copy source files
COPY apps/api ./apps/api
COPY packages ./packages

# Generate Prisma client directly (skip turbo for Docker builds)
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Build the API (skip turbo, build directly)
RUN cd apps/api && npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install openssl (required by Prisma) and update npm
RUN apk add --no-cache openssl && \
    npm install -g npm@latest

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 neon

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/database/package*.json ./packages/database/
COPY packages/shared/package*.json ./packages/shared/

# Copy Prisma schema
COPY packages/database/prisma ./packages/database/prisma

# Install production dependencies only
RUN npm install --omit=dev

# Generate Prisma client for production
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Copy built files from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Switch to non-root user
USER neon

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the server
CMD ["node", "apps/api/dist/index.js"]
