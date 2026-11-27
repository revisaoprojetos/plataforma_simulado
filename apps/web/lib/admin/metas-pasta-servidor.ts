// Leitura servidor de "Disciplinas e metas" (Cronograma › Adaptativo › Conteúdo). Módulo NÃO-'use server': usado pelas
// rotas GET (app/api/admin/revisao/cronograma/metas-pasta/*) e pelas actions de gravação. SQL agregado, sem N+1.

import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { sqlQuery } from '@/lib/data/sql'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { documentosEmUso } from '@/lib/conteudo/dependencias-documento'
import { calcularHeranca, descendentes, type PastaHeranca } from '@/lib/admin/metas-pasta-heranca'
import { listarCatalogoTipos } from '@/lib/cronograma/tipos-conteudo-server'
import { SLUGS_SISTEMA } from '@/lib/cronograma/tipos-conteudo-tipos'
import { listarDisciplinasCfg } from '@/lib/revisao/cronograma'
import { agregarMatriz } from '@/lib/admin/metas-pasta-matriz'
import type { ClasseDisc, DocMetaPasta, MatrizDisciplinas, NoMetaPasta } from '@/lib/admin/metas-pasta-tipos'

export const PAGINA_DOCS = 50
const CLASSES = ['essencial', 'complementar', 'especifica']
const T_PM = 'simulado_cronograma_adaptativo_plano_meta'
const T_PLANO = 'simulado_cronograma_adaptativo_plano'

export type Svc = ReturnType<typeof createAdminClient>
export type PastaRow = { id: string; nome: string; pai_id: string | null; ordem: number | null; disciplina_id: string | null; cronograma_tipo_material: string | null }

/** Sessão + permissão (cronogramas:view / update). `null` = sem acesso. */
export async function guardCronograma(perm: 'cronogramas:view' | 'cronogramas:update') {
  if (!(await checkPermission(perm))) return null
  const a = await getCurrentAccess()
  if (!a.tenantId) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}

/** Slugs aceitos = catálogo do tenant (sistema + personalizados); tolerante a falha (só os de sistema). */
export async function slugsDoCatalogo(svc: Svc, tenantId: string): Promise<Set<string>> {
  try { return new Set((await listarCatalogoTipos(svc, tenantId)).map((t) => t.slug)) } catch { return new Set(SLUGS_SISTEMA) }
}

/** Pastas da categoria conteúdo (não deletadas) do tenant; tolera `cronograma_tipo_material`/`ordem` ausentes. */
export async function lerPastas(svc: Svc, tenantId: string): Promise<PastaRow[]> {
  const sel = (cols: string) => () => svc.from('simulado_pastas').select(cols)
    .eq('tenant_id', tenantId).eq('folder_area', 'conteudo').eq('deletado', false).order('id', { ascending: true }) as never
  try { return await fetchAll<PastaRow>(sel('id, nome, pai_id, ordem, disciplina_id, cronograma_tipo_material')) }
  catch {
    const r = await fetchAll<Omit<PastaRow, 'ordem' | 'cronograma_tipo_material'>>(sel('id, nome, pai_id, disciplina_id'))
    return r.map((x) => ({ ...x, ordem: 0, cronograma_tipo_material: null }))
  }
}

// A contagem de planos ativos por pasta varre ~1,6 mi de metas (≈ 11 s medidos em produção). Por isso: cache de 10 min
// (a estrutura de pastas/tipos não altera quem tem plano) + dedupe das chamadas simultâneas (as telas disparavam a mesma
// conta em paralelo e disputavam as 5 conexões do pool, estourando o limite de 20 s da UI).
const TTL_PLANOS_PASTA_S = 600
const emVooPlanos = new Map<string, Promise<Map<string, number>>>()

/** Planos ativos (não arquivados) por pasta RAIZ, contando a subárvore. Cacheado (10 min) e sem execuções duplicadas. */
export async function planosPorPasta(svc: Svc, tenantId: string, pastas: PastaRow[]): Promise<Map<string, number>> {
  const chave = `crono-metas:planospasta:${tenantId}`
  const voo = emVooPlanos.get(chave)
  if (voo) return voo
  const p = (async () => {
    const { remember } = await import('@/lib/cache/relatorio-cache')
    const pares = await remember<[string, number][]>(chave, TTL_PLANOS_PASTA_S, async () => [...(await calcularPlanosPorPasta(svc, tenantId, pastas))])
    return new Map<string, number>(pares)
  })().finally(() => { emVooPlanos.delete(chave) })
  emVooPlanos.set(chave, p)
  return p
}

