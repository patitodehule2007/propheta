FROM node:26-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

ENV CI=true
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec tsc && mkdir -p build/migrations

FROM node:26-alpine
WORKDIR /app
COPY --from=builder /app/build/index.js  ./build/index.js
COPY --from=builder /app/build/init.js   ./build/init.js
COPY --from=builder /app/build/migrations ./migrations
COPY --from=builder /app/node_modules    ./node_modules
COPY --from=builder /app/sql             ./sql
ENTRYPOINT ["node", "build/index.js"]
