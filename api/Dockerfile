FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY issuer/package.json ./issuer/package.json
COPY api/package.json ./api/package.json
RUN npm ci --workspace=api --include-workspace-root

COPY api ./api

WORKDIR /app/api
EXPOSE 4000
CMD ["node", "src/server.js"]