async function calcularPlanosPorPasta(svc: Svc, tenantId: string, pastas: PastaRow[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const rows = await sqlQuery<{ id: string; n: number }>(
    `WITH RECURSIVE cl AS (
       SELECT id AS raiz, id AS cur FROM simulado_pastas WHERE tenant_id = $1 AND folder_area = 'conteudo' AND deletado = false
       UNION
       SELECT cl.raiz, p.id FROM cl JOIN simulado_pastas p ON p.pai_id = cl.cur AND p.tenant_id = $1 AND p.deletado = false)
     SELECT cl.raiz::text AS id, count(DISTINCT pm.plano_id)::int AS n
       FROM cl JOIN simulado_conteudo_documentos d ON d.pasta_id = cl.cur AND d.tenant_id = $1 AND d.deletado = false
       JOIN ${T_PM} pm ON pm.documento_id = d.id AND pm.tenant_id = $1
       JOIN ${T_PLANO} pl ON pl.id = pm.plano_id AND pl.arquivada = false
      GROUP BY 1`, [tenantId])
  if (rows) { for (const r of rows) out.set(r.id, Number(r.n)); return out }
  // Fallback: docs -> metas -> planos ativos, agregando em memória.
  const docs = await fetchAll<{ id: string; pasta_id: string }>(() =>
    svc.from('simulado_conteudo_documentos').select('id, pasta_id').eq('tenant_id', tenantId).eq('deletado', false).not('pasta_id', 'is', null).order('id') as never)
  const pms = await fetchAllByIn<{ id: string; documento_id: string; plano_id: string }>(docs.map((d) => d.id), (c) =>
    svc.from(T_PM).select('id, documento_id, plano_id').eq('tenant_id', tenantId).in('documento_id', c).order('id') as never)
  const planoIds = [...new Set(pms.map((m) => m.plano_id))]
  const ativos = new Set((await fetchAllByIn<{ id: string }>(planoIds, (c) =>
    svc.from(T_PLANO).select('id').eq('tenant_id', tenantId).eq('arquivada', false).in('id', c).order('id') as never)).map((r) => r.id))
  const planosDoc = new Map<string, Set<string>>()
  for (const m of pms) if (ativos.has(m.plano_id)) (planosDoc.get(m.documento_id) ?? planosDoc.set(m.documento_id, new Set()).get(m.documento_id)!).add(m.plano_id)
  const pastaDoc = new Map(docs.map((d) => [d.id, d.pasta_id]))
  const porPasta = new Map<string, Set<string>>()
  for (const [docId, set] of planosDoc) {
    const pid = pastaDoc.get(docId); if (!pid) continue
    const s = porPasta.get(pid) ?? porPasta.set(pid, new Set()).get(pid)!
    set.forEach((x) => s.add(x))
  }
  const pai = new Map(pastas.map((p) => [p.id, p.pai_id]))
  const acum = new Map<string, Set<string>>()
  for (const [pid, set] of porPasta) {
    const visto = new Set<string>(); let cur: string | null = pid
    while (cur && !visto.has(cur)) { visto.add(cur); const s = acum.get(cur) ?? acum.set(cur, new Set()).get(cur)!; set.forEach((x) => s.add(x)); cur = pai.get(cur) ?? null }
  }
  for (const [k, s] of acum) out.set(k, s.size)
  return out
}

/** Documentos não deletados DIRETOS por pasta (1 GROUP BY; fallback PostgREST paginado). */
export async function docsDiretosPorPasta(svc: Svc, tenantId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const rows = await sqlQuery<{ id: string; n: number }>(
    `SELECT pasta_id::text AS id, count(*)::int AS n FROM simulado_conteudo_documentos
      WHERE tenant_id = $1 AND deletado = false AND pasta_id IS NOT NULL GROUP BY 1`, [tenantId])
  if (rows) { for (const r of rows) out.set(r.id, Number(r.n)); return out }
  const docs = await fetchAll<{ id: string; pasta_id: string }>(() =>
    svc.from('simulado_conteudo_documentos').select('id, pasta_id').eq('tenant_id', tenantId).eq('deletado', false).not('pasta_id', 'is', null).order('id') as never)
  for (const d of docs) out.set(d.pasta_id, (out.get(d.pasta_id) ?? 0) + 1)
  return out
}

/** Docs não deletados: diretos e total (subárvore) por pasta. */
async function contagemDocs(svc: Svc, tenantId: string, pastas: PastaRow[]): Promise<Map<string, { diretos: number; total: number }>> {
  const out = new Map<string, { diretos: number; total: number }>()
  const rows = await sqlQuery<{ id: string; diretos: number; total: number }>(
    `WITH RECURSIVE cl AS (
       SELECT id AS raiz, id AS cur FROM simulado_pastas WHERE tenant_id = $1 AND folder_area = 'conteudo' AND deletado = false
       UNION
       SELECT cl.raiz, p.id FROM cl JOIN simulado_pastas p ON p.pai_id = cl.cur AND p.tenant_id = $1 AND p.deletado = false)
     SELECT cl.raiz::text AS id, (count(*) FILTER (WHERE cl.cur = cl.raiz))::int AS diretos, count(*)::int AS total
       FROM cl JOIN simulado_conteudo_documentos d ON d.pasta_id = cl.cur AND d.tenant_id = $1 AND d.deletado = false
      GROUP BY 1`, [tenantId])
  if (rows) { for (const r of rows) out.set(r.id, { diretos: Number(r.diretos), total: Number(r.total) }); return out }
  const diretos = await docsDiretosPorPasta(svc, tenantId)
  const pai = new Map(pastas.map((p) => [p.id, p.pai_id]))
  for (const [pasta, n] of diretos) {
    const visto = new Set<string>(); let cur: string | null = pasta; let primeiro = true
    while (cur && !visto.has(cur)) {
      visto.add(cur)
      const c = out.get(cur) ?? { diretos: 0, total: 0 }; c.total += n; if (primeiro) c.diretos += n
      out.set(cur, c); primeiro = false; cur = pai.get(cur) ?? null
    }
  }
  return out
}

/** Árvore plana de pastas com disciplina/tipo/contagens (rota GET .../pastas). */
export async function listarNosMetasPasta(tenantId: string): Promise<NoMetaPasta[]> {
  const svc = createAdminClient()
  const [pastas, slugs, discs] = await Promise.all([
    lerPastas(svc, tenantId),
    slugsDoCatalogo(svc, tenantId),
    fetchAll<{ id: string; nome: string; classificacao: string | null }>(() =>
      svc.from('simulado_disciplinas').select('id, nome, classificacao').eq('tenant_id', tenantId).order('id') as never),
  ])
  const [docs, planos] = await Promise.all([contagemDocs(svc, tenantId, pastas), planosPorPasta(svc, tenantId, pastas)])
  const disc = new Map(discs.map((d) => [d.id, d]))
  const her = calcularHeranca(pastas.map((p): PastaHeranca => ({ id: p.id, paiId: p.pai_id, disciplinaId: p.disciplina_id, tipoMaterial: p.cronograma_tipo_material })), slugs)
  return pastas.map((p) => {
    const h = her.get(p.id)
    const d = p.disciplina_id ? disc.get(p.disciplina_id) : undefined
    const de = h?.disciplinaId ? disc.get(h.disciplinaId) : undefined
    const c = docs.get(p.id)
    return {
      id: p.id, nome: p.nome, paiId: p.pai_id, ordem: p.ordem ?? 0,
      disciplinaId: p.disciplina_id,
      classe: d && CLASSES.includes(String(d.classificacao)) ? (d.classificacao as ClasseDisc) : null,
      tipoMaterial: p.cronograma_tipo_material && slugs.has(p.cronograma_tipo_material) ? p.cronograma_tipo_material : null,
      tipoEfetivo: h?.tipoEfetivo ?? 'pdfull',
      disciplinaEfetiva: de ? { id: de.id, nome: de.nome } : null,
      nDocsDiretos: c?.diretos ?? 0, nDocsTotal: c?.total ?? 0,
      planosAtivos: planos.get(p.id) ?? 0,
    }
  })
}

/** Documentos de uma pasta (paginados de 50, busca por título, opcional subárvore). */
export async function listarDocsDaPasta(
  tenantId: string, pastaId: string, opts: { page?: number; q?: string; sub?: boolean },
): Promise<{ ok: boolean; error?: string; docs?: DocMetaPasta[]; total?: number }> {
  const svc = createAdminClient()
  const page = Math.max(1, Math.floor(opts.page ?? 1))
  const q = (opts.q ?? '').trim().slice(0, 80)
  const [pastas, slugs] = await Promise.all([lerPastas(svc, tenantId), slugsDoCatalogo(svc, tenantId)])
  if (!pastas.some((p) => p.id === pastaId)) return { ok: false, error: 'Pasta não encontrada.' }
  const her = calcularHeranca(pastas.map((p) => ({ id: p.id, paiId: p.pai_id, disciplinaId: p.disciplina_id, tipoMaterial: p.cronograma_tipo_material })), slugs)
  const ids = [pastaId, ...(opts.sub ? descendentes(pastas.map((p) => ({ id: p.id, paiId: p.pai_id })), pastaId) : [])]

  type Linha = { id: string; titulo: string; status: string; pasta_id: string }
  let linhas: Linha[] = []; let total = 0
  const de = (page - 1) * PAGINA_DOCS
  const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`
  const rows = await sqlQuery<Linha & { total: number }>(
    `SELECT id::text, titulo, status, pasta_id::text, count(*) OVER()::int AS total FROM simulado_conteudo_documentos
      WHERE tenant_id = $1 AND deletado = false AND pasta_id = ANY($2::uuid[]) AND ($3 = '' OR titulo ILIKE $4)
      ORDER BY titulo, id LIMIT ${PAGINA_DOCS} OFFSET ${de}`, [tenantId, ids, q, like])
  if (rows) { linhas = rows; total = rows[0] ? Number(rows[0].total) : 0 }
  else {
    // Fallback PostgREST: .range()+count (ids em chunk de 80 só quando sub; senão uma pasta).
    if (ids.length > 80) return { ok: false, error: 'Subárvore grande demais sem acesso SQL direto.' }
    let qb = svc.from('simulado_conteudo_documentos').select('id, titulo, status, pasta_id', { count: 'exact' })
      .eq('tenant_id', tenantId).eq('deletado', false).in('pasta_id', ids)
    if (q) qb = qb.ilike('titulo', like)
    const { data, count, error } = await qb.order('titulo').order('id').range(de, de + PAGINA_DOCS - 1)
    if (error) return { ok: false, error: error.message }
    linhas = (data ?? []) as Linha[]; total = count ?? 0
  }
  let uso = new Map<string, number>()
  try { uso = await documentosEmUso(svc, tenantId, linhas.map((l) => l.id)) } catch { /* sem contagem: 0 */ }
  const docs: DocMetaPasta[] = linhas.map((l) => ({
    id: l.id, titulo: l.titulo, status: l.status, tipoEfetivo: her.get(l.pasta_id)?.tipoEfetivo ?? 'pdfull', planosAtivos: uso.get(l.id) ?? 0,
  }))
  return { ok: true, docs, total }
}

/** Matriz: TODAS as disciplinas do cronograma ↔ pastas ↔ documentos por tipo (rota GET .../matriz). Tudo em paralelo, sem N+1. */
export async function montarMatrizDisciplinas(tenantId: string): Promise<MatrizDisciplinas> {
  const svc = createAdminClient()
  const [cfg, pastas, slugs, discs, docsDiretos] = await Promise.all([
    listarDisciplinasCfg(svc, tenantId),
    lerPastas(svc, tenantId),
    slugsDoCatalogo(svc, tenantId),
    fetchAll<{ id: string; nome: string; classificacao: string | null }>(() =>
      svc.from('simulado_disciplinas').select('id, nome, classificacao').eq('tenant_id', tenantId).order('id') as never),
    docsDiretosPorPasta(svc, tenantId),
  ])
  // A contagem de planos é só informativa na Matriz: se não vier em ~4 s (ou falhar por statement timeout), a tela abre
  // com 0 e a conta segue em segundo plano preenchendo o cache (próxima abertura já vem completa). As ações que PRECISAM
  // do número exato (confirmação de impacto) continuam usando planosPorPasta direto.
  const calculo = planosPorPasta(svc, tenantId, pastas)
  calculo.catch(() => {})
  const planos = await Promise.race([
    calculo.catch(() => new Map<string, number>()),
    new Promise<Map<string, number>>((res) => setTimeout(() => res(new Map()), 4000)),
  ])
  const linhas = agregarMatriz({
    cfg: cfg.lista, disciplinas: discs, slugs, docsDiretos, planos,
    pastas: pastas.map((p) => ({ id: p.id, nome: p.nome, paiId: p.pai_id, disciplinaId: p.disciplina_id, tipoMaterial: p.cronograma_tipo_material })),
  })
  return { linhas, migrado: cfg.migrado, tiposMigrado: cfg.tiposMigrado }
}
