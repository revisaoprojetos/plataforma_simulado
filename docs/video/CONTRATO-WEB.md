# Contrato das rotas de Vídeo próprio (apps/web) — consumido pelo front

Todas são **rotas de API** (`app/api/...`), nunca server actions (rejeitadas em domínio custom). JSON, `Cache-Control: no-store`.
Tipos zod compartilhados: `apps/web/lib/video/tipos.ts` (importável no client). Funções puras testadas: `lib/video/puro.ts`.

Config do serviço: tabela global `video_config` (tela `/super/video`; URL interna, prefixo público, chave de integração `access:manage`, conta admin; segredos cifrados).
Fallback às env `VIDEO_API_URL`, `VIDEO_PUBLIC_API_URL`, `VIDEO_INTEGRATION_KEY[__<SLUG>]`, `VIDEO_ADMIN_EMAIL`/`VIDEO_ADMIN_PASSWORD[__<SLUG>]` quando a linha não está ativa.
O navegador fala com o serviço pelo **domínio da própria plataforma**: `<domínio da plataforma>/video-api` (serviço publicado com `PUBLIC_PATH_PREFIX=/video-api`; o proxy roteia o prefixo).
Slug da empresa no serviço = slug do tenant.

Erros do aluno: `{ code, message, correlationId? }`. Códigos: `sem_acesso` (403), `nao_encontrado` (404), `video_processando` (409),
`conflito` (409, ex.: limite de sessões simultâneas), `limite` (429), `video_indisponivel` (503/502), `visualizacao_somente_leitura` (403), `requisicao_invalida` (400).
Erros do admin: `{ message, correlationId? }` (+ `code: 'video_nao_habilitado'|'video_indisponivel'` quando a empresa não está ativa).

## ALUNO (autenticado pelo cookie `aluno_session`; 401 sem sessão)

### `POST /api/aluno/video/playback`  body `{ courseId: uuid, lessonId: uuid }`  (ids do gerenciador de vídeo; referência `video-proprio:<courseId>:<lessonId>`)
Resposta 200:
```json
{
  "apiBase": "https://<domínio da plataforma>/video-api/v1",
  "manifestUrl": "https://<domínio da plataforma>/video-api/v1/hls/<videoId>/master.m3u8?t=<token>",
  "playbackToken": "<jwt 5 min>",
  "expiresIn": 300,
  "sessionId": "<uuid>",
  "resumeAt": 312.4,
  "watermark": { "text": "Ana S. · e***@dominio" },
  "subtitles": [{ "lang": "pt", "url": "https://.../subtitles/pt.vtt?t=<token>" }],
  "chapters": [{ "startS": 0, "title": "Introdução" }],
  "poster": "https://<s3 assinado>/poster.jpg",
  "nextAulaId": "<lessonId>|null",
  "lessonId": "<lessonId>"
}
```
- `manifestUrl`/`subtitles[].url` já vêm **absolutas**. `apiBase` = origem pública + `/v1` (use para `renew`, `end`, `progress/heartbeat`, chave HLS).
- `watermark` pode ser `null`; `poster` pode ser `null`; `resumeAt` = 0 quando não há progresso/concluída.
- Ordem das verificações: sessão -> serviço configurado (senão 503 `video_indisponivel`) -> **nosso gate** (testador global OU a aula está liberada no currículo de um produto do aluno; senão 403 `sem_acesso`) -> **matrícula sob demanda** no serviço (janela de 1 dia, cache ~10 min) -> serviço (reconfere matrícula, limite de sessões, `Origin`; vídeo em processamento = 409 `video_processando`). Ver `INTEGRACAO-LIBERACAO.md`.
- A `Origin` enviada ao serviço é a do navegador (ou o host público do tenant) — precisa estar em `allowedDomains` da empresa no serviço (domínios custom dos tenants!).
- Fluxo do player (direto com a video-api, sem passar pelo Next): hls.js com `manifestUrl` -> `POST {apiBase}/playback/renew?t=` a cada ~4 min -> `POST {apiBase}/progress/heartbeat?t=` a cada ~10 s só tocando (`{seq, position, rate, quality?, device?}`, 204) -> `POST {apiBase}/playback/end?t=` ao sair (`sendBeacon`). 401 no heartbeat = sessão encerrada: pedir novo playback.
- Visualização de admin (impersonation) somente leitura: 403 `visualizacao_somente_leitura`.

