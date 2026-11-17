import 'server-only'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { reancorarParcial, type TrechoGrifo } from './reanchor-parcial'

/**
 * Ajusta, NO LUGAR, os grifos/anotações de uma versão ao texto novo (S = espinha do HTML salvo).
 * Só mexe no que o texto editado afetou: grifo intacto não é tocado; apagou início/fim → encurta;
 * apagou o miolo → fica contíguo; texto novo no meio → divide em dois. Se TODO o trecho sumiu:
 * aluno = marca `revisao_necessaria` (o registro não é perdido); base do admin = soft-delete.
 */
export async function ajustarAnotacoesAoTexto(svc: any, tenantId: string, documentoId: string, versao: number, S: string): Promise<{ ajustados: number; divididos: number; sumidos: number }> {
  const res = { ajustados: 0, divididos: 0, sumidos: 0 }
  for (const tabela of ['simulado_leitura_anotacoes', 'simulado_documento_anotacoes_base'] as const) {
    const ehAluno = tabela === 'simulado_leitura_anotacoes'
    let rows: any[]
    try {
      rows = await fetchAll<any>(() => svc.from(tabela).select('*').eq('tenant_id', tenantId).eq('documento_id', documentoId)
        .eq('documento_versao', versao).eq('deletado', false).order('id', { ascending: true }) as any)
    } catch { continue }
    const memo = new Map<string, TrechoGrifo[]>() // clones do mesmo grifo base repetem a âncora em todos os alunos
    const trabalho: Array<() => Promise<unknown>> = []
    for (const a of rows) {
      const k = `${a.inicio_char}|${a.fim_char}|${a.exact}|${a.prefix ?? ''}|${a.suffix ?? ''}`
      let seg = memo.get(k)
      if (!seg) { seg = reancorarParcial(S, { inicio: a.inicio_char, fim: a.fim_char, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '' }); memo.set(k, seg) }
      if (seg.length === 1 && seg[0].inicio === a.inicio_char && seg[0].fim === a.fim_char && seg[0].exact === a.exact) continue
      if (!seg.length) {
        res.sumidos++
        trabalho.push(async () => ehAluno
          ? svc.from(tabela).update({ revisao_necessaria: true }).eq('id', a.id)
          : svc.from(tabela).update({ deletado: true }).eq('id', a.id))
        continue
      }
      const [p, ...resto] = seg
      res.ajustados++
      trabalho.push(async () => svc.from(tabela).update({ inicio_char: p.inicio, fim_char: p.fim, exact: p.exact, prefix: p.prefix, suffix: p.suffix, ...(ehAluno ? { revisao_necessaria: false } : {}) }).eq('id', a.id))
      if (resto.length) {
        res.divididos++
        const { id: _id, criado_em: _c, atualizado_em: _u, ...molde } = a
        // Pedaços extras viram anotações novas (mesma cor/nota/tipo). base_id=null: o índice único (aluno,versão,base_id) não aceita repetir.
        const extras = resto.map((t) => ({ ...molde, inicio_char: t.inicio, fim_char: t.fim, exact: t.exact, prefix: t.prefix, suffix: t.suffix, ...(ehAluno ? { base_id: null, revisao_necessaria: false } : {}) }))
        trabalho.push(async () => svc.from(tabela).insert(extras))
      }
    }
    for (let i = 0; i < trabalho.length; i += 10) await Promise.all(trabalho.slice(i, i + 10).map((f) => f().catch(() => null)))
  }
  return res
}
