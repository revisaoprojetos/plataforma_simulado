# Deploy VPS (Swarm + Portainer + Traefik) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o repositório `plataforma_simulado` pronto para deploy em VPS (Docker Swarm + Portainer + Traefik existentes) e produzir um runbook completo para o usuário executar o primeiro deploy manualmente.

**Architecture:** Sem mudança de arquitetura de aplicação — só ajustes de infraestrutura-como-código (`docker-compose.portainer.yml` ganha labels do Traefik e perde a publicação direta de porta), reconciliação de duas pastas de migrations divergentes (bookkeeping, sem tocar em produção), documentação (`.env.example`, runbook) e uma rota `/api/health`.

**Tech Stack:** Next.js 16 (App Router) / Node worker (BullMQ) / Docker Swarm / Traefik / GHCR / GitHub Actions / Supabase (Postgres/Storage, externo).

## Global Constraints

- Domínio de produção: `simulado.revisaopge.com.br`.
- Imagens: `ghcr.io/revisaoprojetos/plataforma_simulado` (web) e `ghcr.io/revisaoprojetos/plataforma_simulado-worker` (worker) — pacotes públicos, sem credencial de registry necessária.
- **Não rodar nenhuma migration contra o Supabase de produção (`tlaxvhcqswiotzibulyo.supabase.co`) como parte deste plano.** O schema de produção já está à frente do git (confirmado via REST API — ver spec).
- MinIO/S3 para storage de PDFs está **fora de escopo** deste plano (projeto futuro separado).
- Automação de CI/CD (secrets `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`) está **fora de escopo** deste plano — primeiro deploy é manual via Portainer.
- Ambiente de execução local não tem `pnpm`/`node_modules` instalados — verificação de build TypeScript/Next.js delega para o GitHub Actions (gate real: o workflow builda a imagem Docker rodando `pnpm build` dentro do Dockerfile).
- `push` para `main` é uma ação de estado compartilhado (dispara build/publish real no GHCR) — **exige confirmação explícita do usuário antes de executar**, não deve ser feito automaticamente.

---

### Task 1: Rota `/api/health`

**Files:**
- Create: `apps/web/app/api/health/route.ts`

**Interfaces:**
- Produces: endpoint `GET /api/health` retornando `200 { "status": "ok" }`. Usado pelo healthcheck do `docker-compose.yml` (build local) e disponível para uso futuro do Traefik/Swarm.

- [ ] **Step 1: Criar a rota**

Conteúdo completo de `apps/web/app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server'

// GET /api/health — usado pelo healthcheck do Docker/Traefik.
export async function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
```

- [ ] **Step 2: Verificar que não há rota conflitante**

