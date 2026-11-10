# Checklist de segurança pré-go-live — Gerenciador de Vídeo (5.3)

Marque cada item com evidência (comando + resultado, ou print) e **data/responsável**. Nenhum item é "N/A" sem justificativa escrita. Itens marcados `[staging]` devem ser exercitados no staging; `[prod-readonly]` só com leitura em produção (nunca mutação de teste).

Responsável: ________  Data: ________  SHA/imagem: ________

## A. Isolamento entre empresas e entre alunos

- [ ] Suíte e2e de vazamento entre empresas verde (ADR 0006 registra a decisão: RLS **ou** testes e2e ampliados) — `npm run test:e2e` (precisa Postgres/Redis do CI/staging)
- [ ] Se RLS foi adotada: `SET LOCAL app.tenant_id` em toda transação; consulta sem o setting retorna 0 linhas `[staging]`
- [ ] Aluno da empresa A não obtém playback, manifest, chave, legenda ou progresso de vídeo da empresa B (token de playback carrega `tid`/`vid`/`lid`; testar com token trocado) `[staging]`
- [ ] Aluno sem matrícula vigente (revogada/expirada) recebe 403 em `/lessons/:id/playback` e em `/playback/renew` `[staging]`
- [ ] Revogação imediata: desativar usuário/empresa derruba acesso em <= 30 s (cache do guard) e invalida refresh/`ps:` `[staging]`
- [ ] Analytics e relatórios só enxergam `role=aluno` com matrícula vigente; paginados e com teto (1.7, 1.8)
- [ ] 1 empresa do serviço por tenant nosso (D6); nenhuma empresa compartilhada entre tenants

## B. Rede, CORS e proxy

- [ ] `TRUST_PROXY=1` em produção e `TRUST_PROXY_REQUIRED=true` (boot falha se 0) — `docker service inspect <stack>_video-api --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}'`
- [ ] IP real chega em `req.ip` (log/limite por IP mostra o IP do cliente, não o do Traefik) `[staging]`
- [ ] CORS/`allowedDomains` **dinâmicos por empresa**: origem não listada recebe 403; lista vazia em produção = **negar** (1.9) `[staging]`: `curl -si -H "Origin: https://malicioso.example" -X POST $API/v1/lessons/<id>/playback -H "Authorization: Bearer <jwt>"`
- [ ] `CORS_ORIGINS` sem `localhost`/`127.0.0.1` (o boot recusa — conferir que a validação `assertProductionSafe` roda em produção)
- [ ] Traefik: **só** `video-api.revisaopge.com.br`, TLS válido (certresolver), HTTP->HTTPS; `/metrics` e `/docs` (Swagger) **não** expostos publicamente (ou protegidos por token/IP)
- [ ] Rota `/mcp` bloqueada no Traefik (D4) e `SWAGGER_ENABLED=false` em produção
- [ ] Postgres e Redis do serviço **sem porta publicada** e só na rede interna do stack; senha forte no Redis se aplicável

## C. Segredos e chaves

- [ ] Nenhum segredo em repositório/imagem: `git grep -nE "(AKIA|SECRET|PRIVATE KEY|password=)" -- services/video | head` (revisar achados; exemplos `.env.example` ok)
- [ ] `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` **diferentes**, >= 32 bytes aleatórios, fora dos padrões `troque|changeme|example|test-` (o boot recusa)
- [ ] `METRICS_TOKEN` >= 16 caracteres, só no Prometheus
- [ ] **Chave de integração** (`access:manage`) existe só no servidor Next (`VIDEO_INTEGRATION_KEY`); `git grep VIDEO_INTEGRATION_KEY -- apps/web` não aparece em componente "use client"; nenhum `NEXT_PUBLIC_*` com ela
- [ ] Chave S3 **dedicada** ao bucket de vídeo (D1), com escopo mínimo; não é a chave dos PDFs/Hetzner dos outros buckets
- [ ] Bucket **privado** (sem ACL pública, sem policy aberta): `npm run s3:audit -w apps/api` sai com 0 e sem `AVISO`
- [ ] CORS do bucket aplicado e restrito aos domínios do player: `npm run s3:cors -w apps/api` (conferir domínios)
- [ ] `accessEndpointEnabled` ligado **somente** nas empresas necessárias, com `ACCESS_ENDPOINT_ENABLED=true` no serviço (trava dupla); desligado, as rotas respondem 404
- [ ] Plano de **rotação de segredos** documentado e ensaiado no staging (ver §H): JWT, integração, S3, DB, Redis, `METRICS_TOKEN`

## D. Autenticação, sessão e rate limit

