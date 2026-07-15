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

Note que `NEXT_PUBLIC_APP_URL` já vem embutida na imagem em build-time (como
build-arg no workflow, fixada para `https://simulado.revisaopge.com.br`) —
não é necessário (nem tem efeito) defini-la nas variáveis de ambiente do
Portainer.

## 3. Rede e certresolver do Traefik

Já conhecidos a partir da stack Traefik desta VPS — não é preciso descobrir
nada, os defaults do `docker-compose.portainer.yml` já usam esses valores:

- `TRAEFIK_NETWORK` = `network_swarm_public` (rede overlay externa que o
  Traefik escuta — `--providers.docker.network=network_swarm_public` na
  stack do Traefik).
- `TRAEFIK_CERTRESOLVER` = `letsencryptresolver` (nome do resolver ACME
  configurado no Traefik — `--certificatesresolvers.letsencryptresolver.*`).

Só é preciso preenchê-las explicitamente no Portainer (passo 4) se algum dia
esses nomes mudarem na stack do Traefik; caso contrário os defaults do
compose já bastam.

**Placement:** esta VPS tem 2 nodes no Swarm — o manager (`node.role ==
manager`, onde o Traefik está fixado) e um worker. O
`docker-compose.portainer.yml` já restringe os 4 serviços desta stack a
`node.role == worker`, então não é preciso nenhuma configuração adicional
para garantir que rodem no node correto.

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
   | `ALUNO_SESSION_SECRET` | do `.env` local |
   | `APP_ENCRYPTION_KEY` | **exatamente** o mesmo valor do `.env` local (protege dados já criptografados no banco) |
   | `CURSEDUCA_ENV_TENANT_ID` | do `.env` local (se aplicável) |
   | `TRAEFIK_NETWORK` | opcional — default já é `network_swarm_public` (ver passo 3) |
   | `TRAEFIK_CERTRESOLVER` | opcional — default já é `letsencryptresolver` (ver passo 3) |
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

1. Descubra o SHA do commit desejado (`git log --format=%H -n 5` no repositório).
2. No Portainer, edite a stack `plataforma-simulado` → **Environment variables**
   → mude `IMAGE_TAG` para esse SHA (ex.: `IMAGE_TAG=1a2b3c4d5e6f7890abcdef1234567890abcdef12`).
3. **Update the stack** (com "Re-pull image" habilitado).

Não há rollback de banco necessário neste deploy (nenhuma migration foi
executada).
