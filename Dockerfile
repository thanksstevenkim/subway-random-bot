FROM node:24-bookworm-slim

WORKDIR /app

# BotKit's Node.js Docker deployment uses srvx for the TypeScript entrypoint.
COPY package.json package-lock.json ./
RUN npm ci --no-fund \
    && mkdir -p /app/.bot-data \
    && chown node:node /app/.bot-data

COPY --chown=node:node src ./src
COPY --chown=node:node data ./data
COPY --chown=node:node public ./public
COPY --chown=node:node tsconfig.json ./

USER node
EXPOSE 8000

# Make static assets explicit: auto-discovery missed /app/public in production.
CMD ["./node_modules/.bin/srvx", "serve", "--prod", "--port", "8000", "--static", "/app/public", "--entry", "./src/bot.ts"]