Run: `grep -r "app/api/health" apps/web/app --include=route.ts -l`
Expected: apenas o arquivo criado no Step 1 aparece.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/health/route.ts
git commit -m "feat(web): adiciona rota /api/health para healthcheck"
```

---

### Task 2: Consolidar migrations divergentes na pasta raiz

**Files:**
- Move: `apps/web/supabase/migrations/20260626000003_config_multitenant.sql` → `supabase/migrations/20260626000003_config_multitenant.sql`
- Move: `apps/web/supabase/migrations/20260626000004_rename_prefixo_simulado.sql` → `supabase/migrations/20260626000004_rename_prefixo_simulado.sql`
- Move+rename: `apps/web/supabase/migrations/20260710000001_relatorio_eventos.sql` → `supabase/migrations/20260710000004_relatorio_eventos.sql`
- Move+rename: `apps/web/supabase/migrations/20260710000002_pasta_tipo.sql` → `supabase/migrations/20260710000005_pasta_tipo.sql`
- Move: `apps/web/supabase/migrations/20260711000001_webhook_saida.sql` → `supabase/migrations/20260711000001_webhook_saida.sql`
- Move: `apps/web/supabase/migrations/20260713000001_webhook_saida_extra.sql` → `supabase/migrations/20260713000001_webhook_saida_extra.sql`
- Move: `apps/web/supabase/migrations/20260713000002_automacoes.sql` → `supabase/migrations/20260713000002_automacoes.sql`
- Delete: diretório `apps/web/supabase/` (fica vazio após os moves)

**Interfaces:**
- Não altera conteúdo SQL de nenhum arquivo — apenas move e renomeia 2 deles (os únicos com timestamp colidindo com um arquivo já existente na raiz). Nenhum código da aplicação referencia caminhos de migration diretamente, então não há consumidores a atualizar.

- [ ] **Step 1: Mover os 5 arquivos sem colisão de timestamp**

```bash
git mv apps/web/supabase/migrations/20260626000003_config_multitenant.sql supabase/migrations/20260626000003_config_multitenant.sql
git mv apps/web/supabase/migrations/20260626000004_rename_prefixo_simulado.sql supabase/migrations/20260626000004_rename_prefixo_simulado.sql
git mv apps/web/supabase/migrations/20260711000001_webhook_saida.sql supabase/migrations/20260711000001_webhook_saida.sql
git mv apps/web/supabase/migrations/20260713000001_webhook_saida_extra.sql supabase/migrations/20260713000001_webhook_saida_extra.sql
git mv apps/web/supabase/migrations/20260713000002_automacoes.sql supabase/migrations/20260713000002_automacoes.sql
```

- [ ] **Step 2: Mover e renomear os 2 arquivos com timestamp colidindo**

`supabase/migrations/20260710000001_curseduca_config.sql` e `20260710000002_curseduca_jobs.sql` já existem na raiz — os equivalentes de `apps/web` recebem os próximos timestamps livres do mesmo dia (`000004`, `000005`, já que a raiz vai até `000003` nesse dia):

```bash
git mv apps/web/supabase/migrations/20260710000001_relatorio_eventos.sql supabase/migrations/20260710000004_relatorio_eventos.sql
git mv apps/web/supabase/migrations/20260710000002_pasta_tipo.sql supabase/migrations/20260710000005_pasta_tipo.sql
```

- [ ] **Step 3: Remover o diretório vazio `apps/web/supabase/`**

```bash
rmdir apps/web/supabase/migrations
rmdir apps/web/supabase
```

- [ ] **Step 4: Verificar que não sobrou nenhuma pasta duplicada e não há colisão de timestamp**

Run:
```bash
test -d apps/web/supabase && echo "AINDA EXISTE (falhou)" || echo "OK: apps/web/supabase removida"
ls supabase/migrations | sort | uniq -d
```
Expected: primeira linha imprime `OK: apps/web/supabase removida`; segundo comando não imprime nada (sem duplicatas).

- [ ] **Step 5: Commit**

```bash
git add -A supabase/migrations apps/web/supabase
git commit -m "chore(db): consolida migrations de apps/web/supabase na pasta raiz

As duas pastas haviam divergido (7 migrations existiam só em apps/web).
Confirmado via REST API que ambas já estavam aplicadas em produção —
este commit só reorganiza o histórico no git, sem tocar no banco.
Dois arquivos foram renomeados (20260710000001/000002 -> 000004/000005)
para não colidir com migrations diferentes que já ocupavam esses
timestamps na raiz."
```

---

### Task 3: Criar `.env.example`

**Files:**
- Create: `.env.example` (raiz do repo)

**Interfaces:**
- Produces: lista de referência de todas as variáveis de ambiente usadas por `apps/web` e `apps/worker`, consumida pelo runbook (Task 6) e por quem for configurar `.env` local ou variáveis no Portainer.

- [ ] **Step 1: Levantar todas as variáveis realmente usadas no código**

Run:
```bash
grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*" apps/web/app apps/web/lib apps/web/middleware.ts apps/worker/src packages/shared/src 2>/dev/null | sed 's/process\.env\.//' | sort -u
```
Expected: lista incluindo (entre outras) `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `GOTENBERG_URL`, `WEB_INTERNAL_URL`, `PDF_RENDER_SECRET`, `PDF_PUBLIC_BASE`, `CRON_SECRET`, `APP_ENCRYPTION_KEY`, `ALUNO_SESSION_SECRET`, `CURSEDUCA_API_KEY`, `CURSEDUCA_BASE_URL`, `CURSEDUCA_USER`, `CURSEDUCA_PASS`, `CURSEDUCA_WEBHOOK_SECRET`, `CURSEDUCA_ENV_TENANT_ID`, `STORAGE_PROVIDER`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`, `NODE_ENV`.

- [ ] **Step 2: Criar `.env.example`**

Conteúdo completo:

```dotenv
# =====================================================================
# Variáveis de ambiente — plataforma_simulado
# Copie para `.env` e preencha com valores reais. NUNCA commite o `.env`.
# Deploy em produção: ver docs/deploy/runbook-vps.md
# =====================================================================

