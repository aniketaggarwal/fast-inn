# ─── Stage 1: Dependencies ───────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ─── Stage 2: Production image ───────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S hotelverify -u 1001

# Copy deps + source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create uploads directory
RUN mkdir -p uploads logs && chown -R hotelverify:nodejs uploads logs

USER hotelverify

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
