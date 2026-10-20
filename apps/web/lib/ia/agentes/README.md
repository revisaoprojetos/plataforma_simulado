# Multi-agents em níveis (`lib/ia/agentes`)

Motor para orquestrar vários agentes de IA **em níveis**, otimizando **tokens** e **agilidade**.
Reaproveita a infra de IA do projeto (`lib/ia/config.ts` — chave cifrada por tenant, provedor
detectado) e chama o provedor por `fetch` (sem SDK novo). Alvo: **Claude API (Anthropic)**.

## Os 3 níveis (barato → forte)

| Nível | Papel | Modelo (Anthropic) | Roda quando |
|---|---|---|---|
| **1 · Triagem** | classifica / roteia / filtra | **Haiku 4.5** | sempre, 1× por item (barato) |
| **2 · Execução** | o trabalho de verdade, **em paralelo** | **Sonnet 4.6** | só nos itens que passaram na triagem |
| **3 · Consolidação** | juiz / síntese / casos difíceis | **Opus 4.8** | só quando execução/triagem sinaliza dúvida |

**Por que otimiza:** o Opus (caro) só entra no que importa; o grosso roda no Sonnet **em paralelo**;
o Haiku descarta barato o que não precisa ir adiante. Cada chamada volta com **uso de tokens + custo**,
e o pipeline tem **orçamento (early-exit)** e **trace** de todos os passos.

## Peças

- `niveis.ts` — `Nivel`, `MODELO_POR_NIVEL`, `CUSTO_MTOK`, `modeloDoNivel`, `custoUSD`.
- `cliente.ts` — `chamarIA(cfg, {system, user, model, tool, maxTokens, temperature})` → `{texto, toolInput, usage}` (multi-provedor, com tokens).
- `orquestrador.ts` — `Agente`, `rodarAgente`, `emParalelo`, `pipelineNiveis`.
- `index.ts` — `resolverConfigIA(svc, tenantId)` (config do tenant OU `ANTHROPIC_API_KEY`).

## Uso

```ts
import { resolverConfigIA, pipelineNiveis, type Agente } from '@/lib/ia/agentes'

const cfg = await resolverConfigIA(svc, tenantId)      // ou só env ANTHROPIC_API_KEY
if (!cfg) throw new Error('IA não configurada')

const triador: Agente = {
  nome: 'triador', nivel: 'triagem',
  instrucoes: 'Diga se o item merece análise profunda. Responda no schema.',
  schema: { input_schema: { type: 'object', properties: { merece: { type: 'boolean' }, motivo: { type: 'string' } }, required: ['merece'] } },
}
const executor: Agente = { nome: 'analista', nivel: 'execucao', instrucoes: 'Analise o item e devolva…', schema: {/* … */} }
const juiz: Agente = { nome: 'juiz', nivel: 'consolidacao', instrucoes: 'Revise a análise e consolide…', schema: {/* … */} }

const { resultados, uso, trace } = await pipelineNiveis(cfg, {
  itens,                                             // qualquer lista
  triagem:      { agente: triador,  entrada: (it) => textoDoItem(it), passa: (s) => !!s?.merece },
  execucao:     { agente: executor, entrada: (it) => textoDoItem(it) },
  consolidacao: { agente: juiz,     precisa: (ex) => ex?.confianca < 0.7, entrada: (ex, it) => JSON.stringify({ ex, it }) },
  concorrencia: 6,
  orcamentoUSD: 0.50,                                // para ao atingir o teto
})
// `uso` = tokens + custo total; `trace` = cada passo (agente/nível/modelo/tokens/custo)
```

## Quando a nova etapa chegar

Só definir os 3 `Agente` (instruções + schema) e os callbacks de `entrada/passa/precisa` do
`pipelineNiveis` para o caso de uso. O motor (níveis, paralelismo, orçamento, contabilização,
trace) já está pronto.
