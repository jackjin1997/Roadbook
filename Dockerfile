FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate
# better-sqlite3 needs python3 + build tools for native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# ── Build stage ──────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app

# Install dependencies (layer cache)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build frontend
COPY . .
RUN pnpm build

# ── Production stage ─────────────────────────────────────────────────────────
FROM base AS production
WORKDIR /app

# Install all deps (tsx is devDep but needed to run TS at runtime)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy built frontend + backend source
COPY --from=build /app/dist ./dist
COPY src ./src
COPY tsconfig.ariadne.json ./

ENV NODE_ENV=production
ENV ARIADNE_DATA_DIR=/data

EXPOSE 8080

CMD ["pnpm", "start"]