NODE_ENV=development

# --- Supabase (Postgres/Auth/Storage gerenciado) --------------------------
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# --- Fila / PDF (Redis + Gotenberg, consumidos pelo worker) ---------------
REDIS_URL=redis://localhost:6379
GOTENBERG_URL=http://localhost:3001
WEB_INTERNAL_URL=http://localhost:3000
PDF_RENDER_SECRET=
PDF_PUBLIC_BASE=

# --- Segredos internos da app -----------------------------------------------
CRON_SECRET=
APP_ENCRYPTION_KEY=
ALUNO_SESSION_SECRET=

# --- Curseduca (integração externa) ------------------------------------------
CURSEDUCA_API_KEY=
CURSEDUCA_BASE_URL=https://prof.curseduca.pro
CURSEDUCA_USER=
CURSEDUCA_PASS=
CURSEDUCA_WEBHOOK_SECRET=
CURSEDUCA_ENV_TENANT_ID=

# --- App pública / multi-tenant -----------------------------------------------
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_TENANT_SLUG=demo

# --- Storage (default 'supabase', já funcional). Não usado neste deploy. ------
STORAGE_PROVIDER=supabase
# S3_ENDPOINT=
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
# S3_REGION=
# S3_PUBLIC_BASE_URL=
# GCS_PROJECT_ID=
# GCS_CLIENT_EMAIL=
# GCS_PRIVATE_KEY=
```

- [ ] **Step 3: Verificar cobertura (nenhuma variável do código ficou de fora)**

Run:
```bash
comm -23 \
  <(grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*" apps/web/app apps/web/lib apps/web/middleware.ts apps/worker/src packages/shared/src 2>/dev/null | sed 's/process\.env\.//' | sort -u) \
  <(grep -oE "^[A-Z_][A-Z0-9_]*=" .env.example | sed 's/=//' | sort -u)
```
Expected: nenhuma saída (toda variável usada no código aparece no `.env.example`).

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: adiciona .env.example documentando variáveis de ambiente"
```

---

### Task 4: Traefik no `docker-compose.portainer.yml`

**Files:**
- Modify: `docker-compose.portainer.yml`

**Interfaces:**
- Produces: rede externa `traefik` (nome real configurável via env `TRAEFIK_NETWORK`, default `traefik-public`), labels do Traefik no serviço `web` usando o router `plataforma-simulado`, variável `APP_DOMAIN` (default `simulado.revisaopge.com.br`), variável `TRAEFIK_CERTRESOLVER` (default `letsencrypt`), variável `IMAGE_TAG` (default `latest`) usada nas imagens `web` e `worker` para permitir rollback trocando só essa variável no Portainer.

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Novo conteúdo completo de `docker-compose.portainer.yml`:

```yaml
# =====================================================================
# STACK PORTAINER (Swarm) — App + PDF assíncrono (worker + Gotenberg)
# Usa IMAGENS PRONTAS do GHCR (buildadas pelo GitHub Actions). Swarm não builda.
#
# ANTES DE SUBIR:
#  1) O workflow .github/workflows/docker-publish.yml precisa ter rodado com sucesso
#     (publica as imagens web e worker no ghcr.io). Deixe os 2 pacotes PÚBLICOS
#     (GitHub → Packages → cada pacote → Package settings → Change visibility → Public),
#     senão o Swarm não consegue baixar.
#  2) O schema do Supabase de produção já está aplicado — não rode migrations
#     como parte deste deploy (ver docs/deploy/runbook-vps.md).
#  3) Preencha as variáveis em "Environment variables" no Portainer (ver
#     docs/deploy/runbook-vps.md), incluindo TRAEFIK_NETWORK, TRAEFIK_CERTRESOLVER
#     e APP_DOMAIN — descobertos rodando `docker network ls` / inspecionando o
#     serviço do Traefik já rodando na VPS.
#
# Roteamento HTTPS é feito pelo Traefik já existente na VPS (rede externa
# TRAEFIK_NETWORK) — este compose não publica porta nenhuma diretamente.
# =====================================================================

services:
  # App Next.js — UI, enfileira PDFs e serve as páginas /imprimir
  web:
    image: ghcr.io/revisaoprojetos/plataforma_simulado:${IMAGE_TAG:-latest}
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - REDIS_URL=redis://redis:6379
      - PDF_RENDER_SECRET=${PDF_RENDER_SECRET}
      - WEB_INTERNAL_URL=http://web:3000
      - CRON_SECRET=${CRON_SECRET}
      # Criptografa em repouso os segredos no banco (credenciais Curseduca por tenant)
      - APP_ENCRYPTION_KEY=${APP_ENCRYPTION_KEY}
      # Opcional: tenant que pode usar as credenciais Curseduca do .env (os demais usam o banco)
      - CURSEDUCA_ENV_TENANT_ID=${CURSEDUCA_ENV_TENANT_ID}
    networks:
      - default
      - traefik
    deploy:
      replicas: 1
      restart_policy:
        condition: any
      labels:
        - "traefik.enable=true"
        - "traefik.docker.network=${TRAEFIK_NETWORK:-traefik-public}"
        - "traefik.http.routers.plataforma-simulado.rule=Host(`${APP_DOMAIN:-simulado.revisaopge.com.br}`)"
        - "traefik.http.routers.plataforma-simulado.entrypoints=websecure"
        - "traefik.http.routers.plataforma-simulado.tls=true"
        - "traefik.http.routers.plataforma-simulado.tls.certresolver=${TRAEFIK_CERTRESOLVER:-letsencrypt}"
        - "traefik.http.services.plataforma-simulado.loadbalancer.server.port=3000"

  # Consome a fila, chama o Gotenberg, sobe o PDF no bucket `pdfs`
  worker:
    image: ghcr.io/revisaoprojetos/plataforma_simulado-worker:${IMAGE_TAG:-latest}
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - REDIS_URL=redis://redis:6379
      - GOTENBERG_URL=http://gotenberg:3000
      - WEB_INTERNAL_URL=http://web:3000
      # Auto-encerramento: mesmo valor do CRON_SECRET do web (worker chama /api/cron/encerrar-expirados a cada 60s)
      - CRON_SECRET=${CRON_SECRET}
      # PDF_PUBLIC_BASE é opcional: sem ela, o worker usa o getPublicUrl do Supabase.
    networks:
      - default
    deploy:
      replicas: 1
      restart_policy:
        condition: any

  # Motor de PDF (Chromium embutido) — renderiza /imprimir fora do app
  gotenberg:
    image: gotenberg/gotenberg:8
    command:
      - gotenberg
      - --chromium-allow-list=.*
      - --api-timeout=120s
    networks:
      - default
    deploy:
      replicas: 1
      restart_policy:
        condition: any

  # Fila (compartilhada web=produtor / worker=consumidor)
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - default
    deploy:
      replicas: 1
      restart_policy:
        condition: any

networks:
  default:
  traefik:
    external: true
    name: ${TRAEFIK_NETWORK:-traefik-public}

volumes:
  redis_data:
```

- [ ] **Step 2: Validar sintaxe YAML**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('docker-compose.portainer.yml', encoding='utf-8')); print('YAML OK')"
```
Expected: `YAML OK` (sem exceção).

- [ ] **Step 3: Verificar que nenhuma porta é publicada diretamente**

Run: `grep -n "ports:" docker-compose.portainer.yml`
Expected: nenhuma saída (o arquivo não deve ter chave `ports:` em nenhum serviço).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.portainer.yml
git commit -m "feat(deploy): integra docker-compose.portainer.yml ao Traefik existente

Substitui a publicação direta da porta 3000 por labels do Traefik
(rede externa configurável via TRAEFIK_NETWORK, domínio via APP_DOMAIN,
certresolver via TRAEFIK_CERTRESOLVER). Também parametriza a tag das
imagens via IMAGE_TAG para permitir rollback trocando só essa variável
no Portainer."
```

