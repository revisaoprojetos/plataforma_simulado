# Perf do Unificar (Questões duplicadas, Termos, Disciplinas) — agente C

## Causa
Componentes montavam vazios e chamavam a API (HTML -> JS -> API); a detecção pesada rodava a frio no 1º acesso; `pastas-unificar` era chamado 2x
(pp=5 e pp=20) e `questoes-termos?s=resumos` era uma chamada à parte; termos/pastas não tinham single-flight (N chamadas simultâneas = N computações).

## Arquitetura nova
- `lib/admin-revisao/cache-deteccao.ts`: cache em `globalThis` com **single-flight** (1 computação por chave), **stale-while-revalidate** (TTL 8 min; até 1 h
  devolve o antigo na hora e recalcula em 2º plano), invalidação por prefixo e proteção contra gravar resultado invalidado no meio do cálculo.
  Usado por: duplicadas (`unif:dup:` e `dup:`), termos (`termos:`), pastas (`pastas:`); os "ignorados" têm TTL 60 s.
- Mutações continuam invalidando (`limparCacheUnificar` / `limparCacheTermos` / `limparCachePU`); "não é duplicada" só zera as comparações (não refaz a detecção).
- Detecção de duplicadas: `simulado_questoes` + `simulado_alternativas` agora em **paralelo** (2 consultas SQL, só id/texto/flags; antes sequencial: 1,6 s + 1,5 s -> ~1,6 s).
- Termos: "ignorados" de **todos os tipos em 1 consulta** (antes 1 por tipo = 7 nos resumos).
- Loaders SSR (contrato): `carregarInicialUnificar(tenantId)` (1ª página, resumo das vistas, facetas e **membros do 1º grupo**),
  `carregarInicialTermos(tenantId)` (resumos das 7 abas + grupos do tipo padrão `banca`), `carregarInicialUnificarDisciplinas(tenantId, categoria='conteudo', comTaxonomia=true)`
  (grupos de pastas + nº de grupos da taxonomia). Tipos: `InicialUnificar`, `InicialTermos`, `InicialDisciplinas`. Extra: `aquecerUnificar(svc, tenantId)` (fire-and-forget).
- Componentes: `QuestoesUnificar({ podeEditar, inicial?: { duplicadas?, termos? } })`, `UnificarTermos({ podeEditar, inicial? })`, `UnificarDisciplinas({ ...props, inicial? })`
  renderizam **imediatamente** com `inicial` (estado inicial = prop, sem efeito de carga; o SSR só vale para a 1ª montagem). Cache do cliente (60 s) é semeado com o `inicial`.
- Cliente: chave de cache com parâmetros ordenados (antes o prefetch por hover usava ordem diferente e nunca acertava); prefetch por hover nos itens da lista de grupos
  (abrir grupo), nas abas de vista (Pendentes/Ignoradas/Resolvidas) e nas abas de tipo de termo. Disciplinas: resumo vem da própria lista (fim da chamada pp=5) e nTax vem do SSR.

## Medição (Playwright, harness SSR temporário já removido; dev server)
| Cenário | Antes (relato) | Depois |
|---|---|---|
| Termos: dado visível após o HTML | ~8,7-10,7 s | 0,8-2,0 s (HTML = dado), **0 chamadas próprias** |
| Disciplinas: idem | ~6,4 s cold (2 chamadas) | 0,9 s, **0 chamadas próprias** |
| Duplicadas: HTML até lista+1º grupo | 5,9-7 s, 6 chamadas | ~0,9-1,6 s; 2 chamadas em 2º plano (prefetch pág. 2 + prévia do mestre) |
| Loader SSR duplicadas cold / warm | 3,3 s só detecção | 2,4 s / 0,19 s (inclui membros do 1º grupo) |
| Loader termos cold / warm | 6,4 s | 1,1 s / 1 ms |
| Trocar tipo de termo (hover + clique) | 0,6-6 s | 230 ms |
Obs.: o `lat.mjs` sobre a página real ainda mostra os números antigos porque o page.tsx/biblioteca-app.tsx (agente A) não passa `inicial` — a medição acima usou páginas SSR temporárias com os mesmos loaders/componentes.

## Para o agente A ligar
`page.tsx`: `const inicial = { duplicadas: await carregarInicialUnificar(t) }` (modo=unificar, seção duplicadas) ou `{ termos: await carregarInicialTermos(t) }` (seção termos);
`<QuestoesUnificar inicial={...} />`; `<UnificarDisciplinas inicial={await carregarInicialUnificarDisciplinas(t, 'conteudo'|'jurisclub')} />` (só vale se `inicial.categoria === categoria`).
Opcional: chamar `aquecerUnificar(createAdminClient(), t)` em qualquer entrada de Biblioteca > Questões para o 1º acesso já cair quente.

## Pendências
- Cold da detecção de duplicadas (~2,4 s) ocorre 1x por processo; não persistido entre reinícios. Persistir shingles/hash (coluna ou tabela) exigiria trigger de manutenção — não criado (sem migration nova).
- Edições de questões fora do Unificar só aparecem após TTL/SWR (8 min) ou "Recalcular".
- Cache é por processo (se houver várias réplicas, cada uma computa 1x).
- `tsc`: só erros alheios (`.next/types`, `questoes/gestao/route.ts`).
