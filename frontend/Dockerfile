FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S hotelverify -u 1001
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER hotelverify
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
