# Golden do motor do Cronograma Adaptativo

Rede de segurança da refatoração "regras do motor viram dados". Congela a saída do motor ATUAL
(`apps/web/lib/cronograma/adaptativo/motor30.ts` + `motor28.ts`, `VERSAO_MOTOR` 3.2.0) em 125 cenários.
Qualquer refatoração tem de reproduzir **exatamente** a mesma saída.

## Comandos (de `apps/web`)

```
node scripts/_golden-motor.mjs --conferir    # compara o motor atual com os goldens (exit 1 se divergir)
node scripts/_golden-motor.mjs --gravar      # REGRAVA os goldens (decisão consciente, ver abaixo)
node scripts/_golden-motor.mjs --conferir --filtro="dominio: reduzir"   # só cenários cujo nome contém o trecho
node scripts/_golden-motor.mjs --conferir --tempo                       # ms por cenário
```

`--conferir` roda no fim de `pnpm --filter web cronograma:testar`. Leva ~2 min (os cenários de dominó são lentos, ~3 s cada).
Se mexer em `motor28.ts`/`motor30.ts`, rode também `pnpm --filter web cronograma:motor` (gera o bundle do iframe).

## O que é congelado

Por cenário (`scripts/golden/`):

| Arquivo | Conteúdo |
|---|---|
| `cenarios.json` | por cenário: categoria, sha1 da ENTRADA, sha1 da SAÍDA canônica, resumo legível (nº de metas por tipo, fim/semanas, primeira/última data, horas totais). Versionado, legível no diff do git. |
| `planos-gz.json` | saída canônica completa de cada cenário (gzip+base64). É o que permite listar QUAIS ids mudaram. |
| `completos.json` | plano completo, legível, de 8 cenários-chave (carga 24h, 36h, jp 25h, histórico >70, dominó organizar atrasadas, dominó reduzir p/ 20h, semana especial, erro de insuficiência). |

Saída canônica = `{ plano: {id: [data, horas]}, fim, detalhes, legprocRestantes, cfgAtualizada }` ou `{ erro: {nome, codigo, mensagem} }`
(chaves ordenadas, números com 9 casas, sem `undefined`). Cenários `validarHoras300` guardam a mensagem de validação.

Categorias: `carga` (4 faixas × revisão 4/6/8), `arranjo`, `jp`, `metas` (LegProc/PDFlash/questões on/off, LegProc complementar),
`historico` (ultimosTemas + historicoQuestoes <50 / 50-70 / =70 / >70), `discs` (1 a todas as disciplinas), `calendario`
(folgas, horasPontuais, recessos, rotinas, início), `ritmo` (vel, params), `progresso` (metas concluídas + notas → semana especial,
limiares 50/70), `dominio` (calcularDomino: organizar atrasadas, ajustar horas, pausa/retomar, mover meta, parcial/sobra),
`erro` (ErroInsuficiencia, config < 10h, validação).

## Determinismo

"hoje" fixo (`HOJE = 2026-01-05`, ou a data do cenário), catálogo = `lib/cronograma/adaptativo/catalogo-html.json` (versionado; não usa o HTML externo),
sem `Math.random`/`Date.now` na geração. Rodar `--gravar` → `--conferir` repetidas vezes sempre passa.

Invariante extra (checada em `--conferir`): nos cenários `progresso` e `dominio`, metas **concluídas** nunca podem mudar de data/horas.

## Quando regravar (`--gravar`)

Só por decisão consciente de mudar o comportamento do motor (nova regra de negócio), nunca "para o teste passar" numa refatoração:

1. Rode `--conferir` e leia o diff — ele deve mostrar exatamente (e só) o que a decisão pretende mudar.
2. Regrave, confira o `git diff scripts/golden/cenarios.json` (resumos) e registre o motivo no commit/CHANGELOG (bump de `VERSAO_MOTOR` se couber).
3. Se `catalogo-html.json` mudar, o `--conferir` avisa (`catalogo-html.json mudou`) — a divergência pode vir do catálogo, não do motor.

## Como ler o diff

```
✗ carga 10h rev8 (4d)  [carga]
    fim 67 -> 67 | metas 665 -> 666 | mudaram 1, novas 1, sumiram 0, detalhes 0
    ~ fl:100  2030-01-01 9h  ->  2027-02-12 1h     # ~ = mudou: golden -> atual (data, horas)
    + fl:102                                       # + = meta nova no plano atual
    - pf:7                                         # - = meta que sumiu
```

- "a ENTRADA do cenário mudou" = alterou-se o script ou o catálogo (não o motor): regrave conscientemente.
- "cenário novo sem golden" / "existe no golden mas sumiu do script" = lista de cenários divergente.
- Erros: mostra o golden e o atual (`nome`, `codigo`, `mensagem`).
