# Performance da sub-aba Classificação (Biblioteca › Questões) — Agente B

## Causas encontradas
- `s=sugestoes` e `s=resumo` (contagem de duplicadas) chamavam `gruposDuplicados`: carrega TODOS os enunciados + alternativas para o JS e roda a detecção em CPU. Era o "13 s cold".
- Cada lista da taxonomia era uma consulta própria (7 varreduras) + 4 para os nomes das sugestões.
- O painel montava vazio e só então buscava (cascata HTML → JS → API); trocar de lista disparava rede.
- `questoes?vis=…&tree=1` (288 KB) NÃO é do painel: é o `QuestoesBanco modo="fila"` (agente A). Em `carregar()` a linha `precisaArvore = … || !opcoesRef.current` pede a árvore inteira só para obter `opcoes` dos filtros. Sugestão para A: em `fila`, buscar só `opcoes` (sem `tree=1`) ou embutir `opcoes` no SSR.
- Piso por chamada de API: ~600–800 ms no dev mesmo para `s=zzz` (400) — é a autenticação por request (`getCurrentAccess`/`getUser`, memoizado só por request). Por isso zero chamada no load é o caminho.

## O que foi feito
- `lib/admin-revisao/questoes-classificacao.ts`
  - `listas()`: UMA consulta (`grouping sets`, 1 passada em `simulado_questoes` + disciplinas/assuntos/bancas/órgãos em JSON) → 7 listas da taxonomia + distribuição. Cache 60 s/tenant em memória com dedupe de chamadas simultâneas.
  - `carregarInicialClassificacao(tenantId)` (SSR): resumo (agente A) + listas + 1ª página (pp 14) das 7 listas, em paralelo, cache `remember` 60 s (Redis/memória). ~16 KB.
  - `taxonomiaRapida`, `distribuicaoQuestoes` (mesma agregação), `sugestoesRapidas` (1 consulta SQL com os 3 sinais; sem `gruposDuplicados`; lote ≤ 100; cache 60 s), `limparCacheClassificacao`.
  - Fallback PostgREST/implementação antiga se `sqlQuery` indisponível.
- `questoes-classificacao-tipos.ts`: `InicialClassificacao`, `PARAMS_TAX_PADRAO`.
- `questoes-api.ts`: novo `semearG` (semeia o cache cliente 60 s com o que veio do SSR).
- `questoes-classificacao.tsx`: `QuestoesClassificacao({ podeEditar, inicial? })`. Com `inicial`, renderiza imediatamente, semeia resumo/distribuição/7 listas no cache cliente (uma vez por carga) → trocar disciplinas/assuntos/bancas/… e abrir Distribuição = 0 rede, < 50 ms. Taxonomia lê o cache de forma síncrona (sem spinner ao revisitar página/ordenação).
- Rota `gestao/route.ts` (só `sugestoes`, `distribuicao`, `taxonomia`, limpeza de cache em `fresh`/mutação).
- Migration `supabase/migrations/20261113090000_questoes_classificacao_indices.sql` (idempotente, opcional): md5(enunciado), assunto_detalhe, external_id. EXPLAIN (READ ONLY): a tabela do tenant maior tem 5.689 linhas e o seq scan custa ~4 ms — o custo real é round-trip (~180 ms/consulta) e o JS, não o scan; os índices são só folga para crescer.

## Medições (dev, localhost:3000, Playwright, tenant com 5.689 questões)
| Item | Antes (relato do usuário) | Depois |
|---|---|---|
| `s=resumo` cold | 13 s | ~1 s (A) |
| carregarInicialClassificacao cold | n/a (6–7 chamadas, 5,3–21,7 s) | 1,1 s (tudo em 1 consulta + resumo) |
| carregarInicialClassificacao warm | n/a | 0 ms (cache) |
| Payload SSR da Classificação | 288 KB (árvore do Banco) | 15,9 KB |
| `s=sugestoes` (14 ids) | 1–7,5 s | ~650 ms (= piso de auth; compute desprezível) |
| `s=taxonomia` cada tipo / `s=distribuicao` | 1 consulta por tipo | ~630–750 ms (= piso); 1 consulta única para todas |
| Chamadas API no load do painel | 6–7 | 0 do painel (com `inicial`); restam as da fila (agente A) |
| Trocar lista de taxonomia | rede por lista | 0 rede (cache semeado) |

Observação: sem o `inicial` ligado em page.tsx (agente A) o painel funciona como antes, só que com as rotas mais leves.

## Pendências
- Agente A: `page.tsx` deve chamar `carregarInicialClassificacao(tenantId)` e passar `<QuestoesClassificacao inicial={…} />` (via `biblioteca-app.tsx`); `QuestoesBanco modo="fila"` não deve pedir `tree=1`.
- Piso de ~650 ms por API no dev: cachear `getCurrentAccess` por token por 30–60 s (arquivo `lib/auth/permissions.ts`, fora do escopo).
- Aplicar a migration (opcional). A invalidação das mutações feitas fora desta rota expira em 60 s.
