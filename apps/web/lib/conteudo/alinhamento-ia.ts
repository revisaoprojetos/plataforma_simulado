import 'server-only'
import type { ConfigIA } from '../ia/config'
import { pipelineNiveis, type Agente } from '../ia/agentes'
import type { ParAmbiguo, ResultadoAlinhamento, TrechoVersao, Alinhamento } from './alinhamento'

// Camada de IA do alinhamento de uid — SÓ para os casos AMBÍGUOS que o determinístico (alinhamento.ts)
// não resolveu com confiança. Reaproveita o motor de níveis (Haiku→Sonnet→Opus) com orçamento:
//   - TRIAGEM (Haiku): o trecho novo é claramente NOVO (nenhum candidato serve)? Se sim, descarta
//     barato → fica órfão (seguro). Poupa Sonnet/Opus na maioria.
//   - EXECUÇÃO (Sonnet): escolhe o uid correto entre os candidatos (ou nenhum), com confiança 0..1.
//   - CONSOLIDAÇÃO (Opus): só quando o Sonnet ficou em dúvida (confiança < limiar) — a decisão final.
// A PoC mostra que o determinístico nunca migra grifo errado; aqui o foco é RECUPERAR recall sem
// introduzir "fantasmas", por isso a triagem é severa e o Opus arbitra o cinza.

interface ItemAmb { novoIndice: number; textoNovo: string; candidatos: { uid: string; texto: string; similaridade: number }[] }
interface SaidaTriagem { ehNovo: boolean }
interface SaidaExec { uid: string | null; confianca: number; motivo?: string }
interface SaidaCons { uid: string | null; confianca: number }

const AG_TRIAGEM: Agente = {
  nome: 'Triador de trecho', nivel: 'triagem', maxTokens: 256, temperatura: 0,
  instrucoes: 'Você decide se um PARÁGRAFO NOVO de um documento é conteúdo genuinamente NOVO (nenhum dos parágrafos antigos candidatos é "o mesmo parágrafo editado") ou se PLAUSIVELMENTE corresponde a um deles. Seja rigoroso: inserções, notas e comentários novos são NOVOS. Responda apenas o schema.',
  schema: { name: 'triar', input_schema: { type: 'object', properties: { ehNovo: { type: 'boolean', description: 'true se o parágrafo novo não corresponde a nenhum candidato' } }, required: ['ehNovo'] } },
}
const AG_EXEC: Agente = {
  nome: 'Casador de uid', nivel: 'execucao', maxTokens: 400, temperatura: 0.1,
  instrucoes: 'Você recebe um PARÁGRAFO NOVO e uma lista de CANDIDATOS antigos (cada um com seu uid). Escolha o uid do candidato que é "o mesmo parágrafo", possivelmente editado (mesma ideia/função no texto). Se nenhum corresponder de fato, devolva uid=null. Dê uma confiança 0..1 honesta. Só case quando houver correspondência real de conteúdo, não apenas tema parecido.',
  schema: { name: 'casar', input_schema: { type: 'object', properties: { uid: { type: ['string', 'null'] }, confianca: { type: 'number' }, motivo: { type: 'string' } }, required: ['uid', 'confianca'] } },
}
const AG_CONS: Agente = {
  nome: 'Árbitro final', nivel: 'consolidacao', maxTokens: 400, temperatura: 0,
  instrucoes: 'Arbitragem final de um caso DUVIDOSO de correspondência de parágrafo entre versões. Decida com rigor se o parágrafo novo É o mesmo de algum candidato (devolva o uid) ou não (uid=null). Em caso de dúvida real, prefira uid=null — é mais seguro deixar o grifo virar órfão do que ancorá-lo no lugar errado.',
  schema: { name: 'arbitrar', input_schema: { type: 'object', properties: { uid: { type: ['string', 'null'] }, confianca: { type: 'number' } }, required: ['uid', 'confianca'] } },
}

function corpoItem(it: ItemAmb): string {
  const cs = it.candidatos.map((c, i) => `  [${i}] uid=${c.uid} (sim ${(c.similaridade * 100).toFixed(0)}%): "${c.texto.slice(0, 400)}"`).join('\n')
  return `PARÁGRAFO NOVO:\n"${it.textoNovo.slice(0, 600)}"\n\nCANDIDATOS ANTIGOS:\n${cs}`
}

