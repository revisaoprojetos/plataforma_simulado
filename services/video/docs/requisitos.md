# Requisitos

## Funcionais

### Catálogo / conteúdo
- RF01 Cursos → módulos → aulas; CRUD, ordenação, rascunho/publicado.
- RF02 Upload de vídeo grande, multipart direto ao S3 (URLs pré-assinadas), retomável.
- RF03 Transcode HLS adaptativo (240p–1080p, limitado à origem) + thumbnail + sprite de preview + duração.
- RF04 Estados do vídeo: `uploaded → queued → processing → ready | failed`, com reprocessamento.
- RF05 Legendas WebVTT por idioma (manual na Fase 1; automática na Fase 2).
- RF06 Transcrição por aula, segmentada por tempo e pesquisável.
- RF07 Materiais anexos da aula (opcional).
- RF26 Capítulos na timeline (`chapters`).

### Multiempresa
- RF38 Várias empresas (tenants) isoladas: usuários, cursos, vídeos, progresso e analytics nunca cruzam empresas.
- RF39 Login por empresa (`tenant` slug + e-mail + senha); e-mail único por empresa.
- RF40 Papel `platform_admin` cria/edita/suspende empresas e seus primeiros administradores.
- RF41 Configuração por empresa: nome, domínios permitidos, status (suspensa bloqueia login e playback).
- RF42 Armazenamento isolado por prefixo `tenants/{tenantId}/`; métricas de uso (armazenamento, egress) por empresa.

### Acesso / segurança
- RF08 JWT (access curto + refresh rotativo); roles `platform_admin`, `admin`, `professor`, `aluno`.
- RF09 Matrícula: aluno só acessa aulas de cursos em que está matriculado.
- RF10 Playback protegido: token curto; manifests/segmentos só via URL assinada; bucket privado.
- RF11 HLS com AES-128 e endpoint de chave autenticado.
- RF30 Marca d'água dinâmica por aluno (overlay no player; opção queimada no vídeo).
- RF31 Domínios permitidos + limite de sessões simultâneas por usuário.

### Acompanhamento (núcleo do produto)
- RF12 Por aluno/aula: última posição, maior posição, % assistido, concluída (≥90%).
- RF13 "Continuar assistindo" / retomada automática.
- RF14 Histórico de sessões (início, fim, tempo efetivo, dispositivo, velocidade).
- RF15 Heartbeat ~10 s com `seq`, idempotente; ignora duplicados/fora de ordem; não depende de relógio do cliente.
- RF16 Mapa de trechos assistidos (intervalos únicos): distingue "assistiu" de "pulou".

### Player de referência (hls.js)
- RF17 Velocidade 0.5×–2×, qualidade auto/manual, tela cheia, atalhos.
- RF18 Legendas on/off e idioma.
- RF19 Painel de transcrição clicável e com busca.
- RF20 Anotações com timestamp (CRUD; clique leva ao ponto).
- RF21 Retomada da posição.
- RF27 Estilo de legenda por usuário. *(pendente: o player de referência usa o estilo padrão do navegador; entra com a Fase 2)*
- RF28 Próxima aula + autoplay com contagem regressiva.

### Analytics — status
Implementados no Marco 6: RF22 (aula: views, únicos, tempo, conclusão, retenção, abandono, velocidade/qualidade/dispositivo), RF23 (aluno), RF24 (curso: engajamento, ranking, inativos) e RF25 (CSV). Velocidade e qualidade só nas sessões posteriores ao Marco 6.

### Player de referência — status
Implementados no Marco 5: RF17 (velocidade, qualidade, tela cheia, atalhos), RF18 (legendas), RF19 (transcrição clicável com busca), RF20 (anotações), RF21 (retomada), RF26 (capítulos e preview na timeline) e RF28 (próxima aula com contagem). Verificados em navegador real (Edge) com Playwright.

### Analytics
- RF22 Por aula: views, únicos, tempo médio, conclusão, retenção, abandono, velocidade/qualidade.
- RF23 Por aluno: concluídas, tempo total, última atividade, progresso do curso.
- RF24 Por curso: engajamento, ranking de aulas, alunos inativos/em risco.
- RF25 Export CSV.

### MCP (agentes de IA)
- RF34 A API expõe um servidor MCP (`POST /mcp`, Streamable HTTP) com tools de leitura de catálogo, transcrição, progresso e analytics.
- RF35 Autenticação do MCP por JWT ou token pessoal com escopos; mesmas regras de permissão (RBAC + matrícula) da API REST.
- RF36 Tools de escrita (ex.: criar anotação) só com escopo explícito; ações auditadas.
- RF37 Nenhuma tool/resource devolve URL assinada de vídeo, chave HLS ou segredos.

### Integração com sistema de origem (opcional)
- RF38 Endpoint genérico de matrícula por e-mail, que cria o aluno quando não existe, com prazo opcional (início, fim ou dias) e idempotência por `externalRef`.
- RF39 Revogar a matrícula (histórico mantido) e abrir sessão curta do aluno por e-mail ou `externalId`, para quem o autenticou em outro sistema.
- RF40 Recurso **opcional com trava dupla** (ambiente + habilitação por empresa); desligado, a plataforma se comporta como antes e as rotas respondem 404.
- RF41 Cenário de login direto: token de primeiro acesso de uso único para o aluno definir a senha.
- Fora do escopo por decisão: webhooks de plataformas de venda, adapters, classificação de status de pedido e motor de regras de liberação (o sistema de origem decide e chama o endpoint genérico).

## Não funcionais
- RNF01 `docker compose up` sobe tudo (api, worker, postgres, redis; minio opcional em dev).
- RNF02 API stateless; workers escalam por réplica.
- RNF03 Heartbeats via Redis + flush em lote (não sobrecarregar Postgres).
- RNF04 Config 12-factor validada no boot.
- RNF05 OpenAPI gerado; API versionada `/v1`.
- RNF06 Logs estruturados com correlation-id, `/health`, métricas Prometheus.
- RNF07 LGPD: exportar e anonimizar/excluir dados de visualização.
- RNF08 Rate limit, validação de entrada, CORS restrito, limites de upload.
- RNF09 Testes unit + e2e com containers; cobertura forte em permissão e progresso.
- RNF10 Capacidade: ≥1.000 heartbeats/s com p95 < 100 ms numa instância da API. **Atingido** (k6, 1.000 sessões × 1 heartbeat/s: p95 36 ms no servidor, 67 ms no cliente, 0 erros) — ver [operacao.md](operacao.md#teste-de-carga).
- RNF11 MCP com rate limit próprio (120/min por token) e log de auditoria por chamada (`audit_log`) ✅.
- RNF12 Produção endurecida: limite de requisições, cabeçalhos de segurança, `correlationId`, métricas Prometheus, recusa de configuração insegura e LGPD (Marco 7 ✅).

## Fora da Fase 1
Pagamentos, DRM comercial, live, app mobile nativo, CDN próprio, legenda/transcrição automática (Whisper), comentários, quizzes.
