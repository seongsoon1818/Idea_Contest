FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.10.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# gitmoji uses an obsolete native kexec hook. The API does not use this CLI.
RUN sed -i 's/kexec: true/kexec: false/' pnpm-workspace.yaml && pnpm install --frozen-lockfile
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY src ./src
RUN pnpm run build
ENV NODE_ENV=production
USER node
CMD ["node", "dist/main.js"]
