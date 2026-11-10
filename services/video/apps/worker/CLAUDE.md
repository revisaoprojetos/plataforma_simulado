# apps/worker

Consumidor BullMQ da fila `transcode` (`transcribe` na Fase 2) + FFmpeg/ffprobe. Imagem Docker própria (Debian + ffmpeg).

Ler: [arquitetura](../../docs/arquitetura.md) (fluxo e layout S3) · [seguranca](../../docs/seguranca.md) (AES-128) · [modelo de dados](../../docs/modelo-de-dados.md) (`videos.renditions`).

## Estrutura (`src/`)
`main.ts` (Worker, falhas, shutdown) · `pipeline.ts` (orquestra o processamento) · `ffmpeg.ts` (spawn com timeout, probe, encode, poster, sprite) · `ladder.ts` e `playlist.ts` (funções puras, com testes) · `storage.ts` (S3) · `queue.ts` (contrato com a API) · `env.ts`.

## Regras locais
- **Contrato da fila:** `queue.ts` do worker e `apps/api/src/queue/transcode.queue.ts` precisam ficar idênticos (nome da fila e payload `{videoId, tenantId}`).
- Sempre filtrar por `tenantId` do job ao ler/gravar `videos`; saída só em `tenants/{tenantId}/videos/{videoId}/`.
- Job **idempotente**: reprocessar apaga o prefixo de saída e regrava tudo.
- Arquivo inválido → `UnrecoverableError` (falha sem retries). Só grava `failed` na última tentativa.
- Nunca logar chave AES, IV nem URLs assinadas; erros do ffmpeg só com o final do stderr.
- Pasta temporária sempre removida (`finally`). `lockDuration` do BullMQ é renovado enquanto o processo vive (ffmpeg roda em processo filho).
- Mudou escada, segmentação, criptografia ou layout S3 → atualizar `docs/arquitetura.md` (e `seguranca.md`).
- O marcador `__KEY_URI__` nas playlists é trocado pela API no playback (Marco 3).

## Observabilidade
`:9100/health` (liveness) e `:9100/metrics` (Bearer `METRICS_TOKEN`; sem token → 404): `transcode_jobs_total{status}`, `transcode_duration_seconds`, `transcode_jobs_active`. Só na rede interna.

## Comandos
`npm test -w apps/worker` · `docker compose up -d --build worker` · `docker compose logs -f worker` · teste real: `npm run upload:sample -w apps/api -- video.mp4`
