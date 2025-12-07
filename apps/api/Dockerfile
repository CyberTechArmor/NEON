# NEON API Server Dockerfile
# Multi-stage build for production

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/database/package*.json ./packages/database/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/config/package*.json ./packages/config/

# Install dependencies (use npm install since package-lock.json may not exist)
RUN npm install --workspace=@neon/api --include-workspace-root

# Copy source files
COPY apps/api ./apps/api
COPY packages ./packages
COPY tsconfig.json ./
COPY turbo.json ./

# Generate Prisma client
RUN npm run db:generate

# Build the API
RUN npm run build --workspace=@neon/api

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 neon

# Install production dependencies only
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/database/package*.json ./packages/database/
COPY packages/shared/package*.json ./packages/shared/

RUN npm install --workspace=@neon/api --include-workspace-root --omit=dev

# Copy built files
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy Prisma schema and migrations
COPY packages/database/prisma ./packages/database/prisma

# Generate Prisma client for production
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Switch to non-root user
USER neon

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the server
CMD ["node", "apps/api/dist/index.js"]
