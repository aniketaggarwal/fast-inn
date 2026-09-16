FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY issuer/package.json ./issuer/package.json
COPY api/package.json ./api/package.json
RUN npm ci --workspace=issuer --include-workspace-root

COPY issuer ./issuer

WORKDIR /app/issuer
EXPOSE 4001
CMD ["node", "src/server.js"]
