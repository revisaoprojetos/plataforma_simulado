# apps/player

Player de referência: Vite + TypeScript + hls.js sobre `<video>`, sem framework. Serve de exemplo/contrato para o front real. **É só para desenvolvimento: não entra no deploy de produção** (sem Dockerfile, fora do `docker-compose.prod.yml`, do CI de build e das imagens); roda com `npm run dev`.

Ler: [api](../../docs/api.md) (playback, progress, content, notes) · [requisitos](../../docs/requisitos.md) (RF17–RF21, RF26–RF28) · [operação](../../docs/operacao.md) (rodar e testar).

## Estrutura (`src/`)
`main.ts` (rotas por hash, telas de login/cursos/curso/aula, próxima aula) · `player.ts` (`LessonPlayer`: HLS, controles, legendas, preview, heartbeat, renovação) · `panels.ts` (transcrição, anotações, capítulos) · `api.ts` (cliente com renovação de login) · `library.ts` (biblioteca de vídeos: lista aulas e estado do vídeo, envia, reprocessa, exclui, abre o player) · `upload.ts` (envio em partes direto ao S3 com progresso, 3 partes em paralelo, retentativa e cancelamento) · `dom.ts` (helpers) · `style.css`. Testes: `e2e/player.spec.ts` e `e2e/library.spec.ts` (Playwright; o vídeo de exemplo está em `e2e/fixtures/teste-20s.mp4`).

> **Testes de navegador e o limite de login:** a API barra mais de 30 logins por IP em 10 min (`429`, o formulário só volta ao login). A suíte inteira usa ~10 logins; rodá-la várias vezes seguidas estoura o limite e os testes falham com "link Meu progresso não encontrado". Espere 10 min ou limpe os contadores do Redis de **desenvolvimento**: `docker compose exec redis redis-cli --scan --pattern 'rl:*'` e apague as chaves.

## Telas de desenvolvimento (rotas por hash)
| Rota | Quem | O que mostra | Código |
|---|---|---|---|
| `#/me` | todos | **Aluno (MVP):** continuar de onde parou, resumo (cursos, aulas concluídas, tempo, última atividade) e progresso por curso/aula | `student.ts` |
| `#/analytics` | professor, admin | KPIs do curso por período, ranking de aulas, detalhe da aula (retenção, quedas, dia a dia, velocidade/qualidade/dispositivo), alunos inativos, **busca "Por aluno"** (nome/e-mail, paginada) com o mesmo resumo/progresso, exportação CSV | `analytics.ts`, `charts.ts` (SVG sem dependências) |
| `#/library` | professor, admin | Biblioteca de vídeos e **legendas** (abaixo) | `library.ts`, `upload.ts`, `subtitles.ts` |

Quem não gerencia vê aviso nas telas de gestão (a API também recusa). O `.srt` é convertido para WebVTT no navegador (`srtToVtt`); a API só recebe WebVTT.

## Biblioteca de vídeos (`#/library`)
Tela de **desenvolvimento** para professor/admin (aluno recebe aviso): por curso e módulo, mostra cada aula com o estado do vídeo (Sem vídeo, Enviando, Na fila, Processando, Pronto, Falhou), permite criar aula, enviar/trocar vídeo, reprocessar, excluir e **assistir** (abre o player da aula). Acompanha o processamento a cada 3 s. O arquivo vai direto ao S3 por URLs pré-assinadas (o CORS do bucket precisa liberar a origem do front e expor `ETag`). O link "Swagger" no cabeçalho só aparece em `npm run dev` (`import.meta.env.DEV`).

## Regras locais
- Fluxo: `POST /lessons/:id/playback` → hls.js com `manifestUrl` → `renew` a cada ~80% do `expiresIn` → `end` ao sair (`sendBeacon` com `?t=`).
- **Token atual sempre:** o `xhrSetup` do hls.js troca o `t=` de toda URL `/v1/hls/` pelo token vigente; legendas são baixadas com o token vigente e entram como `<track>` de Blob (URL de legenda com token vencido falharia).
- Heartbeat a cada ~10 s **só enquanto toca**, em `POST /progress/heartbeat` com o token de playback (`seq` crescente, `position`, `rate`); também em play, pause, seeked e ended (reposiciona a linha de base), com mínimo de 700 ms entre envios; último envio com `fetch(..., {keepalive:true})` e `sendBeacon("/v1/playback/end?t=…")` em `pagehide`. Retomar em `resumeAt`.
- **O token de playback vive só em memória.** Tokens de login ficam em `sessionStorage` (referência; em produção prefira cookie httpOnly).
- Preferências (velocidade, volume, legenda) em `localStorage`, sempre com try/catch (`safeStorage`).
- Acessível: todo controle tem nome (`aria-label`), menus são `menuitemradio`, a barra de posição é `slider` operável por teclado. Atalhos: espaço/k, j/l (±10 s), ←/→ (±5 s), ↑/↓ volume, m, f, c, `<`/`>`, 0–9.
- Porta **5173 fixa** (CORS da API e `allowedDomains` do seed).
- Mudou comportamento do player → atualizar `docs/requisitos.md` / `docs/api.md` e o teste de navegador.

## Comandos
`npm run dev -w apps/player` · `npm run build -w apps/player` · `npm run test:browser -w apps/player` (Edge instalado; stack local no ar)
