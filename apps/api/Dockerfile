# API dedicada (Fase 3). Build workspace-aware (precisa do pacote `data`); runtime slim
# (o tsup embute o `data` no bundle → a imagem final não precisa do monorepo).
# ⚠️ docker-compose deve usar context: . (raiz do monorepo) e dockerfile: apps/api/Dockerfile.

# IMPORTANTE: o context de build é a RAIZ do monorepo. Copiamos o repo inteiro e
# instalamos com o MESMO pnpm do lockfile (11.9.0) — o frozen-lockfile exige TODOS os
# manifests do workspace presentes e a mesma versão do pnpm que gerou o lock. Copiar só
# api+data (ou usar pnpm@9) quebrava o build. Espelha o Dockerfile do web, que funciona.
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat && npm i -g pnpm@11.9.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# tsup bundla o pacote `data` dentro de dist/main.js
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
