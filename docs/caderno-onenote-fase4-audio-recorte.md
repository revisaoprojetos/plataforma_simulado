# Caderno (beta) — Fase 4: ÁUDIO e RECORTE DE PDF (PROJETO, nada implementado)

Status: proposta para decisão. Contexto: `docs/caderno-onenote-contrato.md` (modelo notebook > seção > página; doc TipTap com lista branca de nós).
Regras: backend-first, rotas de API (nunca server actions), `getSessaoAluno()` + `cadernoBetaLiberado`, sempre filtrar `tenant_id + estudante_id`, tolerar tabela ausente (503 `migracao_pendente`), `.range()+count`, `.in()` em chunks de 80.

## 1. Áudio (gravar aula/comentário e anexar à página)

### 1.1 Modelo de dados (migração futura)
`simulado_aluno_notebook_anexos` (genérica; serve a áudio e a recorte):
- `id uuid pk`, `tenant_id`, `estudante_id`, `notebook_id` (FK cascade), `pagina_id` (FK cascade, null enquanto não anexado -> limpeza por job)
- `tipo text check in ('audio','recorte')`, `mime text`, `bytes int`, `duracao_seg int` (áudio), `storage_path text` (chave no bucket), `status text check in ('enviando','pronto','erro')`
- `meta jsonb` (áudio: `{codec, bitrate}`; recorte: ver 2.1), `client_op_id uuid` (idempotência do upload), `deletado_em`, `criado_em`
- Índices: `(estudante_id, pagina_id) where deletado_em is null`; único `(notebook_id, client_op_id)`.
- RLS padrão `tenant isolation` + grants `service_role` (como a migração 20261127000000).

Nó novo do doc (exige ampliar a lista branca em `notebook-tipos.ts`/`sanitizarDoc`): `audioRef` (atom) com attrs `{anexo_id: uuid, titulo?: string<=120, duracao_seg?: int}`. O doc guarda SÓ o id; URL nunca persistida (expira).

### 1.2 Storage
- Reusar a camada de storage do projeto (Hetzner S3 — ver memória `storage-migracao-hetzner-s3`), bucket PRIVADO (nunca público). Chave: `caderno/{tenant_id}/{estudante_id}/{anexo_id}.{ext}`.
- Leitura: URL assinada de curta duração (60–300 s) gerada em `GET /api/aluno/notebook/anexos/:id/url` (checa dono; devolve `{url, expira_em}`); o player pede nova URL ao expirar. Sem URL em `texto_busca` nem no doc.
- Upload: duas opções (decidir):
  A) `POST /anexos` (JSON `{tipo:'audio', mime, bytes, duracao_seg, client_op_id}`) cria linha `enviando` e devolve URL assinada de PUT (upload direto ao S3, sem passar pelo Next); depois `POST /anexos/:id/confirmar` valida (HEAD do objeto: tamanho e content-type) e marca `pronto`. RECOMENDADA (não trafega binário pelo servidor web; evita limite de body).
  B) multipart pelo route handler (simples, mas limite de body e memória no container).
