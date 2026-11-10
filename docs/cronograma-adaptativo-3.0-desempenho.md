# Cronograma Adaptativo - otimizacao de desempenho do motor (sem mudar resultado)

## Hotspot
`gerarPlano` com metas remanejadas chama o dominó (`calcularDomino219Base`, em `motor30.ts`). O laco
dia a dia chama `liberar()` para cada item da fila a cada iteracao, e cada chamada varria `plano`
inteiro (`ocupado`, `pdfsDia`, ids de LP/Questoes do dia, `continuacaoPDF216`, `novosPDFDia27`,
checagem "resto" de PDF): O(plano) dentro de O(fila) dentro de O(dias). Profile (--cpu-prof):
`tipoEstudo` (split) 41%, `ocupado` 22%, `dParse` 7%, `chaveLei` 4%, `pdfsDia`, `liberar`.

## Correcao (mesma ordem de iteracao e desempates)
- `motor30.ts`: indices incrementais do plano do dominó (minutos por dia, ids por dia em ordem de
  insercao, PDFs por aula) atualizados em `colocar()`; `pdfsDia`, `novosPDFDia27().size` e
  `limitePDF27` memoizados por dia e versao do plano; `continuacaoPDF216` usa o indice por aula;
  `tipoEstudo`/`indiceAula`/`familiaMeta` memoizadas.
- `motor28.ts`: `dAdd`, `dDow`, `semDe` (so strings/numeros, sem cachear `Date`) e `chaveLei` memoizadas.
- Nada de regra de negocio, ids ou index.html alterado (index.html so recebeu o cache-buster do bundle).

## Prova de equivalencia (hash sha1 de plano+detalhes+fim, motor antigo x novo)
- 19 cenarios proprios (perf.mjs + remanejadas variadas: pf/fl/qu/lp, parciais, 5 e 8 remanejadas,
  tardia, pontuais, 4 disciplinas, revisao off, arranjo flash, fixos): 19/19 identicos.
- `_motor30-diferencial`: 29/29 hashes identicos; `_motor30-dominio`: 12/12 identicos.

## Tempos (ms, Node)
| cenario | antes | depois |
|---|---|---|
| base 9 ess | 1207 | 272 |
| 1 parcial pf | 91123 | 2422 |
| 1 rem fl / pf / qu / lp | 45-48 mil | ~1100-1200 |
| 3 rem mistas | 47791 | 1281 |
| 5 rem pf | 90705 | 2153 |
| 8 rem fl+qu | 45408 | 1207 |
| rem tardia (60d) | 96080 | 1976 |
| revisao off + rem | 101488 | 3671 |
| arranjo flash + rem | 62758 | 2297 |
| fixos + rem | 34925 | 1428 |

Os scripts `_motor30-diferencial/dominio` continuam lentos (~50 s / ~6 min) porque o tempo e do motor
de REFERENCIA do HTML rodando em vm, nao do motor TS.
