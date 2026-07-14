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
