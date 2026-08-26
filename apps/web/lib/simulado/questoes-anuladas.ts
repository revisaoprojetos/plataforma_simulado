// Estado de anulação de uma questão NO BANCO — fonte única para esconder/travar/pontuar.
// Combina os dois mecanismos que existem no sistema:
//   1. Etiqueta FUNCIONAL (simulado_etiquetas.funcao): 'anular' | 'desconsiderar'  ← usado na prática
//   2. Boolean simulado_questoes.anulada (import "ANULADA")                          ← legado
// 'anular'/boolean → pontua_todos (some da prática/seleção, trava no runner, ponto garantido a todos).
// 'desconsiderar' → sai do total (some da prática/seleção, trava no runner, não conta pra ninguém).
// Ambos "tiram a questão de jogo" para o aluno.

import { funcaoEtiquetaPorQuestao } from './etiqueta-funcao'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'

type AnyClient = { from: (t: string) => any }
export type EstadoAnulacao = 'anular' | 'desconsiderar'

/** Estado de anulação por questão (só as anuladas entram no Map), para um conjunto de IDs. */
export async function estadoAnulacaoPorQuestao(svc: AnyClient, tenantId: string, questaoIds: string[]): Promise<Map<string, EstadoAnulacao>> {
  const out = new Map<string, EstadoAnulacao>()
  const ids = [...new Set((questaoIds ?? []).filter(Boolean))]
  if (!ids.length) return out
  // Etiqueta funcional (a mais forte por questão) — mecanismo principal.
  const funcs = await funcaoEtiquetaPorQuestao(svc, ids)
  for (const [qid, ef] of funcs) {
    if (ef.funcao === 'anular') out.set(qid, 'anular')
    else if (ef.funcao === 'desconsiderar') out.set(qid, 'desconsiderar')
  }
  // Boolean anulada (banco): 'anular' se ainda não classificada por etiqueta.
  const anul = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_questoes').select('id').eq('tenant_id', tenantId).eq('anulada', true).in('id', chunk))
  for (const q of anul) if (!out.has(q.id)) out.set(q.id, 'anular')
  return out
}

/** TODOS os IDs de questão "fora de jogo" do tenant (anular OU desconsiderar OU boolean).
 *  Para esconder da área de prática (que pagina o banco inteiro server-side). */
export async function questoesForaDeJogoTenant(svc: AnyClient, tenantId: string): Promise<Set<string>> {
  const out = new Set<string>()
  // Boolean anulada.
  const anul = await fetchAll<any>(() => svc.from('simulado_questoes').select('id').eq('tenant_id', tenantId).eq('anulada', true))
  for (const q of anul) out.add(q.id)
  // Questões vinculadas a etiquetas funcionais anular/desconsiderar do tenant.
  const { data: ets } = await svc.from('simulado_etiquetas').select('id, funcao').eq('tenant_id', tenantId).in('funcao', ['anular', 'desconsiderar'])
  const etIds = ((ets ?? []) as any[]).map((e) => e.id).filter(Boolean)
  if (etIds.length) {
    const vinc = await fetchAll<any>(() => svc.from('simulado_questao_etiquetas').select('questao_id').in('etiqueta_id', etIds))
    for (const v of vinc) if ((v as any).questao_id) out.add((v as any).questao_id)
  }
  return out
}
