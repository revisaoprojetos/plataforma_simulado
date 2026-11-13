'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { remember } from '@/lib/cache/relatorio-cache'
import { carregarConteudoBancoBase } from '@/lib/cronograma/adaptativo/conteudo-banco'
import { CATALOGO_HTML } from '@/lib/cronograma/adaptativo/catalogo-html'
import { minPdf } from '@/lib/cronograma/adaptativo/engine'
import { paginasEfetivasDocs, type DocParaPaginas } from '@/lib/conteudo/paginas-efetivas'
import { sincronizarPaginasDocumento, invalidarCachesPaginas } from '@/lib/conteudo/paginas-sync'

// Admin › Cronograma adaptativo › Catálogo de metas › Divergência de páginas (planilha × real) + "Recontar páginas".
// SOMENTE LEITURA para os planos: nada aqui altera cronogramas de alunos (isso é a flag tema.cronograma_paginas_reais).

async function acesso(acao: 'view' | 'update') {
  const a = await getCurrentAccess()
  const permitido = a.isAdmin || a.permissions.includes('*') || a.permissions.includes(`cronogramas:${acao}`)
  if (!a.tenantId || !permitido) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}

export interface LinhaDivergencia {
  documentoId: string; pastaId: string | null; disciplina: string; numero: string; tema: string
  planilha: number; real: number; total: number; paginaInicial: number
  difPct: number // (real − planilha) ÷ planilha × 100
  impactoMin: number // minutos do PDFull com as páginas reais − com as da planilha (ritmo padrão; positivo = a aula é mais longa)
}
export interface PaginaDivergencia {
  ok: boolean; error?: string
  linhas: LinhaDivergencia[]; total: number; pagina: number; porPagina: number
  resumo: { comparadas: number; divergentes: number; semContagem: number; impactoTotalMin: number }
}

async function calcularDivergencias(tenantId: string): Promise<{ linhas: LinhaDivergencia[]; semContagem: number; comparadas: number }> {
  const svc = createAdminClient()
  const c = await carregarConteudoBancoBase(svc, tenantId) // catálogo-base (sem overlay do admin)
  const idx = c.modeloIdx ?? []
  const alvo: Array<{ i: number; docId: string; modelo: number }> = []
  c.AS.forEach((a, i) => { const doc = a[6]; const m = idx[i] ?? -1; if (doc && m >= 0) alvo.push({ i, docId: String(doc), modelo: m }) })
  if (!alvo.length) return { linhas: [], semContagem: 0, comparadas: 0 }
  // pasta/versão dos docs (projeção mínima, .in() em lotes de 80)
  const docs: DocParaPaginas[] = []
  for (let k = 0; k < alvo.length; k += 80) {
    const { data } = await svc.from('simulado_conteudo_documentos').select('id, pasta_id, versao_atual_id').eq('tenant_id', tenantId).in('id', alvo.slice(k, k + 80).map((x) => x.docId))
    docs.push(...((data || []) as DocParaPaginas[]))
  }
  const pag = await paginasEfetivasDocs(svc, tenantId, docs)
  const pasta = new Map(docs.map((d) => [d.id, d.pasta_id]))
  const linhas: LinhaDivergencia[] = []
  let semContagem = 0
  for (const x of alvo) {
    const m = CATALOGO_HTML.aulas[x.modelo]; const p = pag.get(x.docId); const plan = Number(m?.[3]) || 0
    if (!m || plan <= 0) continue
    if (!p?.efetivas) { semContagem++; continue }
    const a = c.AS[x.i]
    linhas.push({
      documentoId: x.docId, pastaId: pasta.get(x.docId) ?? null, disciplina: String(a[0]), numero: String(a[1] ?? ''), tema: String(a[2] ?? ''),
      planilha: plan, real: p.efetivas, total: p.total ?? p.efetivas, paginaInicial: p.inicio,
      difPct: Math.round(((p.efetivas - plan) / plan) * 1000) / 10, impactoMin: minPdf(p.efetivas) - minPdf(plan),
    })
  }
  return { linhas, semContagem, comparadas: linhas.length }
}