- [ ] `RATE_LIMIT_ENABLED=true` (boot recusa false em produção)
- [ ] Rate limit **falha fechado** nas rotas de auth quando o Redis cai (1.15) `[staging]`: parar Redis e tentar `POST /v1/auth/login` -> deve negar, não liberar
- [ ] Lockout por conta + IP funcionando (8 tentativas/15 min por conta; 30/10 min por IP) `[staging]`
- [ ] `sessionId` gerado no **servidor** (1.3): enviar `sessionId` no body não o altera `[staging]`
- [ ] Limite de telas simultâneas (`MAX_CONCURRENT_STREAMS`) vale para aluno; sessão encerra em `/playback/end`
- [ ] Token de playback de 5 min, JWT do aluno de 15 min, **sem refresh** para sessões de integração (D7)
- [ ] Marca d'água no player com nome/e-mail do aluno (dissuasão de vazamento); conclusão de aula **não** usada para certificado sem regra extra (D8)

## E. Conteúdo, upload e armazenamento

- [ ] Segmentos HLS cifrados AES-128; chave só em `GET /v1/hls/key/:id` com `Cache-Control: no-store` e token válido `[staging]`
- [ ] Manifests/chave/legendas com `no-store`; URLs de segmento pré-assinadas com TTL curto (`HLS_SEGMENT_URL_TTL`, revisar se 1 h é aceitável)
- [ ] Upload: tamanho máximo declarado, cota por empresa (`MAX_TENANT_STORAGE_BYTES`), validação ffprobe/magic bytes no worker (1.13), multipart abandonado expira (1.12)
- [ ] Exclusão de aula/módulo/curso descarta o vídeo (GC) e `s3:audit` não reporta órfãos
- [ ] Worker roda sem privilégios, `/tmp` com checagem de espaço, timeout por job, FFmpeg com `-threads` limitado; nenhum job lê caminhos fora do prefixo da empresa

## F. LGPD

- [ ] Dados pessoais armazenados mapeados (nome, e-mail, `externalId`, IP, device, progresso) e base legal registrada
- [ ] Exportação e exclusão do titular funcionam (`/privacy`): exclusão/anonimização limpa `externalId`, `first_access_tokens`, `externalRef` (1.14) `[staging]`
- [ ] Aluno sem senha (via integração) consegue pedir autoexclusão com confirmação (1.14)
- [ ] Logs/auditoria sem token, senha, chave nem corpo de requisição sensível; logs de acesso retêm IP pelo prazo definido
- [ ] Retenção definida para `watch_sessions`/`watch_ranges` (tabelas grandes) e para backups (backup contém dados pessoais: criptografado, bucket separado, acesso restrito)
- [ ] DPA/contrato com o provedor de armazenamento (Hetzner) e política de privacidade atualizada citando vídeo/telemetria de progresso

## G. Observabilidade e abuso

- [ ] Prometheus raspa `/metrics` com token; alertas ativos: `ConsolidadorAtrasado`, fila de heartbeat >= 80% do teto (1.16), taxa de 5xx, falhas de job do worker
- [ ] Logs com correlationId; sem dados sensíveis (ver §F)
- [ ] Fila de heartbeat tem política documentada ao chegar ao teto (descartar o mais antigo? alertar?)
- [ ] `npm run s3:audit` agendado (cron/alerta) e com destinatário

## H. Rotação de segredos (ensaio no staging)

- [ ] JWT: trocar segredo derruba sessões; usuários refazem login; procedimento e janela comunicados
- [ ] Chave de integração: criar nova, atualizar `VIDEO_INTEGRATION_KEY` no Portainer/Next, só então revogar a antiga
- [ ] Chave S3: criar 2ª chave, atualizar api+worker, validar `npm run smoke:s3 -w apps/api`, revogar a antiga
- [ ] Senha do Postgres/Redis: rodar com `video-migrate`/restart planejado; documentado no `RUNBOOK.md`
- [ ] `APP_ENCRYPTION_KEY` do app principal **não** é trocada junto (credenciais Curseduca somem se mudar)

## I. Backups e restore

- [ ] `pg_dump` diário do banco de vídeo para bucket **separado**, com retenção definida e lifecycle do multipart
- [ ] **Restore testado** em ambiente descartável: `pg_restore`/`psql` até subir a API apontando para o restore e `GET /health` + playback de 1 aula ok (anexar data e tempo gasto)
- [ ] RPO/RTO aceitos pelo negócio escritos (ex.: perder até 24 h de progresso é aceitável? sim/não)
- [ ] Os vídeos originais/renditions têm cópia ou o reprocesso a partir do original foi ensaiado (`reprocess`)
- [ ] Volumes do Postgres/Redis no nó correto (placement) e com monitoramento de disco

## J. Gate final

- [ ] Todos os itens acima marcados ou com exceção assinada
- [ ] `npm run typecheck`, `npm run lint`, `npm test` verdes; e2e verde no CI/staging
- [ ] Revisão do `revisor-seguranca` registrada (achados críticos = 0; altos = 0 ou aceitos por escrito)
- [ ] Carga de staging aprovada (`CARGA-E-EGRESS.md` §3) e piloto planejado (`PILOTO-E-ROLLBACK.md`)
