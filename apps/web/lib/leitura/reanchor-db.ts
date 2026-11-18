import 'server-only'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { decidirAjuste, type DecisaoAjuste } from './reanchor-decisao'

export interface ResultadoAjuste { ajustados: number; divididos: number; sumidos: number; falhas: number; pulado?: 'juris' }

/**
 * Documento do desafio de JURISPRUDÊNCIA (pasta/ancestral com folder_area='jurisprudencia').
 * O leitor-jus.html monta o texto no cliente (numeral, aspas, rótulos, blocos reordenados + fallback por texto),
 * então a espinha do servidor é INCOMPATÍVEL: nesses docs NÃO se reancora no servidor — o cliente recupera por texto.
 * Em dúvida/erro de leitura → true (conservador: não mexe).
 */
export async function documentoEhJuris(svc: any, tenantId: string, documentoId: string): Promise<boolean> {
  try {
    const { data: doc, error } = await svc.from('simulado_documentos').select('pasta_id').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
    if (error) return true
    let pid: string | null = (doc as any)?.pasta_id ?? null
    for (let i = 0; pid && i < 12; i++) {
      const { data: p, error: e2 } = await svc.from('simulado_pastas').select('folder_area, pai_id').eq('id', pid).maybeSingle()
      if (e2) return true
      if ((p as any)?.folder_area === 'jurisprudencia') return true
      pid = (p as any)?.pai_id ?? null
    }
    return false
  } catch { return true }
}

/**
 * Ajusta os grifos/anotações de uma versão ao texto novo (S = espinha do HTML salvo) — CONSERVADOR.
 *  - `exact` ainda presente em S (literal ou normalizado) → NÃO toca (nem offsets): o cliente reancora por texto.
 *  - realmente mudou + alta confiança → encurta/divide (extras nascem ANTES; se o original sumiu no meio, são desfeitos).
 *  - sem texto / baixa confiança → aluno: só `revisao_necessaria=true`; base do admin: não toca. NUNCA apaga.
 * UPDATEs só em linhas `deletado=false`. Erros são CONTADOS em `falhas` (o chamador loga; nunca bloqueia o salvar).
 */
export async function ajustarAnotacoesAoTexto(svc: any, tenantId: string, documentoId: string, versao: number, S: string): Promise<ResultadoAjuste> {
  const res: ResultadoAjuste = { ajustados: 0, divididos: 0, sumidos: 0, falhas: 0 }
  if (await documentoEhJuris(svc, tenantId, documentoId)) return { ...res, pulado: 'juris' }
  for (const tabela of ['simulado_leitura_anotacoes', 'simulado_documento_anotacoes_base'] as const) {
    const ehAluno = tabela === 'simulado_leitura_anotacoes'
    let rows: any[]
    try {
      rows = await fetchAll<any>(() => svc.from(tabela).select('*').eq('tenant_id', tenantId).eq('documento_id', documentoId)
        .eq('documento_versao', versao).eq('deletado', false).order('id', { ascending: true }) as any)
    } catch (e) { res.falhas++; console.error('[leitura] ajustar: leitura', tabela, e); continue }
    const memo = new Map<string, DecisaoAjuste>() // clones do mesmo grifo base repetem a âncora em todos os alunos
    const trabalho: Array<() => Promise<void>> = []
    for (const a of rows) {
      const k = `${a.inicio_char}|${a.fim_char}|${a.exact}|${a.prefix ?? ''}|${a.suffix ?? ''}`
      let d = memo.get(k)
      if (!d) { d = decidirAjuste(S, { inicio: a.inicio_char, fim: a.fim_char, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '' }); memo.set(k, d) }
      if (d.acao === 'manter') continue
      if (d.acao === 'revisar') {
        if (!ehAluno) continue // base do admin: nada a marcar e nunca apaga
        res.sumidos++
        trabalho.push(async () => {
          const r = await svc.from(tabela).update({ revisao_necessaria: true }).eq('id', a.id).eq('deletado', false)
          if (r.error) { res.falhas++; console.error('[leitura] ajustar: revisao', r.error.message) }
        })
        continue
      }
      const [p, ...resto] = d.trechos
      trabalho.push(async () => {
        let extraIds: string[] = []
        if (resto.length) {
          const { id: _id, criado_em: _c, atualizado_em: _u, ...molde } = a
          // Pedaços extras = anotações novas (mesma cor/nota/tipo). base_id=null: o índice único (aluno,versão,base_id) não aceita repetir.
          // Inseridos ANTES de encurtar o original: se falhar, o original segue intacto (nada se perde).
          const extras = resto.map((t) => ({ ...molde, deletado: false, inicio_char: t.inicio, fim_char: t.fim, exact: t.exact, prefix: t.prefix, suffix: t.suffix, ...(ehAluno ? { base_id: null, revisao_necessaria: false } : {}) }))
          const ins = await svc.from(tabela).insert(extras).select('id')
          if (ins.error) { res.falhas++; console.error('[leitura] ajustar: extras', ins.error.message); return }
          extraIds = ((ins.data ?? []) as any[]).map((x) => x.id)
        }
        const up = await svc.from(tabela).update({ inicio_char: p.inicio, fim_char: p.fim, exact: p.exact, prefix: p.prefix, suffix: p.suffix, ...(ehAluno ? { revisao_necessaria: false } : {}) })
          .eq('id', a.id).eq('deletado', false).select('id')
        const tocou = !up.error && (up.data?.length ?? 0) > 0
        if (!tocou) {
          // Original apagado (ou erro) no meio: NÃO ressuscita — desfaz (soft) os extras que acabamos de criar.
          if (up.error) { res.falhas++; console.error('[leitura] ajustar: update', up.error.message) }
          if (extraIds.length) {
            const rb = await svc.from(tabela).update({ deletado: true }).in('id', extraIds)
            if (rb.error) { res.falhas++; console.error('[leitura] ajustar: rollback extras', rb.error.message) }
          }
          return
        }
        res.ajustados++
        if (resto.length) res.divididos++
      })
    }
    for (let i = 0; i < trabalho.length; i += 10) {
      await Promise.all(trabalho.slice(i, i + 10).map((f) => f().catch((e) => { res.falhas++; console.error('[leitura] ajustar', e) })))
    }
  }
  return res
}
