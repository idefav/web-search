FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY plugins/pi/package.json plugins/pi/package.json
COPY plugins/openclaw/package.json plugins/openclaw/package.json
RUN npm ci

COPY apps ./apps
COPY packages ./packages
COPY plugins ./plugins
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
USER node
EXPOSE 8080
CMD ["node", "apps/server/dist/index.js"]