- Limites sugeridos: 20 MB e 30 min por áudio; 200 MB de anexos por aluno (soma `bytes` onde `deletado_em is null`); 50 anexos por página; rate limit 3 uploads/min.
- Formatos: gravar com `MediaRecorder` — preferir `audio/webm;codecs=opus` (Chrome/Firefox/Android) e `audio/mp4` (Safari/iOS). Lista branca de mime: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`. Validar por magic bytes no `confirmar` (lê os primeiros bytes via Range GET), não só pelo mime declarado. Sem transcodificação no MVP (opcional: worker -> mp3/opus padronizado).
- Exclusão: soft delete na linha; job de purga remove o objeto e linhas órfãs (`pagina_id is null` > 24 h, status `enviando` > 24 h).
- Transcrição (fase posterior, opcional): worker + serviço de STT, gravando texto em `meta.transcricao` e incluindo em `texto_busca`. Fora do escopo agora; avaliar custo/LGPD.

### 1.3 Rotas (todas sob `/api/aluno/notebook/`)
| Método | Rota | Função |
|---|---|---|
| POST | `anexos` | cria anexo (`enviando`) + URL de upload assinada |
| POST | `anexos/:id/confirmar` | valida objeto (tamanho/magic bytes) -> `pronto` |
| GET | `anexos/:id/url` | URL assinada de leitura (curta) |
| GET | `anexos?pagina_id=&offset=&limit=` | lista paginada (.range+count) |
| DELETE | `anexos/:id` | soft delete |
Cotas e limites aplicados no `POST anexos` (soma por aluno com 1 query agregada).

### 1.4 Riscos
- **Microfone em iframe (Curseduca)**: `getUserMedia` dentro de iframe exige `allow="microphone"` no `<iframe>` do host; se a Curseduca não permitir o atributo, a gravação NÃO funciona embutida. Mitigações: (1) detectar `NotAllowedError`/ausência de `navigator.mediaDevices` e oferecer **upload de arquivo de áudio** (input file / `capture`) como alternativa; (2) botão "abrir em nova aba" (contexto top-level) para gravar. Testar com a Curseduca real antes de prometer. Obedecer a regra do projeto: nada de `window.top`.
- **Permissões**: HTTPS obrigatório; usuário pode negar; mostrar estado claro e instrução de como reativar.
- **iOS Safari**: sem `audio/webm`; `MediaRecorder` só em versões recentes; gravar em fundo é interrompido ao bloquear a tela/trocar de app (perde áudio). Aviso na UI e salvar por trechos (chunks de 1 min via `ondataavailable`) para não perder tudo.
- **Mobile/rede**: upload grande em rede ruim -> PUT assinado com retry/retomada (multipart S3 só se > 20 MB, que o limite já evita).
- **Egress/custo**: leitura repetida de áudio; usar `Cache-Control` na URL assinada e `preload="none"`.
- **Privacidade/LGPD**: voz é dado pessoal; bucket privado, URL curta, exclusão real na purga, incluir anexos na exportação/exclusão de dados do aluno.
- **CSP**: `media-src` precisa permitir o host do S3; checar CSP atual do app.
- **Segurança**: nunca confiar no mime/nome do cliente; nome de arquivo gerado no servidor; checar dono em toda rota; rate limit; negar quando o interruptor central de downloads do aluno (`bloqueioDownloadsAluno`) estiver ativo? (decidir: reprodução dentro do app não é download; só um eventual "baixar áudio" deve respeitar o interruptor).

## 2. Recorte de PDF (selecionar uma região da página do leitor e levar à página do caderno)

### 2.1 Modelo
Duas estratégias (decidir):
- **A) Referência + região (RECOMENDADA, sem armazenar imagem)**: o nó do doc guarda `{documento_id, documento_versao, pagina, rect:{x0,y0,x1,y1} (0..1, mesma convenção dos `rects` do grifo), escala?}`. O render pede ao servidor a imagem do recorte sob demanda. Novo nó `recorteRef` (atom) na lista branca. Pró: zero storage por recorte, sobrevive a reabertura, respeita permissões do documento; contra: depende do documento continuar existindo/versão (guardar `documento_versao` + título como no `grifoSnapshot`; se mudar, mostrar "versão anterior").
- **B) Imagem rasterizada armazenada** (`simulado_aluno_notebook_anexos` tipo `recorte`, `meta:{documento_id,pagina,rect}`; PNG/WebP gerado no cliente via canvas do leitor e enviado como anexo, ou no servidor). Pró: independente do documento; contra: copia conteúdo protegido para fora do controle de acesso/versão (risco de direito autoral e do interruptor de downloads), custo de storage.

### 2.2 Rotas
- `GET /api/aluno/notebook/recorte?documento_id=&pagina=&x0=&y0=&x1=&y1=&largura=` (estratégia A): valida acesso ao documento (mesmo guard do leitor/biblioteca do aluno), valida rect (0..1, área mínima, `largura` <= 1600), renderiza o trecho (pdf.js/`pdfjs-dist` no servidor com canvas, ou imagem da página já cacheada pelo leitor + crop com `sharp`), responde `image/webp` com `Cache-Control: private, max-age=300`. Rate limit + cache em memória/CDN por chave (documento, versão, página, rect, largura).
- Inserção no caderno reutiliza `POST /api/aluno/notebook/blocos` (fase 2): bastará aceitar `recorteRef` na lista branca e no `blocoSchema` (um arquivo de tipos + um `case` em `sanitAttrs`).
- Estratégia B acrescenta `POST anexos` (tipo `recorte`) como na seção 1.3.

### 2.3 Riscos
- **Permissão e proteção de conteúdo**: recorte é uma forma de extrair o material; deve respeitar `pode_baixar` do documento e o interruptor central (`bloqueioDownloadsAluno`) — em A, a rota de imagem deve negar quando o documento/política proibir; marca d'água do aluno se o leitor já aplica.
- **Custo de render no servidor**: pdf.js + canvas é pesado; limitar concorrência (como `lib/pdf/chromium-guard`), cache agressivo, timeout. Alternativa: cliente recorta o canvas do leitor e envia apenas o rect (A) — o servidor só valida e o render fica no cliente (zero custo servidor; a "imagem" nunca é persistida).
- **Iframe**: leitor é iframe (porte fiel); comunicação do rect via `postMessage` entre iframe do leitor e o shell do caderno, validando `origin`. Sem `window.top`.
- **Versão do documento**: reimport/edição altera a página/coordenadas (ver `biblioteca-conteudo-uid-alinhamento`); guardar `documento_versao` e degradar com aviso.
- **Mobile**: seleção por toque/caneta no leitor; gesto de arrastar compete com a rolagem (ver `leitor-caneta-spen-tablet`).
- **Acessibilidade/busca**: recorte é imagem; guardar `texto` opcional (OCR/seleção) em `texto_busca` via atributo `alt`/`texto` do nó.

## 3. Ordem sugerida
1. Decidir A vs B (recorte) e opção de upload (áudio). 2. Testar microfone no iframe da Curseduca (spike de 1 h). 3. Migração `anexos` + nó(s) na lista branca + testes de sanitização. 4. Rotas. 5. UI (gravador/player; botão "recortar" no leitor).
