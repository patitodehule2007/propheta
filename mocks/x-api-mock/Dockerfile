# --- Build stage ---
FROM node:26-alpine AS builder

WORKDIR /app

COPY package.json ./

ENV CI=true
RUN npm install -g pnpm && pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm exec tsc && pnpm prune --prod

# --- Runtime stage ---
FROM node:26-alpine

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

RUN rm -rf /tmp/* /var/cache/apk/*

CMD ["node", "build/index.js"]
