# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Stage 2: Compile TypeScript backend ──────────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Dependências de produção (inclui better-sqlite3 — requer build tools)
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev

# Artefatos compilados
COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /app/web/dist ./web/dist

# Dados de configuração
COPY data/ ./data/

# Pasta de runtime (sessions, cache)
RUN mkdir -p storage

EXPOSE 3000

CMD ["node", "dist/webhookServer.js"]