/** Lista paginada no servidor. `minPct` = só |diferença| ≥ X%. Ordena por maior |diferença|. Cache 2 min por plataforma. */
export async function listarDivergenciaPaginas(input: { pagina?: number; porPagina?: number; minPct?: number; q?: string } = {}): Promise<PaginaDivergencia> {
  const g = await acesso('view')
  const vazio = { linhas: [], total: 0, pagina: 1, porPagina: 25, resumo: { comparadas: 0, divergentes: 0, semContagem: 0, impactoTotalMin: 0 } }
  if (!g) return { ok: false, error: 'Sem permissão.', ...vazio }
  try {
    const base = await remember(`crono-pag-diverg:${g.tenantId}`, 120, () => calcularDivergencias(g.tenantId))
    const minPct = Math.max(0, Number(input.minPct) || 0)
    const q = String(input.q ?? '').trim().toLowerCase()
    const porPagina = Math.min(100, Math.max(5, Math.trunc(Number(input.porPagina)) || 25))
    let l = base.linhas.filter((x) => x.planilha !== x.real && Math.abs(x.difPct) >= minPct)
    const divergentes = l.length
    if (q) l = l.filter((x) => `${x.disciplina} ${x.numero} ${x.tema}`.toLowerCase().includes(q))
    l.sort((a, b) => Math.abs(b.difPct) - Math.abs(a.difPct) || a.disciplina.localeCompare(b.disciplina, 'pt-BR'))
    const pagina = Math.max(1, Math.min(Math.trunc(Number(input.pagina)) || 1, Math.max(1, Math.ceil(l.length / porPagina))))
    return {
      ok: true, linhas: l.slice((pagina - 1) * porPagina, pagina * porPagina), total: l.length, pagina, porPagina,
      resumo: { comparadas: base.comparadas, divergentes, semContagem: base.semContagem, impactoTotalMin: l.reduce((s, x) => s + x.impactoMin, 0) },
    }
  } catch (e) { return { ok: false, error: (e as Error)?.message || 'Falha ao calcular.', ...vazio } }
}

/** Recontar páginas de UM documento ou de TODOS os documentos (publicados) de uma pasta e subpastas. DOCX = conversão: lote limitado por chamada. */
export async function recontarPaginasAction(input: { documentoId?: string; pastaId?: string }): Promise<{ ok: boolean; error?: string; recontados: number; falhas: number; restantes: number }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.', recontados: 0, falhas: 0, restantes: 0 }
  const svc = createAdminClient()
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  let docs: Array<{ id: string; tipo_origem: string }> = []
  try {
    if (input.documentoId && UUID.test(input.documentoId)) {
      const { data } = await svc.from('simulado_conteudo_documentos').select('id, tipo_origem').eq('tenant_id', g.tenantId).eq('id', input.documentoId).eq('deletado', false)
      docs = (data || []) as typeof docs
    } else if (input.pastaId && UUID.test(input.pastaId)) {
      // subárvore da pasta (BFS, .in() em lotes de 80)
      const { data: ps } = await svc.from('simulado_pastas').select('id, pai_id').eq('tenant_id', g.tenantId).eq('folder_area', 'conteudo').eq('is_folder', true).limit(20000)
      const filhos = new Map<string, string[]>()
      for (const p of (ps || []) as Array<{ id: string; pai_id: string | null }>) if (p.pai_id) (filhos.get(p.pai_id) ?? filhos.set(p.pai_id, []).get(p.pai_id)!).push(p.id)
      const ids = [input.pastaId]; for (let k = 0; k < ids.length && ids.length < 5000; k++) ids.push(...(filhos.get(ids[k]) ?? []))
      for (let k = 0; k < ids.length; k += 80) {
        const { data } = await svc.from('simulado_conteudo_documentos').select('id, tipo_origem').eq('tenant_id', g.tenantId).eq('status', 'publicado').eq('deletado', false).in('tipo_origem', ['pdf', 'docx']).in('pasta_id', ids.slice(k, k + 80))
        docs.push(...((data || []) as typeof docs))
      }
    } else return { ok: false, error: 'Informe um documento ou uma pasta.', recontados: 0, falhas: 0, restantes: 0 }
  } catch (e) { return { ok: false, error: (e as Error)?.message || 'Falha ao listar documentos.', recontados: 0, falhas: 0, restantes: 0 } }

  const MAX_DOCX = 12, MAX_TOTAL = 150 // DOCX converte no OnlyOffice (caro): o resto vai no cron/na próxima chamada
  let docx = 0, recontados = 0, falhas = 0, restantes = 0
  for (const d of docs) {
    if (recontados + falhas >= MAX_TOTAL || (d.tipo_origem === 'docx' && docx >= MAX_DOCX)) { restantes++; continue }
    if (d.tipo_origem === 'docx') docx++
    const r = await sincronizarPaginasDocumento(svc, g.tenantId, d.id, { forcar: true, emitir: true })
    if (r.ok && r.paginas) recontados++; else falhas++
  }
  await invalidarCachesPaginas(g.tenantId)
  const { esquecer } = await import('@/lib/cache/relatorio-cache'); await esquecer(`crono-pag-diverg:${g.tenantId}`)
  await registrarAudit({ tenantId: g.tenantId, atorId: g.userId, entidade: 'simulado_conteudo_versoes', operacao: 'UPDATE', entidadeId: input.documentoId ?? input.pastaId ?? null, depois: { acao: 'recontar_paginas', recontados, falhas, restantes } } as never).catch(() => {})
  revalidatePath('/admin/cronogramas/adaptativo/catalogo/paginas')
  return { ok: true, recontados, falhas, restantes }
}
