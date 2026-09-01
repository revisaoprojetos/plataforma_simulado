# Build da app Next.js (apps/web) num monorepo pnpm.
# IMPORTANTE: o contexto de build deve ser a RAIZ do repositório (não apps/web),
# pois o pnpm-lock.yaml e os pacotes do workspace (packages/*) vivem na raiz.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && npm install -g pnpm@11.9.0
WORKDIR /app

# ---- Builder ----
FROM base AS builder
COPY . .
RUN pnpm install --frozen-lockfile

# Variáveis NEXT_PUBLIC_* são embutidas no bundle do cliente em build-time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
# Domínio do cookie de sessão (login compartilhado entre subdomínios). Vazio = por-host.
ARG NEXT_PUBLIC_COOKIE_DOMAIN
# Módulo Cronograma de Estudos: 'true' liga o MENU (gate de build). Vazio = escondido.
# O acesso real ainda é por tenant (coluna ativo de simulado_cronograma_config).
ARG NEXT_PUBLIC_CRONOGRAMA_ATIVO
# LegProc Digital (Área de Leitura) e Modelos de Caderno: 'true' liga o MENU (gate de build).
ARG NEXT_PUBLIC_LEITURA_ATIVA
ARG NEXT_PUBLIC_MODELOS_CADERNO_ATIVO
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_COOKIE_DOMAIN=$NEXT_PUBLIC_COOKIE_DOMAIN \
    NEXT_PUBLIC_CRONOGRAMA_ATIVO=$NEXT_PUBLIC_CRONOGRAMA_ATIVO \
    NEXT_PUBLIC_LEITURA_ATIVA=$NEXT_PUBLIC_LEITURA_ATIVA \
    NEXT_PUBLIC_MODELOS_CADERNO_ATIVO=$NEXT_PUBLIC_MODELOS_CADERNO_ATIVO \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter web build

# ---- Runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

# Chromium para gerar o PDF dos cadernos/relatórios (puppeteer-core). Sem ele, o download
# de PDF falha e a UI cairia no "imprimir". Fontes p/ acentuação/emoji corretos no PDF.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser PUPPETEER_SKIP_DOWNLOAD=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Saída "standalone" do Next em monorepo: o server fica em apps/web/server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "apps/web/server.js"]
