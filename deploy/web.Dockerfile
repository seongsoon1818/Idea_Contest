# Build context: Idea_Contest/ (not frontend/dist).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY frontend3/package.json frontend3/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend3/index.html frontend3/tsconfig.json frontend3/vite.config.ts ./
COPY frontend3/src ./src
COPY frontend3/public ./public
ARG PUBLIC_ORIGIN=https://hsupick.cloud
RUN PUBLIC_ORIGIN="$PUBLIC_ORIGIN" node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs"; const origin=new URL(process.env.PUBLIC_ORIGIN).origin; if (!origin.startsWith("https://")) throw new Error("PUBLIC_ORIGIN must use HTTPS"); writeFileSync("index.html",readFileSync("index.html","utf8").replaceAll("https://hsupick-campus-idea-contest.luckycrown8.chatgpt.site",origin));' \
    && NODE_OPTIONS=--max-old-space-size=1024 npm run build

FROM caddy:2-alpine AS runtime
COPY --from=build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443 8080
