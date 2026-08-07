# --- Build stage ---
FROM node:26-alpine AS builder

WORKDIR /backend

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

ENV CI=true
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .

RUN pnpm exec tsc && pnpm prune --prod

# --- Runtime stage ---
FROM node:26-alpine

WORKDIR /backend

COPY --from=builder /backend/build ./build
COPY --from=builder /backend/node_modules ./node_modules
COPY --from=builder /backend/package*.json ./

RUN rm -rf /tmp/* /var/cache/apk/*

CMD ["node", "build/index.js"]
