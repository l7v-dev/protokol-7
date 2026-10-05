# Syntax: docker/dockerfile:1.4
FROM node:22-bookworm-slim AS base

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies for headless Chromium, network utilities, and Python 3 runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libxkbcommon0 \
    python3 \
    python3-minimal \
    && rm -rf /var/lib/apt/lists/*

# Stage 2: Dependencies and Build
FROM base AS builder

WORKDIR /app

COPY package*.json tsconfig.json biome.json ./

# Install all dependencies including devDependencies for build
RUN npm ci --include=dev

COPY src/ ./src/
COPY rules/ ./rules/
COPY context/ ./context/

# Compile TypeScript
RUN npm run build

# Stage 3: Production Runtime
FROM base AS runner

WORKDIR /app

COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/context ./context
COPY --from=builder /app/rules ./rules
COPY examples/ ./examples/
COPY scripts/ ./scripts/
COPY infra/migrations/ ./infra/migrations/

# Create runtime directories with correct permissions for node user
RUN mkdir -p /app/data /app/output /app/scratch && \
    chown -R node:node /app

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
