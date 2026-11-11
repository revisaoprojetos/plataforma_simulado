import { NextRequest, NextResponse } from 'next/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { UUID_META_RE } from '@/lib/cronograma/meta-valida'
import { explicarSemDocumento, indexarBiblioteca, materialDaMeta, resolverDocumentoMeta } from '@/lib/cronograma/conteudo-meta'
import { docsBibliotecaCache, invalidarConteudoCronograma, lerVinculos, tabelaAusente } from '@/lib/cronograma/meta-extras-server'

// Vínculo META -> DOCUMENTO da Biblioteca dos cronogramas Revisão (admin › Cronogramas › metas).
//  GET  ?cronogramaId=<uuid>  -> { explicitos: {metaId: {docId, titulo, pagina}}, auto: {metaId: {docId, titulo}}, migrado }
//  POST { cronogramaId, metaId, documentoId | null, paginaIni?, aplicarIguais? } -> grava/remove o vínculo explícito
//       (aplicarIguais: estende às metas do MESMO cronograma com mesmo tipo + disciplina + aula).
// Rota de API (não server action). O seletor de documento é o <FilePicker> do Estúdio (aba Biblioteca).
export const dynamic = 'force-dynamic'

type MetaRow = { id: string; tipo: string; disciplina: string; aula: string | null; conteudo: string | null; chave?: string | null }
const T = 'simulado_cronograma_meta_conteudo'
const resp = (b: Record<string, unknown>, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

async function guarda(perm: string) {
  if (!(await checkPermission(perm))) return null
  const a = await getCurrentAccess()
  return a.tenantId ? { tenantId: a.tenantId, atorId: a.userId ?? null } : null
}

async function carregarMetas(svc: ReturnType<typeof createAdminClient>, tenantId: string, cronogramaId: string): Promise<MetaRow[]> {
  return fetchAll<MetaRow>(() => svc.from('simulado_cronograma_metas').select('id, tipo, disciplina, aula, conteudo, chave')
    .eq('tenant_id', tenantId).eq('cronograma_id', cronogramaId).order('id') as never)
    .catch(() => fetchAll<MetaRow>(() => svc.from('simulado_cronograma_metas').select('id, tipo, disciplina, aula, conteudo')
      .eq('tenant_id', tenantId).eq('cronograma_id', cronogramaId).order('id') as never))
}

export async function GET(req: NextRequest) {
  const g = await guarda('cronogramas:view')
  if (!g) return resp({ ok: false, message: 'Sem permissão.' }, 403)
  const cronogramaId = req.nextUrl.searchParams.get('cronogramaId') ?? ''
  if (!UUID_META_RE.test(cronogramaId)) return resp({ ok: false, message: 'Cronograma inválido.' }, 400)
  const svc = createAdminClient()
  const [metas, docs, vinculos] = await Promise.all([
    carregarMetas(svc, g.tenantId, cronogramaId),
    docsBibliotecaCache(svc, g.tenantId).catch(() => []),
    lerVinculos(svc, g.tenantId, cronogramaId),
  ])
  const titulo = new Map(docs.map((d) => [d.id, d.titulo]))
  // vínculo explícito pode apontar doc fora das pastas de disciplina: busca o título dos que faltam (lotes de 80)
  const faltam = [...new Set(vinculos.map((v) => v.documento_id).filter((id) => !titulo.has(id)))]
  if (faltam.length) {
    const rows = await fetchAllByIn<{ id: string; titulo: string }>(faltam, (c) =>
      svc.from('simulado_conteudo_documentos').select('id, titulo').eq('tenant_id', g.tenantId).in('id', c).order('id') as never).catch(() => [])
    for (const r of rows) titulo.set(r.id, r.titulo)
  }
  const ids = new Set(metas.map((m) => m.id))
  const explicitos: Record<string, { docId: string; titulo: string; pagina: number | null }> = {}
  for (const v of vinculos) if (ids.has(v.meta_id)) explicitos[v.meta_id] = { docId: v.documento_id, titulo: titulo.get(v.documento_id) ?? 'Documento', pagina: v.pagina_ini ?? null }
  const indice = indexarBiblioteca(docs)
  const explicito = (id: string) => !!explicitos[id]
  const auto: Record<string, { docId: string; titulo: string }> = {}
  // Metas que deveriam ter documento (PDFull/Revisão/LegProc) e não têm, com o MOTIVO — alimenta "Metas sem material".
  const sem: Record<string, string> = {}
  const cobertura: Record<string, { total: number; com: number }> = {}
  for (const m of metas) {
    const meta = { id: m.id, tipo: m.tipo, disciplinas: [m.disciplina], aula: m.aula, conteudo: m.conteudo }
    const r = explicito(m.id) ? null : resolverDocumentoMeta(meta, indice, null)
    if (!explicito(m.id) && r) auto[m.id] = { docId: r.docId, titulo: titulo.get(r.docId) ?? 'Documento' }
    const motivo = explicito(m.id) || r ? null : explicarSemDocumento(meta, indice)
    if (materialDaMeta(m.tipo)) {
      const c = (cobertura[m.tipo] ??= { total: 0, com: 0 })
      c.total++
      if (explicito(m.id) || r) c.com++
    }
    if (motivo && motivo !== 'tipo_sem_documento') sem[m.id] = motivo
  }
  // `migrado`: a tabela de vínculos existe? (sem ela só vale o automático)
  const { error } = await svc.from(T).select('id').limit(1)
  return resp({ ok: true, explicitos, auto, sem, cobertura, migrado: !tabelaAusente(error) })
}

export async function POST(req: NextRequest) {
  const g = await guarda('cronogramas:update')
  if (!g) return resp({ ok: false, message: 'Sem permissão.' }, 403)
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return resp({ ok: false, message: 'Requisição inválida.' }, 400) }
  const cronogramaId = String(b.cronogramaId ?? ''), metaId = String(b.metaId ?? '')
  const documentoId = b.documentoId == null || b.documentoId === '' ? null : String(b.documentoId)
  if (!UUID_META_RE.test(cronogramaId) || !UUID_META_RE.test(metaId) || (documentoId && !UUID_META_RE.test(documentoId))) return resp({ ok: false, message: 'Dados inválidos.' }, 400)
  const pg = b.paginaIni == null || b.paginaIni === '' ? null : Math.trunc(Number(b.paginaIni))
  if (pg !== null && (!Number.isFinite(pg) || pg < 1 || pg > 5000)) return resp({ ok: false, message: 'Página inicial inválida.' }, 400)

  const svc = createAdminClient()
  const { data: cr } = await svc.from('simulado_cronogramas').select('id').eq('id', cronogramaId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!cr) return resp({ ok: false, message: 'Cronograma não encontrado.' }, 404)
  const metas = await carregarMetas(svc, g.tenantId, cronogramaId)
  const alvo = metas.find((m) => m.id === metaId)
  if (!alvo) return resp({ ok: false, message: 'Meta não pertence a este cronograma.' }, 400)

  if (documentoId) {
    const { data: d } = await svc.from('simulado_conteudo_documentos').select('id, categoria, deletado')
      .eq('tenant_id', g.tenantId).eq('id', documentoId).maybeSingle()
    const dd = d as { categoria?: string; deletado?: boolean } | null
    if (!dd || dd.deletado || !['conteudo', 'jurisclub'].includes(String(dd.categoria))) return resp({ ok: false, message: 'Documento da Biblioteca não encontrado.' }, 400)
  }

  const norm = (s: string | null) => String(s ?? '').trim().toLowerCase()
  const afetadas = b.aplicarIguais === true
    ? metas.filter((m) => m.tipo === alvo.tipo && norm(m.disciplina) === norm(alvo.disciplina) && norm(m.aula) === norm(alvo.aula))
    : [alvo]

  if (!documentoId) {
    const { error } = await svc.from(T).delete().eq('tenant_id', g.tenantId).eq('cronograma_id', cronogramaId).in('meta_id', afetadas.slice(0, 80).map((m) => m.id))
    if (error) return resp({ ok: false, message: tabelaAusente(error) ? 'Aplique a atualização do banco para usar vínculos explícitos.' : 'Não foi possível remover.' }, tabelaAusente(error) ? 503 : 500)
  } else {
    const agora = new Date().toISOString()
    const linhas = afetadas.slice(0, 80).map((m) => ({
      tenant_id: g.tenantId, cronograma_id: cronogramaId, meta_id: m.id, chave_meta: m.chave ?? null,
      documento_id: documentoId, pagina_ini: pg, criado_por: g.atorId, atualizado_em: agora,
    }))
    const { error } = await svc.from(T).upsert(linhas, { onConflict: 'cronograma_id,meta_id' })
    if (error) return resp({ ok: false, message: tabelaAusente(error) ? 'Aplique a atualização do banco para usar vínculos explícitos.' : 'Não foi possível salvar.' }, tabelaAusente(error) ? 503 : 500)
  }
  void invalidarConteudoCronograma(g.tenantId, cronogramaId).catch(() => {}) // conteúdo por meta no cronograma do aluno
  await registrarAudit({
    operacao: documentoId ? 'UPDATE' : 'DELETE', entidade: T, entidadeId: metaId,
    depois: { cronograma_id: cronogramaId, documento_id: documentoId, metas: afetadas.length, pagina_ini: pg }, atorTipo: 'admin', atorId: g.atorId ?? undefined, tenantId: g.tenantId,
  })
  return resp({ ok: true, afetadas: afetadas.length })
}
