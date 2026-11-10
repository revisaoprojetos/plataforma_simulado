# Modelo de dados

Fonte da verdade: [`prisma/schema.prisma`](../prisma/schema.prisma).

| Tabela | Campos principais |
|---|---|
| tenants | id, slug (único), name, status, allowed_domains, access_endpoint_enabled (liga a API de integração; padrão falso) |
| users | id, tenant_id (nulo só p/ platform_admin), email (único por tenant), name, password_hash, role, deleted_at, external_id (id no sistema de origem; único por empresa; nulo permitido). Aluno criado pela integração tem `password_hash` que começa com `!` (nenhum login o aceita) |
| refresh_tokens | user_id, family_id, token_hash (HMAC), expires_at, revoked_at |
| courses | id, title, status, owner_id |
| modules | course_id, position |
| lessons | module_id, position, status, video_id |
| videos | status (`uploading`→`queued`→`processing`→`ready`\|`failed`; `uploaded`), source_key, original_name, content_type, size_bytes, upload_id/part_size (multipart em andamento), created_by_id, duration_s, renditions (json), error |
| enrollments | user_id, course_id (único), starts_at, ends_at (nulos = sem limite), revoked_at (histórico), external_ref (único por empresa: idempotência do pedido de origem) |
| subtitles | lesson_id, lang, s3_key |
| transcript_segments | video_id, lang, start_s, end_s, text |
| chapters | lesson_id, start_s, title |
| notes | user_id, lesson_id, at_s, text |
| watch_sessions | id, user_id, lesson_id, started/last_seen/ended_at, watched_s, device, avg_rate, rates_s e qualities_s (JSONB: segundos por velocidade/qualidade) |
| watch_ranges | user_id, lesson_id, from_s, to_s (intervalos únicos mesclados) |
| lesson_progress | (user_id, lesson_id) PK, last_pos, max_pos, percent, completed_at |
| api_tokens | tenant_id, user_id, name, prefix (6 caracteres após `gvmcp_`, só p/ identificar), token_hash (HMAC-SHA256, único), scopes[], expires_at, revoked_at, last_used_at |
| audit_log | tenant_id, actor_id (**sem FK**: sobrevive à exclusão do usuário), token_id, via (`mcp`, `access-api`, `first-access`), tool, args_hash (SHA-256 dos argumentos), ok, detail (JSON com ids e datas; nunca e-mail), at |
| first_access_tokens | tenant_id, user_id, token_hash (HMAC), expires_at (7 dias), used_at |

## `videos.renditions`
Array por qualidade gerada: `[{ "name": "720p", "width": 1280, "height": 720, "bandwidth": 3220800 }]` (bandwidth em bits/s, usado no master playlist). Só inclui degraus ≤ resolução da origem.

## Multiempresa
Toda tabela de negócio tem `tenant_id` (FK `tenants`, índice) — inclusive as filhas (modules, lessons, notes, ranges…), para escopo e analytics sem joins. Toda query filtra por `tenant_id` vindo do JWT. `users`: único `(tenant_id, email)` + índice parcial para `platform_admin` (`tenant_id IS NULL`). Ver [ADR 0002](adr/0002-multiempresa.md).

## Índices-chave
`(user_id, lesson_id)` em progress/ranges · `(tenant_id, lesson_id)` em watch_ranges (retenção) · `(lesson_id, started_at)` e `(user_id, started_at)` em sessions · `(video_id, lang, start_s)` em transcript.

## Regras de progresso
**O que conta como assistido.** A cada heartbeat o servidor compara com o anterior da mesma sessão (relógio do **servidor**, nunca o do cliente):
- avanço positivo e compatível com a velocidade — `Δposição ≤ max(rate, rate_anterior) × Δtempo_real + 2 s` — vira trecho `[pos_anterior, pos]`;
- avanço maior (seek para frente), retrocesso, pausa (posição igual) ou lacuna > 90 s entre heartbeats **não** viram trecho;
- `seq` repetido/menor, ou heartbeat com menos de 500 ms do anterior, é ignorado;
- posição acima da duração é limitada à duração.

**Consolidação.** Os eventos vão para a lista Redis `progress:events` (RPUSH atômico em Lua; estado da sessão em `hb:{sessionId}`, duração em cache `pm:{sessionId}`). A cada `PROGRESS_FLUSH_INTERVAL_MS` (5 s) — ou antes de qualquer leitura — o consolidador retira lotes de até 1.000, agrupa por (aluno, aula) e, numa transação com `pg_advisory_xact_lock`, **une** os trechos novos aos de `watch_ranges` (lacunas ≤ 1 s viram um só), recalcula `lesson_progress` e atualiza `watch_sessions`. Falha transitória devolve o lote à fila; evento de aula/usuário apagado é descartado. Garantia: pelo menos uma vez para falhas tratadas, no máximo uma se o processo morrer no meio (perde segundos de registro, nunca a aula).

**Progresso por aula.** `lastPos` = último heartbeat; `maxPos` só cresce; `percent` = segundos únicos assistidos ÷ duração. **Concluída** quando a cobertura chega a **90%** — pular para o fim não conclui. `completed_at` nunca é desfeito. Retomada: `resumeAt = lastPos`, ou 0 se estava a ≤ 5 s do fim.

**Sessões de visualização** (`watch_sessions`, uma por sessão de playback): `started_at` = 1º heartbeat, `last_seen_at`, `watched_s` (soma dos trechos), `avg_rate` (média ponderada pelos segundos assistidos), `device`. `ended_at` vem do `playback/end`; sessão sem sinal por 2 min é fechada no último `last_seen_at`.
