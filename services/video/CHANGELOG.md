# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões `0.x` seguem os marcos do [roadmap](docs/roadmap.md); a `1.0.0` sai com o servidor MCP (Marco 8).

## [Não lançado]

### Adicionado
- **API de integração** (opcional, dupla trava): `POST /v1/access/enrollments` (matrícula genérica por e-mail; cria o aluno sem senha, prazo por datas ou dias, idempotente por `externalRef`), `POST /v1/access/enrollments/revoke`, `POST /v1/access/sessions` (JWT curto do aluno para o sistema de origem) e `POST /v1/auth/first-access` (login direto). Chave de integração = token pessoal de admin com `access:manage`. Empresa habilitada pelo operador (`accessEndpointEnabled`) e `ACCESS_ENDPOINT_ENABLED` no ambiente.
- Matrícula com `startsAt`, `endsAt`, `revokedAt` e `externalRef`; aluno com `externalId`; `audit_log.detail`. Migration `access_integration`.

### Alterado
- Toda checagem de acesso ao curso considera o prazo e a revogação da matrícula (`activeEnrollment`); matrículas antigas, sem datas, não mudam. A matrícula manual reativa uma revogada.

### Adicionado
- Player de referência: tela de **analytics** (`#/analytics`: KPIs, ranking, retenção, inativos, busca por aluno e CSV), tela simples do **aluno** (`#/me`: resumo e progresso) e envio de **legendas** `.vtt`/`.srt` na biblioteca. Testes de navegador em `e2e/screens.spec.ts`.
- API: `GET /v1/users?q=` busca alunos por nome ou e-mail (para empresas com milhares de alunos).
- Player de referência: **biblioteca de vídeos** (`#/library`) para professor/admin — lista aulas com o estado do vídeo, cria aula, envia em partes direto ao S3 com progresso, reprocessa, exclui e abre o player; link do Swagger no cabeçalho em modo de desenvolvimento. Teste de navegador `e2e/library.spec.ts` com vídeo de exemplo.

## [1.0.0] — Servidor MCP

### Adicionado
- Servidor MCP em `POST /mcp` (Streamable HTTP stateless, SDK oficial): 12 tools (catálogo, transcrição, progresso, analytics, anotações), resources `course://` e `transcript://lesson/`, prompts `summarize_lesson` e `course_health_report`.
- Tokens pessoais `gvmcp_…` com escopos, expiração e revogação imediata (`/v1/me/mcp-tokens`); o JWT de login também é aceito.
- Auditoria de cada chamada (`audit_log`, só o hash dos argumentos) e limite de 120 chamadas/min por token.
- Barreira de saída que remove campos sensíveis e bloqueia respostas com URL assinada, token ou chave.
- Migration `mcp_tokens` (`api_tokens`, `audit_log`).

- `npm run s3:audit`: auditoria somente leitura do bucket (objetos que o banco não conhece, HLS faltando, ACL pública, credencial que enxerga outros buckets).

### Alterado
- A anonimização/exclusão LGPD revoga os tokens pessoais do usuário.

### Documentado
- Limites do isolamento do bucket no Hetzner (chave por projeto, chave AES no mesmo bucket, sem log de acesso) e pendências de armazenamento no roadmap.

## [0.7.0] — Endurecimento para produção

### Adicionado
- Limite de requisições atômico no Redis (por IP, usuário, conta-alvo e sessão de reprodução) com `429` e `Retry-After`; proteção de força bruta no login.
- Cabeçalhos de segurança (helmet), `X-Correlation-Id` em toda resposta e formato único de erro com `correlationId`.
- Logs estruturados (pino) que nunca registram cabeçalhos nem tokens de playback.
- `/metrics` (Prometheus, protegido por token) na API, no worker e no consolidador; `/health/live` e `/health`.
- LGPD: exportação dos dados do titular e anonimização/exclusão (`DELETE /v1/me`, `DELETE /v1/users/:id?mode=`).
- Processo dedicado para consolidar heartbeats (`consolidator.main.js`).
- `docker-compose.prod.yml` (rede interna, Redis com senha e `noeviction`, migrations como etapa, containers sem privilégios), `.env.prod.example`, `.dockerignore`, healthchecks.
- `npm run admin:create` (primeiro operador da plataforma) e teste de carga k6 (`load/`).

### Alterado
- Consolidação de progresso reescrita com SQL por conjuntos: de ~270 para milhares de eventos/s.
- Em produção a API recusa subir com segredos fracos, CORS em localhost ou limite desligado.
- Swagger desligado por padrão em produção.

### Corrigido
- CORS não liberava `PUT`.
- Mensagens de JSON inválido/corpo grande vazavam o texto interno do parser.

## [0.6.0] — Analytics
Relatórios por aula, curso e aluno, retenção, abandono, velocidade/qualidade, alunos inativos e CSV. Decisão de calcular sob demanda ([ADR 0003](docs/adr/0003-analytics-sob-demanda.md)).

## [0.5.0] — Player de referência
Player hls.js verificado em navegador real; legendas WebVTT, transcrição, capítulos e anotações.

## [0.4.0] — Progresso e histórico
Heartbeat atômico, trechos assistidos, conclusão a 90%, retomada, "continuar assistindo" e histórico.

## [0.3.0] — Playback seguro
Token de playback, manifests reescritos, chave AES via API, domínios permitidos e limite de telas.

## [0.2.0] — Upload e transcode
Upload multipart direto ao S3 e worker FFmpeg gerando HLS criptografado.

## [0.1.0] — Autenticação, catálogo e multiempresa
Login por empresa, papéis, cursos/módulos/aulas, matrículas e isolamento por empresa ([ADR 0002](docs/adr/0002-multiempresa.md)).
