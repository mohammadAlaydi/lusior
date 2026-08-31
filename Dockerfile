# syntax=docker/dockerfile:1

# Build frontend and server from the locked dependency graph. Node 22 is the
# supported runtime declared by package.json and .nvmrc.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build && npm run server:build

# Install only runtime dependencies in a separate layer; this keeps TypeScript,
# Vite, and other build-only tooling out of the production image.
FROM node:22-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Single unprivileged process serving both the SPA and API. /app/data is
# populated as node-owned before a named volume is mounted. Compose enforces a
# read-only root filesystem; other platforms must apply the equivalent runtime
# policy because it cannot be encoded in an image layer.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    STATIC_DIR=/app/dist \
    DATA_DIR=/app/data \
    SUBMISSIONS_DIR=/app/data

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server/dist ./server/dist
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3001

# /api/ready must prove that the process is ready to receive traffic (including
# its durable storage check), not merely that its TCP socket is open.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/dist/server/src/index.js"]
