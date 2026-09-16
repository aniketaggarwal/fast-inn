FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY issuer/package.json ./issuer/package.json
COPY api/package.json ./api/package.json
COPY web/package.json ./web/package.json
RUN npm ci --workspace=web --include-workspace-root

COPY web ./web

WORKDIR /app/web
EXPOSE 5173
# Dev-mode server for now (matches issuer/api's dev setup); a production
# deployment would `vite build` and serve the static output instead.
CMD ["npx", "vite", "--host", "0.0.0.0"]
