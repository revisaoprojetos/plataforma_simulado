# Deploy da plataforma_simulado em VPS — Design

Data: 2026-07-14

## Contexto

`plataforma_simulado` é um monorepo pnpm/Turborepo com:

- `apps/web` — Next.js 16 (App Router), serve UI + API (`app/api/*`), build `output: standalone`.
- `apps/worker` — worker Node.js (BullMQ sobre Redis) que consome jobs de geração de PDF, chama o Gotenberg e sobe o resultado no Supabase Storage.
- `packages/shared` — código TS compartilhado.
- Banco/Auth/Storage: **Supabase** (Postgres gerenciado + Auth + Storage), externo à VPS.

O time já deixou o caminho de deploy pronto no repositório: `Dockerfile` em `apps/web` e `apps/worker`, `docker-compose.portainer.yml` (stack para Docker Swarm, usa imagens do GHCR), e `.github/workflows/docker-publish.yml` (build + push das imagens no push para `main`, com job de deploy via SSH desativável por ausência de secrets).

A VPS de destino já tem **Docker Swarm + Portainer** configurados, e um **Traefik** já rodando como reverse proxy/SSL para outros serviços. O domínio de destino é `simulado.revisaopge.com.br`.

## Achados da investigação do banco de produção

Antes de desenhar o deploy, foi necessário investigar uma divergência entre duas pastas de migrations: `supabase/migrations/` (raiz, 54 arquivos) e `apps/web/supabase/migrations/` (7 arquivos). Consultando o banco de produção (`tlaxvhcqswiotzibulyo.supabase.co`) diretamente via REST, confirmou-se que:

- **As migrations das duas pastas já foram aplicadas em produção**, incluindo a mais sensível: `20260626000004_rename_prefixo_simulado.sql`, que renomeia `tenants → simulado_tenants`, `estudantes → simulado_estudantes` etc. Essa renomeação já ocorreu (`simulado_tenants` existe com 2 tenants reais: `revisao` e `demo`; as tabelas com nome antigo não existem mais).
- Essa migration de rename contém `DROP TABLE IF EXISTS public.simulado_tenants CASCADE` antes do rename — **se for executada de novo agora, apaga a tabela real de produção**, pois a tabela de origem (`tenants`) não existe mais para ser renomeada no lugar.
- **Conclusão: o schema de produção já está correto e à frente do que qualquer uma das duas pastas isoladamente registra no git.** Este deploy não vai rodar nenhuma migration contra produção — só reorganizar o histórico no git (ver "Correções no repositório" abaixo) para refletir a realidade e evitar reincidência.

## Escopo deste deploy

1. Corrigir o repositório para ficar deploy-ready (Traefik, migrations, docs).
2. Produzir um runbook para o usuário subir a stack (`web`, `worker`, `gotenberg`, `redis`) no Portainer/Swarm existente, atrás do Traefik existente, em `simulado.revisaopge.com.br`.
3. Validar a stack no ar (login, geração de PDF ponta a ponta).
4. Deixar definido um caminho de rollback simples.

## Fora de escopo (explicitamente adiado)

- **Migração do storage de PDFs para MinIO/S3.** O código hoje usa o Supabase Storage diretamente (`supabase.storage.from('pdfs')` em `apps/worker/src/processors/pdf-caderno.ts` e `pdf-relatorio.ts`, e em `apps/web/lib/caderno-designer/hospedar-imagens.ts`) — não passa pela camada de abstração `apps/web/lib/storage/`, que suporta S3 mas ainda não está "ligada" a nenhuma feature, e o SDK `@aws-sdk/client-s3` não está instalado. Adotar MinIO exige mudança de código, não só infraestrutura. Este deploy sobe com Supabase Storage, como o código já funciona hoje. MinIO fica como projeto futuro separado (seu próprio design).
- **Automação do CI/CD** (secrets `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY` no GitHub Actions). O primeiro deploy é manual via Portainer; a automação é decidida depois de validar que o processo manual funciona.

## Correções no repositório (antes do runbook)

### 1. Traefik no `docker-compose.portainer.yml` (obrigatório)

Hoje o serviço `web` publica `3000:3000` diretamente (modo ingress do Swarm, expõe a porta em todos os nós). Isso será substituído por:

- Labels do Traefik no serviço `web`: `traefik.enable=true`, router com `Host(\`simulado.revisaopge.com.br\`)`, entrypoint `websecure`, `tls.certresolver=<resolver>`, e `loadbalancer.server.port=3000`.
- O serviço `web` passa a se conectar também à rede overlay externa do Traefik (nome exato a ser confirmado na VPS via `docker network ls` — o runbook cobre essa descoberta).
- Remoção da publicação direta da porta 3000, para que todo o tráfego HTTPS passe pelo Traefik.

Os demais serviços (`worker`, `gotenberg`, `redis`) continuam sem exposição pública — só acessíveis internamente pela rede da stack, como já é hoje.

