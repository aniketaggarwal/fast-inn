# All-in-one image: web + api + issuer + Redis + MinIO behind one port, run by
# scripts/serve.js. The only thing it needs from outside is Postgres
# (DATABASE_URL). See docs/DEPLOY.md.
#
# Debian, not alpine: canvas / sharp / tfjs ship glibc prebuilds, and alpine's
# musl would mean compiling them from source.
FROM node:22-bookworm-slim

ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
      redis-server curl ca-certificates \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://dl.min.io/server/minio/release/linux-${TARGETARCH}/minio" -o /usr/local/bin/minio \
    && chmod +x /usr/local/bin/minio

WORKDIR /app

# Manifests first so the dependency layer is cached across source edits.
COPY package.json package-lock.json ./
COPY packages/credentials/package.json packages/credentials/
COPY issuer/package.json issuer/
COPY api/package.json api/
COPY web/package.json web/
# Dev dependencies stay: node-pg-migrate (run at boot) is one.
RUN npm ci

COPY . .
# Same-origin: the gateway serves this bundle and proxies /api and /issuer.
RUN VITE_API_BASE=/api VITE_ISSUER_BASE=/issuer npm run build --workspace=web

RUN chown -R node:node /app
USER node

ENV PORT=10000
EXPOSE 10000
CMD ["node", "scripts/serve.js"]
