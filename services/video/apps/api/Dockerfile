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
COPY apps/api apps/api
RUN npm run build -w apps/api && mkdir -p apps/api/node_modules

# O estágio build (dev) serve ao docker-compose.prod.yml. Em produção Swarm o MESMO estágio final (run) roda as migrations:
# node_modules inteiro vai junto (inclui a CLI do Prisma), então não há imagem separada de migrate
# (docker-compose.video.portainer.yml: serviço migrate = mesma imagem, command prisma migrate deploy).

FROM node:22-bookworm-slim AS run
ARG GIT_SHA=dev
LABEL org.opencontainers.image.revision=$GIT_SHA \
      org.opencontainers.image.title="video-api"
ENV NODE_ENV=production GIT_SHA=$GIT_SHA
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/prisma prisma
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/package.json apps/api/package.json
USER node
EXPOSE 3000
# Liveness (não depende de banco/Redis/S3): se o processo travar, o Docker marca como "unhealthy".
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/api/dist/main.js"]
