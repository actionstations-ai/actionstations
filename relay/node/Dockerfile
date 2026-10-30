# The Action Stations self-hosted live play server (spec 0409 FR-9a).
# Build from the repository root:  docker build -f relay/node/Dockerfile -t actionstations-relay .
# Run:                              see relay/node/compose.yaml
#
# Stage 1 installs only this package and its workspace dependency (the relay core), then bundles
# the server into one file. Stage 2 is a plain Node image with that file, a non-root user, a
# read-only root filesystem (compose.yaml) and /data for the database, certificate and logs.
# The build stage runs on the build machine's platform: the server bundle is plain JavaScript,
# so one build serves every target platform (#547).
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY relay/core ./relay/core
COPY relay/node ./relay/node
COPY src/shared ./src/shared
COPY src/main/live/transport/lan ./src/main/live/transport/lan
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @actionstations/relay-node... \
 && pnpm --filter @actionstations/relay-node build

FROM node:22-alpine
LABEL org.opencontainers.image.title="Action Stations relay (self-hosted)" \
      org.opencontainers.image.description="Live play session server for your own network. Stores only ciphertext, for at most 72 hours. Makes no outbound connection." \
      org.opencontainers.image.source="https://github.com/actionstations-ai/actionstations" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
RUN addgroup -g 10001 relay && adduser -D -u 10001 -G relay relay && mkdir -p /data && chown relay:relay /data
WORKDIR /app
COPY --from=build /repo/relay/node/dist/server.cjs ./dist/server.cjs
COPY --from=build /repo/relay/node/public ./public
ENV AS_RELAY_DATA_DIR=/data \
    AS_RELAY_TLS=self-signed \
    AS_RELAY_PORT=8485 \
    NODE_ENV=production
EXPOSE 8485
VOLUME ["/data"]
USER relay
# The health check is this container asking itself; the server itself never connects anywhere.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('https').get({host:'127.0.0.1',port:process.env.AS_RELAY_PORT||8485,path:'/v1/health',rejectUnauthorized:false},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["node", "dist/server.cjs"]
CMD ["serve"]
