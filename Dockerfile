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
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

USER node
CMD ["npm", "start"]
