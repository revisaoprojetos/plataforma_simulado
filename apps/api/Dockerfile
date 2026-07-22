# API dedicada (Fase 3). Build workspace-aware (precisa do pacote `data`); runtime slim
# (o tsup embute o `data` no bundle → a imagem final não precisa do monorepo).
# ⚠️ docker-compose deve usar context: . (raiz do monorepo) e dockerfile: apps/api/Dockerfile.

FROM node:22-alpine AS builder
RUN npm i -g pnpm@9
WORKDIR /repo
# Manifests primeiro (cache de layer de instalação)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/data/package.json packages/data/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter api --filter data --frozen-lockfile
# Fontes + build (tsup bundla `data` em dist/main.js)
COPY packages/data packages/data
COPY apps/api apps/api
RUN pnpm --filter api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Só as deps de RUNTIME (o `data` já está no bundle) — remove a dep workspace do package.json.
COPY apps/api/package.json ./package.json
RUN node -e "const p=require('./package.json'); delete p.dependencies.data; delete p.devDependencies; require('fs').writeFileSync('./package.json', JSON.stringify(p,null,2))" \
 && npm install --omit=dev --no-audit --no-fund
COPY --from=builder /repo/apps/api/dist ./dist
RUN addgroup -S nodejs -g 1001 && adduser -S api -u 1001 && chown -R api:nodejs /app
USER api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
