# Build stage: installs every dependency and compiles the app
FROM public.ecr.aws/docker/library/node:20-alpine AS build
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci --ignore-scripts

COPY frontend/ ./

# NEXT_PUBLIC_* values are inlined into the bundle at build time, so they
# must be provided as build args (runtime env vars have no effect).
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WS_URL=localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Runtime stage: only the standalone server, static assets and public files
FROM public.ecr.aws/docker/library/node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:3000/about || exit 1

CMD ["node", "server.js"]
