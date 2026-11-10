FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY prisma prisma
RUN npx prisma generate --schema prisma/schema.prisma
COPY apps/worker apps/worker
RUN npm run build -w apps/worker && mkdir -p apps/worker/node_modules

FROM node:22-bookworm-slim AS run
ARG GIT_SHA=dev
LABEL org.opencontainers.image.revision=$GIT_SHA \
      org.opencontainers.image.title="video-worker"
# TMPDIR: pasta de trabalho dos originais/saída HLS (no Swarm é um volume em /tmp, com disco de verdade)
ENV NODE_ENV=production TMPDIR=/tmp GIT_SHA=$GIT_SHA
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/worker/node_modules apps/worker/node_modules
COPY --from=build /repo/apps/worker/dist apps/worker/dist
COPY --from=build /repo/apps/worker/package.json apps/worker/package.json
USER node
EXPOSE 9100
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:9100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/worker/dist/main.js"]
