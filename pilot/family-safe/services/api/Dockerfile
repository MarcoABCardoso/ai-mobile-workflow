FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY services/api/package.json ./services/api/
RUN npm ci --workspace=services/api --ignore-scripts

FROM deps AS build
COPY tsconfig.json ./
COPY shared/ ./shared/
COPY services/api/ ./services/api/
RUN npm run build --workspace=@family-safe/api

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/services/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
