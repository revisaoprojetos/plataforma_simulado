# API REST (`/v1`)

Swagger interativo em `/docs` (gerado do código; é a fonte final do contrato). Este documento descreve o desenho alvo. Coluna **Marco** indica quando o endpoint entra (ver [roadmap.md](roadmap.md)).

## Convenções
- Base: `/v1`. JSON UTF-8. IDs UUID. Datas ISO-8601 UTC. Tempos de vídeo em **segundos** (float).
- Auth: `Authorization: Bearer <access_jwt>`. Roles: `admin`, `professor`, `aluno`. `—` = público.
- Paginação: `?page=1&limit=20` → `{ data: [], page, limit, total }`.
- Erro: `{ "statusCode": 403, "error": "Forbidden", "message": "…", "correlationId": "…" }`.
- Recurso de **outra empresa** → 404 (nunca 403); sem permissão dentro da empresa → 403. Login com empresa/e-mail/senha inválidos → sempre 401 "Credenciais inválidas".
- Códigos: 400 validação · 401 sem/ token inválido · 403 sem permissão/matrícula · 404 · 409 conflito · 422 regra de negócio · 429 rate limit.
- Cabeçalho `X-Correlation-Id` aceito (8–64 caracteres `A-Za-z0-9._-`; senão é trocado) e **sempre devolvido**; o mesmo valor vai no corpo de erro e nos logs — informe-o ao suporte.
- **Limites de requisição** (429 + `Retry-After` em segundos): login 30/10 min por IP e 8/15 min por conta (acertar a senha zera a conta); renovação de login 60/10 min por IP; abertura de playback 60/min por usuário; manifests/chave/legendas/heartbeat 300/min por sessão de reprodução; upload 120/min por usuário; analytics 60/min por usuário; MCP 120/min por token pessoal; exportação/remoção de dados pessoais 5/h por usuário; demais rotas autenticadas 600/min por usuário. Valores em `apps/api/src/security/rate-limit.service.ts`.
- Erros inesperados viram `500` genérico ("Erro interno. Informe o correlationId…"); JSON inválido → 400 "JSON inválido"; corpo grande demais → 413.
- Idempotência: `heartbeat` por `(sessionId, seq)`; `POST /uploads/:id/complete` idempotente.

## Auth — Marco 1
| Método | Rota | Role | Descrição |
|---|---|---|---|
| POST | `/auth/login` | — | `{tenant, email, password}` → `{accessToken, refreshToken, expiresIn}`; JWT com `sub`, `tid`, `role` |
| POST | `/auth/refresh` | — | `{refreshToken}` → novo par (rotativo; reuso invalida a família) |
| POST | `/auth/logout` | — | `{refreshToken}` → 204; revoga a família do token (idempotente) |
| GET | `/me` | auth | Perfil e role |
| POST/GET/DELETE | `/me/mcp-tokens[/:id]` | login (JWT) | Tokens pessoais do MCP. `POST {name, scopes[], expiresInDays?=90 (máx. 365)}` → `201 {id, name, token, scopes, expiresAt}`: o `token` (`gvmcp_…`) **só aparece nesta resposta**. `GET` lista os ativos (id, name, prefix, scopes, expiresAt, lastUsedAt); `DELETE` revoga (204; de outro usuário = 404). Máx. 10 ativos por usuário (422); aluno não recebe `analytics:read` (403). Um token MCP não gerencia tokens. |