---

### Task 5: Taguear imagens por SHA do commit no workflow (suporte a rollback)

**Files:**
- Modify: `.github/workflows/docker-publish.yml:36-57`

**Interfaces:**
- Produces: cada push na `main` publica as imagens com 2 tags: `:latest` e `:${{ github.sha }}` — permitindo fixar `IMAGE_TAG=<sha>` no Portainer (Task 4) para rollback a uma versão específica.

- [ ] **Step 1: Editar o step "Build e push (app Next.js — apps/web)"**

Trocar (linha ~42):
```yaml
          tags: ghcr.io/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_NAME }}:latest
```
por:
```yaml
          tags: |
            ghcr.io/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_NAME }}:latest
            ghcr.io/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
```

- [ ] **Step 2: Editar o step "Build e push (worker BullMQ — apps/worker)"**

Trocar (linha ~55):
```yaml
          tags: ghcr.io/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_NAME }}-worker:latest
```
por:
```yaml
          tags: |
            ghcr.io/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_NAME }}-worker:latest
            ghcr.io/${{ env.IMAGE_OWNER }}/${{ env.IMAGE_NAME }}-worker:${{ github.sha }}
```

- [ ] **Step 3: Validar sintaxe YAML**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/docker-publish.yml', encoding='utf-8')); print('YAML OK')"
```
Expected: `YAML OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: tagueia imagens também com o SHA do commit para permitir rollback"
```

---

### Task 6: Escrever o runbook de deploy

**Files:**
- Create: `docs/deploy/runbook-vps.md`

**Interfaces:**
- Consumes: nomes de variáveis definidos nas Tasks 3 e 4 (`TRAEFIK_NETWORK`, `TRAEFIK_CERTRESOLVER`, `APP_DOMAIN`, `IMAGE_TAG`, e a lista completa de `.env.example`).
- Produces: documento autocontido que o usuário segue manualmente para o primeiro deploy.

- [ ] **Step 1: Criar o runbook**

Conteúdo completo de `docs/deploy/runbook-vps.md`:

````markdown
# Runbook: primeiro deploy da plataforma_simulado na VPS

Pré-requisitos: VPS com Docker Swarm + Portainer + Traefik já rodando, acesso
SSH à VPS, acesso ao painel de DNS de `revisaopge.com.br`, acesso à UI do
Portainer, e o `.env` local que já aponta para o Supabase de produção
(`tlaxvhcqswiotzibulyo.supabase.co`).

**Não rode nenhuma migration do Supabase como parte deste runbook** — o
schema de produção já está atualizado (ver `docs/superpowers/specs/2026-07-14-deploy-vps-design.md`).

## 1. DNS

Aponte um registro `A` (ou `CNAME`) de `simulado.revisaopge.com.br` para o IP
público da VPS. Confirme a propagação:

```bash
nslookup simulado.revisaopge.com.br
```

## 2. Confirmar as imagens no GHCR

No GitHub, em **Actions**, confirme que o workflow "Build e Push para GHCR"
rodou com sucesso no commit mais recente da `main`. Em seguida, em
**Packages** do repositório, confirme que `plataforma_simulado` e
`plataforma_simulado-worker` estão como **Public** (Package settings →
Change visibility).

## 3. Descobrir a rede e o certresolver do Traefik

Via SSH na VPS:

```bash
docker network ls --filter driver=overlay
```

Anote o nome da rede overlay usada pelo Traefik (ex.: `traefik-public`,
`traefik_default`) — esse valor vai na variável `TRAEFIK_NETWORK`.

```bash
docker service ls --filter name=traefik
docker service inspect <nome_do_servico_traefik> --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}'
```

Procure um argumento `--certificatesresolvers.<nome>.acme...` — esse
`<nome>` vai na variável `TRAEFIK_CERTRESOLVER`.

## 4. Criar a Stack no Portainer

1. Portainer → **Stacks** → **Add stack**.
2. Nome: `plataforma-simulado`.
3. Cole o conteúdo de `docker-compose.portainer.yml` (branch `main`).
4. Em **Environment variables**, adicione (valores reais vêm do seu `.env`
   local, exceto onde indicado):

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | do `.env` local |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | do `.env` local |
   | `SUPABASE_SERVICE_ROLE_KEY` | do `.env` local |
   | `PDF_RENDER_SECRET` | do `.env` local |
   | `CRON_SECRET` | do `.env` local |
   | `APP_ENCRYPTION_KEY` | **exatamente** o mesmo valor do `.env` local (protege dados já criptografados no banco) |
   | `CURSEDUCA_ENV_TENANT_ID` | do `.env` local (se aplicável) |
   | `TRAEFIK_NETWORK` | nome descoberto no passo 3 |
   | `TRAEFIK_CERTRESOLVER` | nome descoberto no passo 3 |
   | `APP_DOMAIN` | `simulado.revisaopge.com.br` |
   | `IMAGE_TAG` | `latest` (mudar para um SHA específico só em rollback) |

5. Clique em **Deploy the stack**.

## 5. Acompanhar os logs

```bash
docker service logs -f plataforma-simulado_web
docker service logs -f plataforma-simulado_worker
docker service logs -f plataforma-simulado_gotenberg
docker service logs -f plataforma-simulado_redis
```

Espere os 4 serviços ficarem com réplicas `1/1` em `docker service ls`.

## 6. Validação

- [ ] `https://simulado.revisaopge.com.br` carrega com certificado válido (cadeado no navegador).
- [ ] Login admin funciona (`/login` → `/admin`).
- [ ] Login do portal do aluno funciona.
- [ ] Gerar um PDF de teste (caderno ou relatório) completa com sucesso — isso exercita `web` → fila Redis → `worker` → `gotenberg` → Supabase Storage numa única checagem.

