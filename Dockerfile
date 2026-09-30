# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./
COPY tsconfig.json tsconfig.base.json ./
COPY lib/ ./lib/
COPY artifacts/ ./artifacts/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the API server
RUN pnpm --dir artifacts/api-server run build

# Runtime stage
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./

# Copy lib directory (workspace dependencies)
COPY lib/ ./lib/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built API server
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/healthz', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
