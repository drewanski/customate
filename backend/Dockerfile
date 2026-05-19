# CustoMate backend — production Dockerfile
#
# Multi-stage build keeps the final image small (~150MB):
#   1. deps stage installs production-only node_modules with reproducible
#      builds via npm ci against the committed package-lock.json
#   2. runtime stage copies the source + the prepared deps and runs as a
#      non-root user for security

# ─── Stage 1: deps ─────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Copy lockfile FIRST so this layer caches when only source code changes
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ─── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as non-root for security. node:alpine ships with a non-privileged
# `node` user already; we just chown the app dir over to it.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

USER node

# Healthcheck — Docker / orchestrator pings this to detect crashed processes
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/healthz || exit 1

EXPOSE 4000
CMD ["node", "server.js"]