## Rollback

As imagens são publicadas com 2 tags a cada push: `:latest` e `:<sha-do-commit>`.
Para reverter para um commit anterior específico:

1. Descubra o SHA do commit desejado (`git log --oneline` no repositório).
2. No Portainer, edite a stack `plataforma-simulado` → **Environment variables**
   → mude `IMAGE_TAG` para esse SHA (ex.: `IMAGE_TAG=a1b2c3d...`).
3. **Update the stack** (com "Re-pull image" habilitado).

Não há rollback de banco necessário neste deploy (nenhuma migration foi
executada).
````

- [ ] **Step 2: Verificar que os nomes de variáveis batem com o compose (Task 4) e o .env.example (Task 3)**

Run:
```bash
grep -oE "\\\$\{[A-Z_]+" docker-compose.portainer.yml | sed 's/\${//' | sort -u
grep -oE "\`[A-Z_]+\`" docs/deploy/runbook-vps.md | tr -d '`' | sort -u
```
Confirme manualmente que toda variável usada no compose (primeira lista) aparece documentada no runbook (segunda lista) — em especial `TRAEFIK_NETWORK`, `TRAEFIK_CERTRESOLVER`, `APP_DOMAIN`, `IMAGE_TAG`.

- [ ] **Step 3: Commit**

```bash
git add docs/deploy/runbook-vps.md
git commit -m "docs: adiciona runbook de primeiro deploy na VPS"
```

---

### Task 7: Push para `main` e verificar o build no GitHub Actions

**Files:** nenhum (ação de integração/verificação).

**Interfaces:**
- Consumes: todos os commits das Tasks 1–6.
- Produces: imagens atualizadas publicadas no GHCR (`:latest` e `:<sha>`), prontas para o runbook (Task 6) ser executado na VPS.

- [ ] **Step 1: Confirmar com o usuário antes de dar push**

Esta é uma ação de estado compartilhado (dispara o workflow real de build/publish
no GitHub Actions, visível externamente). **Pergunte explicitamente ao usuário
se pode dar `git push` para `main` agora**, mostrando `git log --oneline -7`
com os commits das Tasks 1–6. Só prossiga com o Step 2 após confirmação
explícita.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Verificar o workflow no GitHub Actions**

```bash
gh run watch --exit-status
```

Expected: o job `build-and-push` termina com sucesso (exit status 0). Isso é
a verificação real de que `apps/web` e `apps/worker` buildam sem erros de
TypeScript/Next.js — não foi possível rodar `pnpm build` localmente porque
`pnpm`/`node_modules` não estão instalados neste ambiente.

- [ ] **Step 4: Se o build falhar**

Rode `gh run view --log-failed` para ver o erro, corrija no arquivo indicado,
repita a partir do commit correspondente (Task 1, 4 ou 5, conforme o
arquivo), e volte ao Step 2 deste Task.

- [ ] **Step 5: Confirmar visibilidade dos pacotes GHCR**

No GitHub, em **Packages** do repositório (ou da organização
`revisaoprojetos`), confirme que `plataforma_simulado` e
`plataforma_simulado-worker` estão com visibilidade **Public** — necessário
para o Swarm baixar as imagens sem autenticação (ver runbook, passo 2).

Com isso, o repositório está pronto e o usuário pode seguir
`docs/deploy/runbook-vps.md` para o deploy manual na VPS.