### Anotações com tempo — `/api/aluno/video/anotacoes`
| Método | Entrada | Saída |
|---|---|---|
| `GET` | `?courseId=<uuid>&lessonId=<uuid>` | `{ notas: [{ id, atS, text }] }` |
| `POST` | `{ courseId, lessonId, atS (0..86400), text (1..2000) }` | 201 `{ nota: { id, atS, text } }` |
| `PATCH` | `{ id, atS?, text? }` | `{ nota }` |
| `DELETE` | `?id=<uuid>` | `{ ok: true }` |
GET/POST aplicam o mesmo gate do playback. As notas são do próprio aluno (o serviço valida o dono em PATCH/DELETE).

## ADMIN (permissão `video:view` leitura / `video:manage` escrita; admin e super-admin passam; 401/403 caso contrário)
Exige o serviço de vídeo configurado e ativo (`video_config`).

| Rota | Entrada | Saída |
|---|---|---|
| `GET /api/admin/video` | `?search&status&page=1&pageSize=25(≤100)&sort=titulo\|criado_em\|status\|duracao_s\|ordem&dir=asc\|desc` | `{ rows: LinhaAulaAdmin[], total }` (`.range()`+count, desempate por `id`) |
| `POST /api/admin/video` | `{ titulo, pastaId?, filename?, size?, contentType? }` | 201 `{ id, uploadId, partSize, partCount, urls[] }` |
| `GET /api/admin/video/[id]` | — | `{ id, status, duracaoS, erro }` (consulta o serviço e persiste o status — usar p/ polling) |
| `POST /api/admin/video/[id]/upload` | `{ filename, size, contentType }` | `{ id, uploadId, partSize, partCount, urls[] }` |
| `POST /api/admin/video/[id]/parts` | `{ partNumbers: number[] }` | `{ urls: [{ partNumber, url }] }` |
| `POST /api/admin/video/[id]/complete` | `{ parts: [{ partNumber, etag }] }` | 202 `{ status }` (idempotente) |
| `POST /api/admin/video/[id]/reprocess` | — | 202 `{ status: 'processando' }` |
| `DELETE /api/admin/video/[id]` | — | `{ ok: true }` (remove no serviço e marca `excluida`) |
| `GET /api/admin/video/[id]/analytics` | `?from&to` (data/ISO) | `{ aulaId, titulo, analytics }` — `analytics` é o payload de `GET /v1/analytics/lessons/:id` do serviço, sem recomputar |

Observações importantes do contrato:
- **Extras em `POST /api/admin/video`**: o serviço exige `filename/size/contentType` para abrir o upload multipart. Sem eles a aula nasce `rascunho` e `uploadId/partSize` vêm `null`; inicie depois com `/[id]/upload`. Tipos aceitos: mp4, quicktime, x-matroska, webm, x-msvideo, mpeg, x-m4v (até 10 GiB).
- `urls` = `[{ partNumber, url }]` (PUT direto no S3, guarde o header `ETag` de cada parte — o CORS do bucket já o expõe). URLs valem 2 h; renove via `/parts`.
- Status da aula: `rascunho -> enviando -> processando -> pronta | erro` (`excluida` some da lista). `LinhaAulaAdmin = { id, titulo, status, duracaoS, pastaId, cursoId, ordem, erro, criadoEm, atualizadoEm }`.
- Retomada de upload: se `status = 'enviando'`, chame `/parts` só para as partes faltantes (o front sabe quais já subiu) e depois `/complete`.
- Auditoria: INSERT/UPDATE/DELETE em `simulado_audit_logs` (entidade `video_aulas`).
