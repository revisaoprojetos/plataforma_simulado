# Gerenciador de Vídeo — Fase 4 (front)

Status: implementado no working tree, **não commitado**. Nenhum arquivo já modificado no git foi editado.

## Arquivos

| Arquivo | Papel |
|---|---|
| `apps/web/lib/video/player-protocolo.ts` (+ `__tests__/`) | Regras puras: heartbeat (10 s, intervalo mínimo 700 ms, só tocando + aba visível), `BeatQueue` (seq, backoff 1→30 s, teto 30), renovação a 80% do `expiresIn`, `withToken`, capítulos, sprite VTT, envelope `postMessage`. 11 testes vitest. |
| `apps/web/components/aluno/video/use-playback-session.ts` | `POST /api/aluno/video/playback`, renovação, heartbeat com fila, `visibilitychange`, `pagehide` + `sendBeacon(/v1/playback/end?t=)`. |
| `.../lesson-player.tsx` | Player (hls.js via `import()`), controles, teclado, PiP, tela cheia, velocidade, qualidade, legendas, marca d'água móvel, retomar, próxima aula. |
| `.../lesson-panels.tsx` | Capítulos, Transcrição pesquisável, Anotações (abas sublinhadas). |
| `.../use-embed-bridge.ts` | `postMessage` ao pai: `video:resize`, `video:started`, `video:completed`. |
| `apps/web/app/admin/conteudos/videos/{page,videos-client,video-analytics,upload-multipart}.*` | Estúdio: `<EstudioHeader>` + `<DataTable>` (busca/filtro/ordenação/paginação no servidor via `GET /api/admin/video`), upload multipart, polling, reprocessar/excluir com confirmação, analytics SVG. |

Uso do player: `<LessonPlayer aulaId={...} titulo={...} onNext={(id) => ...} onCompleted={...} />` (precisa estar sob um container de largura cheia).

## PENDÊNCIA 1 — dependência `hls.js` (não adicionada)

`hls.js` não está no `package.json`/`pnpm-lock.yaml` (nem em `node_modules`). Para não corromper o lockfile, o código usa `import('hls.js')` com `@ts-ignore` e tipos locais mínimos. **Antes de ligar o player a qualquer rota, rodar na raiz (pnpm 11.9.0):**

```
pnpm --filter web add hls.js@^1.5
pnpm install --lockfile-only   # se precisar só regenerar o lock
```

Sem isso, o `next build` falha ao resolver `hls.js` assim que `lesson-player.tsx` for importado por uma rota. Hoje nenhuma rota o importa (o Estúdio não usa hls).

## PENDÊNCIA 2 — patches propostos (arquivos já modificados: NÃO editados)

**`apps/web/proxy.ts` / CSP.** A rota do aluno que renderiza o player dentro do iframe Curseduca já precisa de `frame-ancestors` do domínio da Curseduca (comportamento atual). Acrescentar para as rotas com player:
- `connect-src`: `'self'` (o serviço é publicado em `<domínio da plataforma>/video-api`) — heartbeat/renew/transcript/manifest/chaves.
- `media-src` e `img-src`: `blob:` e a origem do S3 Hetzner (segmentos por URL assinada, sprite, poster).
- `worker-src blob:` (hls.js pode usar worker).
```
connect-src 'self';
media-src 'self' blob: https://<bucket-host>;
img-src 'self' data: https://<bucket-host>;
```
**Iframe Curseduca:** o `<iframe>` hospedeiro precisa de `allow="fullscreen; picture-in-picture; autoplay"` (tela cheia/PiP não funcionam sem). No pai, escutar:
```js
addEventListener('message', (e) => {
  if (e.origin !== 'https://simulado.revisaopge.com.br' || e.data?.ns !== 'rev-video') return
  if (e.data.type === 'video:resize') iframe.style.height = e.data.height + 'px'
})
```
(`targetOrigin` do envio é `'*'`; o payload só tem altura/ids de aula, sem dados sensíveis.)

**`apps/web/components/admin/conteudos-tabs.tsx`** (não está modificado, mas é shell compartilhado; não alterei): incluir `{ label: 'Vídeos', href: '/admin/conteudos/videos', match: '/admin/conteudos/videos' }`. O gate da página é feito nela mesma (`video:view`/`video:manage`); se o layout tiver `AREA_PERM`, mapear a rota.

**`video-provedor.ts` / `file-picker.tsx` / `lib/produtos/curriculo.ts` (item 4.5):** não implementado (fora do escopo e arquivos possivelmente modificados). Plano: novo provedor `'proprio'` cujo `render` monta `<LessonPlayer aulaId>`; no seletor, listar `GET /api/admin/video?status=ready`.

## Lacunas / suposições do contrato (confirmar com o backend)

1. `POST /api/aluno/video/playback` não devolve `lessonId` (id da aula na video-api) — necessário para `GET {apiBase}/v1/lessons/:id/transcript`. O código aceita `lessonId` opcional; sem ele, a aba Transcrição mostra "indisponível". Pedido: incluir `lessonId` (e, se existir, `durationS` e `spriteVttUrl`, ambos já tratados como opcionais).
2. `watermark` pode ser `string` ou `{text}`; URLs de `manifestUrl`/`subtitles[].url`/`poster` relativas são prefixadas com `apiBase`. Legendas (`<track>`) não aceitam header: as URLs precisam vir assinadas/com `?t=`.
3. Anotações: só GET (`?aulaId=`) e POST `{aulaId, atS, text}` (aceita resposta como array, `{anotacoes}` ou `{notes}`). Editar/excluir exigem rotas novas.
4. `POST .../parts` → `{urls}` como array alinhado a `partNumbers` **ou** mapa `nº→url`. `complete` recebe `{parts:[{partNumber,etag}]}`. O CORS do bucket precisa expor `ETag` (`npm run s3:cors` do serviço) — sem isso o upload falha com mensagem explícita.
5. Linha da lista: `{id,titulo,status,durationS?,sizeBytes?,createdAt?,error?}`; status esperados: `uploading|queued|processing|ready|failed` (outros caem num selo neutro). Filtro `status` e `sort` usam essas chaves (`titulo,status,durationS,sizeBytes,createdAt`).
6. Analytics: `{views,uniqueViewers,watchTimeS,avgPercent,completionRate,retention:[{p,v}],daily:[{date,views}]}`, tudo opcional.
7. Cancelar envio = aborta XHR + `DELETE /api/admin/video/:id` (não há rota de abort do multipart; o GC de multipart abandonado é item 1.12 do serviço). Retomada: estado das partes em `localStorage` (`rev.video.upload.<id>`), exige selecionar o mesmo arquivo (nome+tamanho+lastModified).

## Não verificado

- Reprodução real (HLS, renovação, heartbeat contra a video-api): requer `hls.js` instalado, backend e video-api no ar. Só a lógica pura é testada.
- Upload real ao S3 (CORS/ETag), polling e analytics com dados reais.
- Aparência (claro/escuro/mobile/iframe) — sem screenshots (economia de tokens); revisão visual pendente.
- Fullscreen/PiP dentro do iframe Curseduca dependem do atributo `allow` do hospedeiro.
