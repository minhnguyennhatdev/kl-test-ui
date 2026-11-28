# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
# Baked into the rewrite table at build time. Defaults to the in-cluster Service
# name the Helm chart gives the API.
ARG SCHEDULER_API=http://kl-test-api:3000
ENV SCHEDULER_API=${SCHEDULER_API} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3001
CMD ["node", "server.js"]
