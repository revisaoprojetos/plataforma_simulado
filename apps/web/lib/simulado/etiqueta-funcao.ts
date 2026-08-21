// Etiquetas FUNCIONAIS: dada uma lista de questões, resolve a função (comportamento)
// que se aplica a cada uma. Uma questão pode ter várias etiquetas — vale a MAIS FORTE.
// Tolerante à coluna `funcao` ausente (migração pendente) → devolve Map vazio.

type AnyClient = { from: (t: string) => any }

export type FuncaoEtiqueta = 'anular' | 'avisar' | 'desconsiderar'
export interface EtiquetaFuncional { funcao: FuncaoEtiqueta; nome: string; cor: string | null }

// Prioridade quando a questão tem mais de uma etiqueta funcional.
const PRIORIDADE: Record<FuncaoEtiqueta, number> = { anular: 3, desconsiderar: 2, avisar: 1 }
const FUNC_VALIDA = (f: any): f is FuncaoEtiqueta => f === 'anular' || f === 'avisar' || f === 'desconsiderar'
/** anular e desconsiderar tiram a questão de jogo (bloqueia responder). avisar não. */
export const funcaoBloqueia = (f?: FuncaoEtiqueta | null) => f === 'anular' || f === 'desconsiderar'

/** Map questao_id → etiqueta funcional mais forte. `[]`/coluna ausente → Map vazio. */
export async function funcaoEtiquetaPorQuestao(svc: AnyClient, questaoIds: string[]): Promise<Map<string, EtiquetaFuncional>> {
  const out = new Map<string, EtiquetaFuncional>()
  const ids = [...new Set(questaoIds.filter(Boolean))]
  if (!ids.length) return out
  try {
    const { data: links } = await svc.from('simulado_questao_etiquetas').select('questao_id, etiqueta_id').in('questao_id', ids)
    const etIds = [...new Set(((links ?? []) as any[]).map((l) => l.etiqueta_id).filter(Boolean))]
    if (!etIds.length) return out
    const { data: ets, error } = await svc.from('simulado_etiquetas').select('id, nome, cor, funcao').in('id', etIds)
    if (error) return out // coluna `funcao` ainda não existe → sem função
    const etMap = new Map(((ets ?? []) as any[]).map((e) => [e.id, e]))
    for (const l of (links ?? []) as any[]) {
      const e = etMap.get(l.etiqueta_id)
      if (!e || !FUNC_VALIDA(e.funcao)) continue
      const cand: EtiquetaFuncional = { funcao: e.funcao, nome: e.nome, cor: e.cor ?? null }
      const cur = out.get(l.questao_id)
      if (!cur || PRIORIDADE[cand.funcao] > PRIORIDADE[cur.funcao]) out.set(l.questao_id, cand)
    }
  } catch { /* tolerante */ }
  return out
}