### 2. Consolidação das migrations (recomendado)

- Copiar os 7 arquivos de `apps/web/supabase/migrations/` para `supabase/migrations/` (raiz).
- Renomear os 2 arquivos com timestamp colidindo com a raiz para não sobrepor migrations distintas já aplicadas:
  - `20260710000001_relatorio_eventos.sql` → novo timestamp após o último da raiz.
  - `20260710000002_pasta_tipo.sql` → novo timestamp após o último da raiz.
- Remover a pasta `apps/web/supabase/migrations/`.
- **Não executar `supabase db push` nem qualquer migration contra produção como parte desta tarefa** — é reorganização do histórico local para bater com o estado real do banco (já aplicado, conforme achados acima).

### 3. `.env.example` (recomendado)

Criar na raiz documentando (sem valores reais) as variáveis usadas pelo `web` e pelo `worker`, agrupadas por finalidade: Supabase, Redis, Gotenberg/PDF, segredos internos da app, storage (`STORAGE_PROVIDER` e variantes S3/GCS opcionais, hoje não usadas), Curseduca, e app pública (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`).

### 4. Rota `/api/health` (opcional, baixa prioridade)

Criar `apps/web/app/api/health/route.ts` retornando 200 simples. Não bloqueia o deploy via Portainer (que não define healthcheck para `web` em `docker-compose.portainer.yml`), mas corrige a referência já existente em `docker-compose.yml` (usado só para build local) e serve de base caso o Traefik ou o Swarm venham a usar healthcheck no futuro.

## Variáveis de ambiente necessárias (preenchidas no Portainer, não em arquivo)

O usuário já tem um `.env` local funcional apontando para o mesmo projeto Supabase de produção — os valores serão copiados de lá diretamente para a UI do Portainer (nunca via git ou chat). Grupos de variáveis:

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Fila/PDF**: `REDIS_URL` (interno: `redis://redis:6379`), `GOTENBERG_URL` (interno: `http://gotenberg:3000`), `WEB_INTERNAL_URL` (interno: `http://web:3000`), `PDF_RENDER_SECRET`, `PDF_PUBLIC_BASE` (opcional).
- **Segredos internos**: `CRON_SECRET`, `APP_ENCRYPTION_KEY` (⚠️ deve ser exatamente o mesmo valor já usado localmente — protege dados já criptografados em `simulado_curseduca_config.senha`), `ALUNO_SESSION_SECRET`.
- **Curseduca**: `CURSEDUCA_API_KEY`, `CURSEDUCA_BASE_URL`, `CURSEDUCA_USER`, `CURSEDUCA_PASS`, `CURSEDUCA_WEBHOOK_SECRET`, `CURSEDUCA_ENV_TENANT_ID`.
- **App pública**: `NEXT_PUBLIC_APP_URL` (`https://simulado.revisaopge.com.br`), `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`.
- **Storage**: `STORAGE_PROVIDER` não definido (default `supabase`, já funcional) — variáveis `S3_*`/`GCS_*` não se aplicam neste deploy.
- `NODE_ENV=production` (fixo no compose).

`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` também precisam estar disponíveis como **build args** ao gerar a imagem `web` (já configurado no workflow via secrets do GitHub Actions — confirmar que esses secrets existem no repositório).

## Runbook de deploy (alto nível)

1. Apontar DNS de `simulado.revisaopge.com.br` para o IP da VPS.
2. Confirmar que o workflow do GitHub Actions rodou com sucesso na `main` e que os pacotes GHCR (`plataforma_simulado`, `plataforma_simulado-worker`) estão públicos.
3. Descobrir o nome da rede overlay do Traefik na VPS (`docker network ls`) e ajustar o compose se necessário.
4. Criar a Stack no Portainer usando `docker-compose.portainer.yml` (já com labels do Traefik), colando as variáveis de ambiente na UI.
5. Subir a stack e acompanhar os logs dos 4 serviços até estabilizarem.
6. Validar acesso HTTPS, certificado emitido pelo Traefik, login admin/aluno, e um teste de geração de PDF ponta a ponta.

## Rollback

- Imagens devem ser tagueadas por SHA do commit além de `:latest` (ajuste no workflow), permitindo `docker service update --image ghcr.io/.../plataforma_simulado:<sha-anterior>` para reverter rapidamente um serviço específico sem depender de rebuild.
- Como não há migrations a rodar neste deploy, não há necessidade de rollback de banco.

## Riscos e observações

- `APP_ENCRYPTION_KEY` divergente do valor usado localmente quebra a descriptografia de credenciais Curseduca já salvas — deve ser copiado exatamente do `.env` local existente.
- O job `deploy` do workflow atual só atualiza a imagem do serviço `web` via `docker service update` (não atualiza `worker`) e assume um nome de serviço fixo (`plataforma_simulado_app` por padrão) — relevante apenas quando a automação de CI/CD for habilitada (fora de escopo agora), mas vale registrar para quando isso for retomado.
