FROM node:24-bookworm-slim AS development

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY tests ./tests

CMD ["npm", "run", "dev"]

FROM development AS build
RUN npm run build

FROM node:24-bookworm-slim AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --omit=dev \
    && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/pust-entrypoint
RUN chmod +x /usr/local/bin/pust-entrypoint \
    && mkdir -p /app/data \
    && chown node:node /app/data

ENTRYPOINT ["pust-entrypoint"]
CMD ["node", "dist/index.js"]