export interface OpcoesIA { limiarOpus?: number; concorrencia?: number; orcamentoUSD?: number }
export interface ResultadoIA { decisoes: { novoIndice: number; uid: string | null; confianca: number }[]; uso: import('../ia/agentes').Uso }

/** Resolve os AMBÍGUOS via pipeline de níveis. `velhos` é só para recuperar o texto dos candidatos. */
export async function resolverAmbiguosIA(
  cfg: ConfigIA, ambiguos: ParAmbiguo[], novos: TrechoVersao[], velhos: TrechoVersao[], opts: OpcoesIA = {},
): Promise<ResultadoIA> {
  const limiarOpus = opts.limiarOpus ?? 0.8
  const itens: ItemAmb[] = ambiguos.map((a) => ({
    novoIndice: a.novoIndice,
    textoNovo: novos[a.novoIndice]?.texto ?? '',
    candidatos: a.candidatos.map((c) => ({ uid: c.uid, texto: velhos[c.velhoIndice]?.texto ?? '', similaridade: c.similaridade })),
  }))
  if (itens.length === 0) return { decisoes: [], uso: { entrada: 0, saida: 0, custoUSD: 0, chamadas: 0 } }

  const r = await pipelineNiveis<ItemAmb, SaidaTriagem, SaidaExec, SaidaCons>(cfg, {
    itens,
    triagem: { agente: AG_TRIAGEM, entrada: (it) => corpoItem(it), passa: (s) => !(s?.ehNovo === true) },
    execucao: { agente: AG_EXEC, entrada: (it) => corpoItem(it) },
    consolidacao: {
      agente: AG_CONS,
      precisa: (ex) => !ex || typeof ex.confianca !== 'number' || ex.confianca < limiarOpus,
      entrada: (ex, it) => corpoItem(it) + `\n\nPROPOSTA DO EXECUTOR: uid=${ex?.uid ?? 'null'} (confiança ${ex?.confianca ?? 0}). Reavalie.`,
    },
    concorrencia: opts.concorrencia ?? 6,
    orcamentoUSD: opts.orcamentoUSD,
  })

  const decisoes = r.resultados.map((res) => {
    if (!res.triado) return { novoIndice: res.item.novoIndice, uid: null, confianca: 1 } // triagem disse "novo"
    const fonte = res.consolidacao ?? res.execucao
    const uid = fonte?.uid ?? null
    // só aceita o uid se for de fato um candidato do item (evita alucinação de uid)
    const valido = uid && res.item.candidatos.some((c) => c.uid === uid) ? uid : null
    return { novoIndice: res.item.novoIndice, uid: valido, confianca: fonte?.confianca ?? 0 }
  })
  return { decisoes, uso: r.uso }
}

/** Aplica as decisões da IA sobre um ResultadoAlinhamento, atualizando alinhamentos e órfãos. */
export function aplicarDecisoesIA(base: ResultadoAlinhamento, decisoes: ResultadoIA['decisoes'], velhos: TrechoVersao[]): ResultadoAlinhamento {
  const porNovo = new Map(decisoes.map((d) => [d.novoIndice, d]))
  // uids já carregados pelo determinístico — a IA NÃO pode reatribuí-los (senão colide unique(versao,uid))
  const usados = new Set<string>(base.alinhamentos.map((a) => a.uid).filter((u): u is string => !!u))
  const alinhamentos: Alinhamento[] = base.alinhamentos.map((a) => {
    const d = porNovo.get(a.novoIndice)
    if (!d || !d.uid || usados.has(d.uid)) return a // uid ausente ou já em uso → mantém (fica 'novo'/órfão)
    const vi = velhos.findIndex((v) => (v.uid || `v${v.indice}`) === d.uid)
    usados.add(d.uid)
    return { ...a, uid: d.uid, velhoIndice: vi >= 0 ? velhos[vi].indice : a.velhoIndice, origem: 'ia', similaridade: d.confianca, estado: 'alterado' }
  })
  const orfaos = base.orfaos.filter((o) => !usados.has(o.uid))
  return { ...base, alinhamentos, orfaos, ambiguos: [] }
}
