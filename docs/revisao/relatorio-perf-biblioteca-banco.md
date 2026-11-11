# Perf — Biblioteca (PDFull etc.) e Banco de questões (Agente A)

Medição: Playwright (`lat.mjs`), dev server + banco remoto (RTT ~170 ms por ida ao banco; pool `DATABASE_POOL_MAX`=5; sessão do pooler limitada a 15 clientes — 4 agentes em paralelo saturam e inflam os números "R1").

## Antes × depois (Banco `?aba=questoes`)
| | Antes | Depois |
|---|---|---|
| Chamadas API no load | 14–16 (medido 23–44 sob carga) | 0 no load; 1–2 em ociosidade (pré-aquecimento / página 2) + notificações/paleta (shell) |
| `gestao?s=resumo` | 4,3–4,7 s sempre; 13–17 s sob contenção | removido do load (vem no SSR); servidor: 1 SELECT + cache 60 s |
| HTML com dados (warm) | 1,0–1,4 s + cascata 5–15 s | 0,95–1,9 s e o dado já está no HTML |
| Pré-aquecimento | 8 nós, 250 ms de intervalo, no mount | 2 maiores nós, só `requestIdleCallback` e rede livre |
| Prefetch página 2 | disparado na hora (e repetido) | só ocioso/rede livre; mesma URL em voo é reaproveitada (dedupe) |
| Fila de Classificação (`tree=1`) | 174–288 KB | `opcoes=1` (só opções dos filtros, sem árvore) |
| PDFull R2 | 5,6 s pronto, 2 chamadas | 4,3–4,5 s pronto (inclui 1,2 s de espera do script), 2 chamadas = shell |

## O que mudou na arquitetura
- **SSR por sub-área** (`page.tsx`): `Promise.all` só com o loader da sub-área ativa + dados da aba: Banco (`respostaQuestoes` + `resumoClassificacao`), Unificar (`carregarInicialUnificar`), Etiquetas (`carregarInicialEtiquetas`), Classificação (`carregarInicialClassificacao`), Unificar disciplinas (`carregarInicialUnificarDisciplinas`). `BibliotecaApp` repassa `inicial` só na 1ª montagem (`ssrOk`); depois a API atende as interações.
- **Resumo (chips das visões)**: `resumoClassificacao` agora é 1 SELECT (totais + 14 visões + cadastro + distintos) em vez de 2 SELECTs + detecção de duplicadas bloqueante. Contagem de duplicadas só entra se a detecção já estiver em cache (senão aquece em segundo plano, sem bloquear). Cache 60 s: `deteccaoCache` (single-flight + stale-while-revalidate) sobre `remember` (Redis/memória); invalidado em `limparCacheGestao`/`fresh`.
- **Árvore compacta**: servidor envia `arvoreC` (tuplas, ~40% menor, sem campos nulos); cliente hidrata (`hidratarResposta`). 873 nós na maior base.
- **Cliente (`questoes-banco.tsx`)**: cache semeado com o SSR (StrictMode/voltar não refazem chamada), `buscarQ` com dedupe de URL em voo, `quandoOcioso` + `rede_livre` para prefetch/pré-aquecimento. `biblioteca-app.tsx`: mesmo dedupe em `buscar` (prefetch página 2 repetido).
- **Rota** `questoes`: novo `opcoes=1` (só opções). `questoes/gestao?s=resumo` mantém o contrato (muda só a lib).
- SQL: DB em si é barato (lista 20 ms, contagens 5 ms em 5,7 mil questões); o custo era round-trip e contenção do pool. Migration `20261113080000_banco_questoes_indices_perf.sql` (idempotente): feedbacks pendentes, lista por atualização, banca/órgão. `simulado_alternativas(questao_id)` já coberto por `20261113020000`.

## Pendências / fora do escopo
- `/api/admin/notificacoes` (40 KB, 0,7–5 s, várias vezes por página): shell global, não tocado.
- Fila de Classificação (B) ainda faz `sugestoes` e a lista pela API (`inicial={null}` no `QuestoesBanco modo="fila"`): B pode passar a 1ª página por SSR; já aceito `contagensInicial` no `QuestoesBanco`.
- Chip "Duplicadas suspeitas" aparece só depois que a detecção esquentar (1ª visita pós-restart sem o número).
- Cache de resumo é por instância (invalidação local); em produção com réplicas o `remember`/Redis cobre o valor, a SWR em memória pode servir até 60 s.
- Aplicar a migration (usuário).
