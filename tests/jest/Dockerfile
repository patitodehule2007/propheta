FROM node:26-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

ENV CI=true
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "exec", "jest", "--runInBand", "--color"]