## Plataforma (empresas) — Marco 1
| Método | Rota | Role | Descrição |
|---|---|---|---|
| POST | `/platform/tenants` | platform_admin | Cria empresa `{slug,name,allowedDomains,admin:{email,name,password}}` |
| GET | `/platform/tenants` | platform_admin | Lista empresas |
| PATCH | `/platform/tenants/:id` | platform_admin | Nome, domínios, status (`suspended` bloqueia a empresa) e `accessEndpointEnabled` (liga a [API de integração](#integração--matrícula-genérica-e-sessão-do-aluno--marco-9-) para a empresa; padrão `false`) |
| GET | `/tenant` | auth | Dados da própria empresa |

Todas as rotas abaixo operam **dentro da empresa do token**; recurso de outra empresa → 404.

## Usuários — Marco 1
| Método | Rota | Role | Descrição |
|---|---|---|---|
| POST | `/users` | admin | Cria usuário na própria empresa |
| GET | `/users` | admin, professor | Lista paginada (`page`, `limit` ≤ 100; professor: só seus alunos). `?q=` busca por nome ou e-mail (sem diferenciar maiúsculas; sempre dentro da empresa) |
| PATCH | `/users/:id` | admin | Altera role/nome/ativo |

## Catálogo — Marco 1
| Método | Rota | Role | Descrição |
|---|---|---|---|
| GET | `/courses` | auth | Aluno: matriculados e publicados. Professor: os seus. Admin: todos |
| POST | `/courses` | admin, professor | Cria curso |
| GET/PATCH/DELETE | `/courses/:id` | conforme acesso | Detalhe, edição, remoção |
| GET/POST | `/courses/:id/modules` | prof/admin (POST) | Módulos ordenados |
| PATCH/DELETE | `/modules/:id` | prof/admin | Edita/remove; `position` reordena |
| GET/POST | `/modules/:id/lessons` | prof/admin (POST) | Aulas do módulo |
| GET/PATCH/DELETE | `/lessons/:id` | conforme acesso | Aula (inclui status do vídeo, duração, capítulos) |
| GET/POST | `/courses/:id/enrollments` | dono do curso, admin | Lista / matricula `{userId}` (só alunos da mesma empresa) |
| DELETE | `/courses/:id/enrollments/:userId` | dono do curso, admin | Desmatricula (204) |
| GET | `/me/courses` | aluno | Meus cursos com % de progresso |

## Vídeo / Upload — Marco 2 ✅
Roles: `professor` (dono do curso) e `admin`. Aula de outra empresa → 404; aluno / professor não-dono → 403.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/uploads` | `{lessonId, filename, size, contentType}` → 201 `{videoId, uploadId, partSize, partCount, parts:[{partNumber,url}]}`. Extensões: mp4, m4v, mov, mkv, webm, avi, mpg, mpeg. 413 acima de `MAX_UPLOAD_BYTES` (10 GiB). 409 se a aula já tem vídeo em fila/processando/pronto; vídeo `uploading`/`uploaded`/`failed` é substituído |
| GET | `/uploads/:videoId/parts` | Partes já recebidas pelo S3 (para retomar) |
| POST | `/uploads/:videoId/parts` | `{partNumbers:[…]}` → novas URLs assinadas (200; 2 h de validade) |
| POST | `/uploads/:videoId/complete` | `{parts:[{partNumber,etag}]}` → 202. Exige todas as partes, confere o tamanho final e enfileira o transcode. **Idempotente**. 422 se faltar parte ou o tamanho divergir (vídeo vira `failed`); 503 se a fila estiver fora (vídeo fica `uploaded`) |
| DELETE | `/uploads/:videoId` | 204; aborta o multipart e desvincula a aula (só em `uploading`) |
| GET | `/videos/:id` | `{status, lessonId, originalName, sizeBytes, durationS, renditions, error}` |
| POST | `/videos/:id/reprocess` | 202; refaz o HLS do zero (`uploaded`/`failed`/`ready`; 409 se já na fila) |
| DELETE | `/videos/:id` | 204; remove registro e arquivos do S3 (409 durante o processamento) |

Estados: `uploading → queued → processing → ready | failed` (e `uploaded` = original salvo, fora da fila).
Cliente: envie cada parte com `PUT` na URL assinada e guarde o cabeçalho `ETag` da resposta (o CORS do bucket já o expõe).

## Playback — Marco 3 ✅
Dois tipos de credencial: o **JWT de acesso** do usuário (emissão) e o **token de playback** (entrega). O token de playback é um JWT curto (`PLAYBACK_TOKEN_TTL`, 5 min) assinado com segredo derivado, **não vale como JWT de acesso** (e vice-versa). Vai em `?t=` (hls.js, Safari) ou `Authorization: Bearer`.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/lessons/:id/playback` | JWT (tenant) | Body opcional `{sessionId}` para reaproveitar uma sessão. Reconsulta usuário/empresa/matrícula, exige vídeo `ready` e `Origin` permitida → 200 `{sessionId, playbackToken, expiresAt, expiresIn, manifestUrl, spriteVttUrl, posterUrl, durationS, renditions, watermark:{text}, resumeAt, subtitles:[{lang,url}], chapters:[{startS,title}]}`. 403 sem matrícula / rascunho / domínio não autorizado / empresa suspensa; 409 vídeo indisponível ou **limite de sessões**; 404 aula de outra empresa |
| POST | `/playback/renew` | token | Novo token na mesma sessão (chamar antes de expirar, ~4 min). Reavalia acesso: 403 se desmatriculado/empresa suspensa; 409 se a sessão foi encerrada |
| POST | `/playback/end` | token | 204; libera a vaga da sessão (chamar ao fechar o player) |
| GET | `/hls/:videoId/master.m3u8` | token | Master com `?t=` em cada qualidade |
| GET | `/hls/:videoId/:rendition/index.m3u8` | token | Playlist com segmentos em **URLs assinadas do S3** (`HLS_SEGMENT_URL_TTL`, 1 h) e `#EXT-X-KEY` apontando para a chave da API |
| GET | `/hls/key/:videoId` | token | 16 bytes (`application/octet-stream`, `no-store`) |
| GET | `/hls/:videoId/sprite.vtt` | token | VTT de preview com URL assinada do sprite |

Regras de entrega (todas as rotas por token): token do vídeo da URL (senão 403); **sessão ativa** (senão 401); `Origin`, quando enviada, igual ao site para o qual o token foi emitido (senão 403). Sem `Origin` (player nativo) passa.
**Domínios:** se a empresa tem `allowedDomains`, o playback exige `Origin` válida (exata, `host:porta` ou `*.dominio`); ferramentas sem Origin (curl) precisam enviar o cabeçalho. Lista vazia = sem restrição.
**Sessões simultâneas:** alunos até `MAX_CONCURRENT_STREAMS` (2); professores/admins sem limite. A vaga expira em 2× o TTL do token se o player sumir.
**Marca d'água:** `watermark.text` = "Nome · e***@dominio" para o player desenhar em overlay.
Fluxo do player: `playback` → hls.js com `manifestUrl` → `renew` a cada ~4 min (trocar o token no loader) → `end` ao sair. Se um segmento responder 403 (URL assinada vencida após longa pausa), pedir `renew` e recarregar a playlist.

## Progresso — Marco 4 ✅
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/progress/heartbeat` | token de playback | `{seq, position, rate, quality?, device?}` → **204**. O token já identifica usuário, aula e sessão (por isso não há `lessonId` no corpo). Aceita `?t=` ou `Authorization: Bearer`. 401 se a sessão foi encerrada ou o token expirou |
| POST | `/playback/end?t=<token>` | token | Fecha a sessão de visualização; funciona com `navigator.sendBeacon` (sem cabeçalhos) |
| GET | `/lessons/:id/progress` | JWT | `{lastPos, maxPos, percent, completedAt, ranges:[[ini,fim]]}`. `?userId=` (dono do curso/admin) consulta um aluno; aluno comum → 403; usuário de outra empresa → 404 |
| GET | `/courses/:id/progress` | JWT | `{totalLessons, completedLessons, percent, lessons:[{lessonId,title,percent,completed,lastPos}]}`; também aceita `?userId=` |
| GET | `/me/continue-watching` | JWT | Até 10 aulas começadas (`lastPos` > 5 s), não concluídas, de cursos publicados e matriculados, mais recentes primeiro |
| GET | `/me/history` | JWT | Sessões de visualização paginadas: `{sessionId, lessonId, lessonTitle, courseTitle, startedAt, endedAt, watchedS, avgRate, device}` |

**Contrato do heartbeat (player):** enviar a cada ~10 s **apenas enquanto toca** (pausado = não envia), com `seq` crescente por sessão (1, 2, 3…), `position` em segundos e `rate` atual (0,25–4). Repetir/atrasar um `seq` é inofensivo (ignorado). Ao fechar a aba: último heartbeat com `fetch(..., {keepalive:true})` e `sendBeacon('/v1/playback/end?t=…')`. Heartbeats perdidos offline **não** são recuperados (o trecho simplesmente não conta). Leituras refletem tudo imediatamente (a fila é consolidada antes de responder).

## Conteúdo — Marco 5 ✅
Leitura: qualquer usuário que **veja a aula** (aluno matriculado, dono do curso, admin). Escrita: dono do curso ou admin. Aula de outra empresa → 404.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/lessons/:id/subtitles` | `[{lang}]` |
| POST | `/lessons/:id/subtitles` | `{lang, content}` — `content` é o texto do .vtt (até 2 MB). Guarda em `tenants/{t}/subtitles/{aula}/{lang}.vtt` e **cria/substitui a transcrição** do idioma. 400 se não for WebVTT válido ou sem falas; 409 se a aula ainda não tem vídeo |
| DELETE | `/lessons/:id/subtitles/:lang` | 204; apaga arquivo, registro e transcrição |
| GET | `/lessons/:id/transcript?lang=&q=&from=&to=` | `{lang, languages, segments:[{startS,endS,text}]}`. Sem `lang`, o primeiro idioma (ordem alfabética). `q` filtra por texto sem diferenciar maiúsculas; `from`/`to` pegam as falas que tocam a janela |
| GET | `/lessons/:id/chapters` | `[{startS,title}]` |
| PUT | `/lessons/:id/chapters` | `{chapters:[{startS,title}]}` substitui todos. 422 se dois começam no mesmo instante ou depois do fim do vídeo |
| GET | `/v1/hls/:videoId/subtitles/:lang.vtt?t=` | O .vtt para o `<track>` (token de playback; só a legenda da aula do token) |

O playback também devolve `subtitles:[{lang,url}]` (URL já com token) e `chapters`, então o player não precisa de chamadas extras. **Troque o `t=` pelo token atual antes de buscar a legenda** (ele renova a cada ~4 min).

## Analytics — Marco 6 ✅
Definições em [ADR 0003](adr/0003-analytics-sob-demanda.md): *visualização* = sessão com ≥ 5 s assistidos; *taxa de conclusão* = concluídas ÷ alunos que começaram. Calculado na hora (sem defasagem). Aluno/professor não-dono → 403; outra empresa → 404.

Parâmetros de período: `from`, `to` (data `2026-10-01` ou data-hora; `to` só com data inclui o dia inteiro). Padrão: últimos 30 dias; máximo 366. O período vale para as métricas **de sessão**; retenção, conclusão e progresso são do histórico inteiro.

| Método | Rota | Quem | Descrição |
|---|---|---|---|
| GET | `/analytics/lessons/:id` | dono do curso, admin | `views, uniqueViewers, watchedS, avgWatchedPerViewerS, enrolledStudents, startedStudents, notStartedStudents, completions, completionRate, avgPercentWatched`, `daily[]` (dias sem acesso com zero), `retention{bucketSeconds:5, points[{bucketS,viewers}]}`, `dropoffs[]` (3 maiores quedas: `atS, fromViewers, toViewers, lostViewers`), `playbackRates[{rate,watchedS,percent}]`, `qualities[{quality,…}]`, `devices[{device,sessions,watchedS,percent}]` |
| GET | `/analytics/courses/:id` | dono, admin | `enrolledStudents, activeStudents, totalWatchedS, avgProgressPercent, studentsCompleted, completionRate`, `highlights{lowestCompletion, mostWatched}` e `lessons[]` (ranking na ordem do curso, rascunhos incluídos com `status`) |
| GET | `/analytics/courses/:id/inactive?days=14` | dono, admin | Alunos sem atividade há N dias (1–365); quem nunca começou vem primeiro. Traz nome e e-mail (dados pessoais: só para quem gerencia) |
| GET | `/analytics/students/:id` | o próprio (`me`), dono (só nos seus cursos), admin | `coursesEnrolled, lessonsCompleted, totalWatchedS, lastActivityAt` e `courses[]` com progresso e tempo. Professor sem curso em comum → 404 |
| GET | `/analytics/lessons/:id/export.csv` | idem aula | Curva de retenção (`inicio_s, fim_s, alunos, percentual_do_pico`) |
| GET | `/analytics/courses/:id/export.csv` | idem curso | Ranking de aulas |
| GET | `/analytics/courses/:id/inactive/export.csv` | idem | Alunos inativos |

CSV: UTF-8 com BOM, CRLF, `?delimiter=;` para o Excel em português. Células de texto começando com `= + - @` ganham um `'` na frente (proteção contra injeção de fórmula). Velocidade e qualidade só existem em sessões gravadas a partir do Marco 6.

## Integração — matrícula genérica e sessão do aluno — Marco 9 ✅
Para um sistema de origem (área de membros, checkout) que **já autenticou o aluno do jeito dele**: o aluno não conhece esta API nem tem senha aqui. Chamadas de servidor para servidor com a **chave de integração** = token pessoal de um **admin** com o escopo `access:manage` (`POST /v1/me/mcp-tokens`, mesmo mecanismo do MCP: aparece uma vez, hash no banco, revogável). JWT de login **não** vale nestas rotas.

**Dupla trava:** `ACCESS_ENDPOINT_ENABLED=true` no ambiente **e** a empresa habilitada pelo operador (`PATCH /platform/tenants/:id {accessEndpointEnabled:true}`). Faltando qualquer uma, todas as rotas abaixo respondem `404` e nada é gravado. Limite: 600 chamadas/min por chave (`429`).

| Método | Rota | Descrição |
|---|---|---|
| POST | `/access/enrollments` | `{email, name?, externalId?, courseId, startsAt?, endsAt?, accessDays?, externalRef?, issueFirstAccess?}` → `201` (matrícula nova) ou `200` (atualizada/repetida) `{enrollmentId, userId, courseId, startsAt, endsAt, revoked, externalRef, userCreated, created, replayed, firstAccess}`. Acha o aluno pelo **e-mail** (normalizado: `trim` + minúsculas) ou o cria como `aluno` **sem senha utilizável** (`name` obrigatório só nesse caso); quem já existe **não é alterado**. `externalId` = id do aluno no seu sistema (único por empresa). Datas: `YYYY-MM-DD` vale o dia inteiro em America/Sao_Paulo; data-hora sem fuso = São Paulo; com `Z`/deslocamento, como veio; `accessDays` conta do início (ou de agora); `endsAt` e `accessDays` juntos → 400; fim ≤ início → 400. Sem datas: acesso sem limite. Chamar de novo para o mesmo aluno/curso **atualiza o prazo e reativa** (renovação). **`externalRef`** (id do pedido) torna a chamada repetível: repetir devolve a matrícula existente com `replayed:true` **sem renovar**; a mesma referência em outro aluno/curso → 409. Erros: 404 curso inexistente ou de outra empresa; 422 e-mail de professor/admin; 409 `externalId` de outro aluno; 400 campo desconhecido |
| POST | `/access/enrollments/revoke` | `{email` **ou** `externalId, courseId}` → 204. Marca a matrícula como revogada (histórico mantido) e derruba as telas abertas do aluno; repetir é inofensivo; 404 se aluno ou matrícula não existem |
| POST | `/access/sessions` | `{email` **ou** `externalId}` → `200 {accessToken, tokenType:"Bearer", expiresIn, user:{id,name}}`. JWT **curto de aluno** (mesma duração do login, **sem refresh**) para o sistema de origem (ou o navegador do aluno, se ele repassar) falar com a API em nome dele: cursos, playback, progresso. 404 aluno inexistente/de outra empresa; 422 se não for aluno |
| POST | `/auth/first-access` | Público. `{token, password}` → 204. Cenário de **login direto**: o aluno define a senha com o token de uso único recebido em `firstAccess` (`issueFirstAccess:true`, vale 7 dias, só o mais recente funciona). 401 token inválido/usado/vencido; 400 senha fraca. Limite 20/10 min por IP |

Prazo e revogação valem em **toda** checagem de acesso (lista de cursos, curso, aula, playback e MCP): matrícula revogada, que ainda não começou ou vencida some. O playback já aberto cai na próxima renovação (≤ 5 min), e a revogação derruba na hora. Matrículas antigas, sem datas, continuam sem limite. `POST /courses/:id/enrollments` (manual) reativa uma revogada e remove o prazo.

## Privacidade (LGPD) — Marco 7 ✅
Limitado a 5 chamadas por hora por usuário. Detalhes e procedimento em [seguranca.md](seguranca.md#lgpd) e [operacao.md](operacao.md#lgpd-atendendo-o-titular).

| Método | Rota | Quem | Descrição |
|---|---|---|---|
| GET | `/me/data-export` | o próprio | JSON com perfil, matrículas, progresso, trechos, sessões e anotações (sem senha/tokens); `Content-Disposition: attachment` |
| DELETE | `/me` | o próprio | `{password}` → 204. **Anonimiza** a conta (nome/e-mail/senha/anotações/logins removidos; histórico mantido sem identificação). 403 senha incorreta; 409 se for dono de curso ou o último admin |
| GET | `/users/:id/data-export` | admin da empresa | Cópia dos dados de um usuário da empresa (a pedido do titular) |
| DELETE | `/users/:id?mode=anonymize\|erase` | admin da empresa | `anonymize` (padrão) ou `erase` (apaga também sessões, trechos, progresso e matrículas). 409 para dono de curso, último admin ou a própria conta (use `DELETE /me`) |

## Ops
| Método | Rota | Descrição |
|---|---|---|
| GET | `/health/live` | Liveness: `{status:"ok"}` sem consultar dependências (usado pelo HEALTHCHECK do Docker) |
| GET | `/health` | Readiness: `{status, db, redis, s3}`; **503** se algum estiver fora |
| GET | `/metrics` | Prometheus. Exige `Authorization: Bearer <METRICS_TOKEN>`; sem a variável configurada → 404 |
| GET | `/docs`, `/docs-json` | Swagger/OpenAPI — **desligado em produção** (`SWAGGER_ENABLED=true` para ligar) |

`/health` e `/metrics` ficam na raiz (sem `/v1`). Worker (`:9100`) e consolidador (`:9102`) expõem `/health` e `/metrics` na rede interna.

## MCP — Marco 8 ✅
`POST /mcp` (na raiz, sem `/v1`) — Streamable HTTP *stateless*; tools, escopos e segurança em [mcp.md](mcp.md). Autenticação: `Authorization: Bearer gvmcp_…` (token pessoal) ou o JWT de login; `platform_admin` não acessa. O cliente envia `Accept: application/json, text/event-stream`. `401` (com `WWW-Authenticate`) para qualquer credencial inválida, revogada, expirada, de usuário excluído ou de empresa suspensa; `429` + `Retry-After` acima de 120 chamadas/min por token; `GET`/`DELETE` → `405`. Usa as mesmas regras de permissão desta API.

## Exemplos

**Heartbeat**
```http
POST /v1/progress/heartbeat
Authorization: Bearer …
{ "lessonId":"…", "sessionId":"…", "seq":42, "position":312.4, "rate":1.5, "quality":"720p" }
→ 204 No Content
```

**Playback**
```http
POST /v1/lessons/{id}/playback
→ 200 { "manifestUrl":"…/hls/{videoId}/master.m3u8?t=…", "playbackToken":"…",
        "expiresAt":"2026-10-25T12:05:00Z", "watermark":{"text":"Ana S. · ***.123"}, "resumeAt":312.4 }
→ 403 { "message":"Aluno não matriculado" }
→ 409 { "message":"Limite de sessões simultâneas atingido" }  (ou "O vídeo desta aula ainda não está disponível")
```
