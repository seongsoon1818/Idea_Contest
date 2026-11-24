FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.27.1

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# gitmoji uses an obsolete native kexec hook. The API does not use this CLI.
RUN sed -i 's/kexec: true/kexec: false/' pnpm-workspace.yaml && pnpm install --frozen-lockfile
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY src ./src
RUN pnpm exec prisma generate --no-hints \
    && NODE_OPTIONS=--max-old-space-size=1024 pnpm exec tsc -p tsconfig.json

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# Keep Prisma CLI available for explicit migrate deploy / catalog:seed commands.
# No database migration runs automatically when this container starts.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/prisma.config.ts ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
