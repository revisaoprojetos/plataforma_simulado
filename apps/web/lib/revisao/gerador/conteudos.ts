import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { chaveLink } from '@/lib/cronograma/formato-meta'

// Sub-aba "Conteúdos" do Gerador (cronograma padrão): leitura paginada no servidor de
// (a) conjuntos de aulas do Banco de Conteúdos e (b) links de aula. Só LEITURA — as mutações
// continuam nas actions existentes (app/admin/cronogramas/conteudos|links/actions.ts).

const AREA_PASTA = 'cronograma_conteudo'
const T_CONJ = 'simulado_cronograma_conjuntos'
const T_AULAS = 'simulado_cronograma_conjunto_aulas'
const T_AQ = 'simulado_cronograma_conjunto_aula_questoes'
const T_LINKS = 'simulado_cronograma_links'
const T_ALINKS = 'simulado_cronograma_aula_links'
const T_PLAT = 'simulado_cronograma_plataformas'
const T_METAS = 'simulado_cronograma_metas'

/** Mesma normalização de "dia de aula" do banco de conteúdos (1, 01 → "1"). */
const chaveAula = (a: string | null) => {
  const t = (a ?? '').trim()
  if (!t) return ''
  return /^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase()
}
/** Texto livre seguro para dentro de `.or(...ilike...)` do PostgREST. */
const limpaQ = (q: string) => q.replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })

export type ConjuntoLinha = {
  id: string; nome: string; disciplina: string; descricao: string | null; cor: string | null; pasta_id: string | null
  aulas: number; aulasLegproc: number; questoes: number
}
export type PastaLinha = { id: string; nome: string; pai_id: string | null }

export interface ParamsConjuntos {
  pasta: string | null; q?: string; legproc?: boolean; ord?: string; dir: 'asc' | 'desc'; pagina: number; porPagina: number
}
export interface ResConjuntos {
  linhas: ConjuntoLinha[]; total: number; pagina: number; porPagina: number
  pastas: PastaLinha[]; todasPastas: { id: string; nome: string }[]; trilha: { id: string; nome: string }[]
}

export async function listarConjuntosPag(svc: SupabaseClient, tenantId: string, p: ParamsConjuntos): Promise<ResConjuntos> {
  const q = limpaQ(p.q ?? '')
  const pastasRaw = await fetchAll<PastaLinha>(() =>
    svc.from('simulado_pastas').select('id, nome, pai_id').eq('tenant_id', tenantId).eq('is_folder', true).eq('folder_area', AREA_PASTA).order('nome').order('id') as any,
  ).catch(() => [] as PastaLinha[])
  const porId = new Map(pastasRaw.map((x) => [x.id, x]))
  const pastaValida = p.pasta && porId.has(p.pasta) ? p.pasta : null
  const caminho = (id: string) => {
    const partes: string[] = []; const visto = new Set<string>(); let a = porId.get(id)
    while (a && !visto.has(a.id)) { visto.add(a.id); partes.unshift(a.nome); a = a.pai_id ? porId.get(a.pai_id) : undefined }
    return partes.join(' / ')
  }
  const trilha: { id: string; nome: string }[] = []
  {
    const visto = new Set<string>(); let a = pastaValida ? porId.get(pastaValida) : undefined
    while (a && !visto.has(a.id)) { visto.add(a.id); trilha.unshift({ id: a.id, nome: a.nome }); a = a.pai_id ? porId.get(a.pai_id) : undefined }
  }

  const sel = 'id, nome, disciplina, descricao, cor, pasta_id, ordem'
  const colOrd = p.ord === 'nome' ? 'nome' : p.ord === 'disciplina' ? 'disciplina' : null
  const asc = p.dir !== 'desc'
  // Busca vale para TODAS as pastas; sem busca, lista o nível da pasta atual.
  const filtroNivel = (b: any) => {
    if (!q) return pastaValida ? b.eq('pasta_id', pastaValida) : b.is('pasta_id', null)
    return b.or(`nome.ilike.%${q}%,disciplina.ilike.%${q}%`)
  }

  let linhasRaw: any[] = []
  let total = 0
  if (p.legproc) {
    // Conjuntos com ao menos 1 aula LegProc: junta os ids e pagina em memória (poucos registros).
    const aulasLeg = await fetchAll<{ conjunto_id: string }>(() => svc.from(T_AULAS).select('conjunto_id').eq('tenant_id', tenantId).eq('tipo', 'legproc').order('id') as any)
    const ids = [...new Set(aulasLeg.map((a) => a.conjunto_id))]
    const todos = ids.length
      ? await fetchAllByIn<any>(ids, (chunk) => filtroNivel(svc.from(T_CONJ).select(sel).eq('tenant_id', tenantId).eq('deletado', false).in('id', chunk)).order('id') as any)
      : []
    const f = asc ? 1 : -1
    todos.sort((a, b) => (colOrd ? f * cmp(a[colOrd] ?? '', b[colOrd] ?? '') : (a.ordem ?? 0) - (b.ordem ?? 0) || cmp(a.nome, b.nome)))
    total = todos.length
    linhasRaw = todos.slice((p.pagina - 1) * p.porPagina, p.pagina * p.porPagina)
  } else {
    let b = filtroNivel(svc.from(T_CONJ).select(sel, { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false))
    b = colOrd ? b.order(colOrd, { ascending: asc }) : b.order('ordem').order('nome')
    const { data, count, error } = await b.order('id').range((p.pagina - 1) * p.porPagina, p.pagina * p.porPagina - 1)
    if (error) throw error
    linhasRaw = data ?? []; total = count ?? 0
  }

  // Contagens só dos conjuntos desta página.
  const ids = linhasRaw.map((c) => c.id as string)
  const dias = new Map<string, Set<string>>(), leg = new Map<string, Set<string>>(), quest = new Map<string, number>()
  if (ids.length) {
    const aulas = await fetchAllByIn<any>(ids, (chunk) => svc.from(T_AULAS).select('id, conjunto_id, tipo, aula').eq('tenant_id', tenantId).in('conjunto_id', chunk).order('id') as any)
    for (const a of aulas) {
      const k = chaveAula(a.aula); if (!k) continue
      if (!dias.has(a.conjunto_id)) dias.set(a.conjunto_id, new Set())
      dias.get(a.conjunto_id)!.add(k)
      if (a.tipo === 'legproc') { if (!leg.has(a.conjunto_id)) leg.set(a.conjunto_id, new Set()); leg.get(a.conjunto_id)!.add(k) }
    }
    if (aulas.length) {
      const { count } = await svc.from(T_AQ).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      if ((count ?? 0) > 0) {
        const dono = new Map<string, string>(aulas.map((a) => [a.id, a.conjunto_id]))
        const vs = await fetchAllByIn<any>(aulas.map((a) => a.id), (chunk) => svc.from(T_AQ).select('aula_id').eq('tenant_id', tenantId).in('aula_id', chunk).order('id') as any, { chunk: 200 })
        for (const v of vs) { const c = dono.get(v.aula_id); if (c) quest.set(c, (quest.get(c) ?? 0) + 1) }
      }
    }
  }
  const linhas: ConjuntoLinha[] = linhasRaw.map((c) => ({
    id: c.id, nome: c.nome, disciplina: c.disciplina ?? '', descricao: c.descricao ?? null, cor: c.cor ?? null, pasta_id: c.pasta_id ?? null,
    aulas: dias.get(c.id)?.size ?? 0, aulasLegproc: leg.get(c.id)?.size ?? 0, questoes: quest.get(c.id) ?? 0,
  }))
  return {
    linhas, total, pagina: p.pagina, porPagina: p.porPagina,
    pastas: q ? [] : pastasRaw.filter((x) => (x.pai_id ?? null) === pastaValida),
    todasPastas: pastasRaw.map((x) => ({ id: x.id, nome: caminho(x.id) })).sort((a, b) => cmp(a.nome, b.nome)),
    trilha,
  }
}

// ───────────────────────────── links de aula ─────────────────────────────

export type LinkLinha = { id: string; disciplina: string; aula: string; tema: string | null; urls: { plataforma_id: string; url: string }[]; usos: number }
export type PlataformaLinha = { id: string; nome: string; ativo: boolean; cor: string | null; usos: number }
export type PendenteLinha = { disciplina: string; aula: string; metas: number }

export interface ParamsLinks { q?: string; situ?: 'sem' | 'com' | 'pend'; ord?: string; dir: 'asc' | 'desc'; pagina: number; porPagina: number }
export interface ResLinks {
  modo: 'links' | 'pend'; linhas: LinkLinha[]; pendentes: PendenteLinha[]; total: number; pagina: number; porPagina: number
  plataformas: PlataformaLinha[]; totalLinks: number
}

export async function listarLinksPag(svc: SupabaseClient, tenantId: string, p: ParamsLinks): Promise<ResLinks> {
  const q = limpaQ(p.q ?? '')
  const [plats, usosPlat, { count: totalLinks }] = await Promise.all([
    fetchAll<any>(() => svc.from(T_PLAT).select('id, nome, cor, ordem, ativo').eq('tenant_id', tenantId).order('ordem').order('nome').order('id') as any),
    fetchAll<{ plataforma_id: string }>(() => svc.from(T_ALINKS).select('plataforma_id').eq('tenant_id', tenantId).order('id') as any),
    svc.from(T_LINKS).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ])
  const uso = new Map<string, number>()
  for (const u of usosPlat) uso.set(u.plataforma_id, (uso.get(u.plataforma_id) ?? 0) + 1)
  const plataformas: PlataformaLinha[] = plats.map((x) => ({ id: x.id, nome: x.nome, ativo: x.ativo, cor: x.cor ?? null, usos: uso.get(x.id) ?? 0 }))
  const resBase = { plataformas, totalLinks: totalLinks ?? 0, pagina: p.pagina, porPagina: p.porPagina }
  const asc = p.dir !== 'desc'
  const filtroQ = (b: any) => (q ? b.or(`disciplina.ilike.%${q}%,aula.ilike.%${q}%,tema.ilike.%${q}%`) : b)

  // Pendências: pares (disciplina, aula) citados por metas de questões que ainda não têm link.
  if (p.situ === 'pend') {
    const [links, metas] = await Promise.all([
      fetchAll<{ disciplina: string; aula: string }>(() => svc.from(T_LINKS).select('disciplina, aula').eq('tenant_id', tenantId).order('id') as any),
      fetchAll<{ disciplina: string; aula: string | null }>(() => svc.from(T_METAS).select('disciplina, aula').eq('tenant_id', tenantId).eq('tipo', 'quest').not('aula', 'is', null).order('id') as any),
    ])
    const tem = new Set<string>()
    for (const l of links) { const k = chaveLink(l.disciplina, l.aula); if (k) tem.add(k) }
    const cont = new Map<string, PendenteLinha>()
    for (const m of metas) {
      const k = chaveLink(m.disciplina, m.aula); if (!k || tem.has(k)) continue
      const e = cont.get(k)
      if (e) e.metas++; else cont.set(k, { disciplina: m.disciplina, aula: m.aula as string, metas: 1 })
    }
    let lista = [...cont.values()]
    const t = q.toLowerCase()
    if (t) lista = lista.filter((x) => x.disciplina.toLowerCase().includes(t) || x.aula.toLowerCase().includes(t))
    const f = asc ? 1 : -1
    lista.sort((a, b) => p.ord === 'metas' ? f * (a.metas - b.metas) : p.ord === 'aula' ? f * cmp(a.aula, b.aula) : p.ord === 'disciplina' ? f * cmp(a.disciplina, b.disciplina) : b.metas - a.metas)
    return { ...resBase, modo: 'pend', linhas: [], pendentes: lista.slice((p.pagina - 1) * p.porPagina, p.pagina * p.porPagina), total: lista.length }
  }

  const colOrd = p.ord === 'aula' || p.ord === 'tema' ? p.ord : 'disciplina'
  let raw: any[] = []
  let total = 0
  if (p.situ === 'sem' || p.situ === 'com') {
    const comUrl = new Set((await fetchAll<{ link_id: string }>(() => svc.from(T_ALINKS).select('link_id').eq('tenant_id', tenantId).order('id') as any)).map((x) => x.link_id))
    const todos = (await fetchAll<any>(() => filtroQ(svc.from(T_LINKS).select('id, disciplina, aula, tema').eq('tenant_id', tenantId)).order('disciplina').order('aula').order('id') as any))
      .filter((l) => (p.situ === 'com') === comUrl.has(l.id))
    const f = asc ? 1 : -1
    todos.sort((a, b) => colOrd === 'disciplina' ? f * (cmp(a.disciplina, b.disciplina) || cmp(a.aula, b.aula)) : f * cmp(a[colOrd] ?? '', b[colOrd] ?? ''))
    total = todos.length
    raw = todos.slice((p.pagina - 1) * p.porPagina, p.pagina * p.porPagina)
  } else {
    let b = filtroQ(svc.from(T_LINKS).select('id, disciplina, aula, tema', { count: 'exact' }).eq('tenant_id', tenantId)).order(colOrd, { ascending: asc })
    if (colOrd === 'disciplina') b = b.order('aula', { ascending: asc })
    const { data, count, error } = await b.order('id').range((p.pagina - 1) * p.porPagina, p.pagina * p.porPagina - 1)
    if (error) throw error
    raw = data ?? []; total = count ?? 0
  }

  const ids = raw.map((l) => l.id as string)
  const discs = [...new Set(raw.map((l) => l.disciplina as string))]
  const [urls, metas] = await Promise.all([
    ids.length ? fetchAllByIn<any>(ids, (c) => svc.from(T_ALINKS).select('link_id, plataforma_id, url').eq('tenant_id', tenantId).in('link_id', c).order('id') as any) : Promise.resolve([] as any[]),
    // Usos: metas de questões das disciplinas desta página (casamento pela MESMA chaveLink do motor).
    discs.length ? fetchAllByIn<any>(discs, (c) => svc.from(T_METAS).select('disciplina, aula').eq('tenant_id', tenantId).eq('tipo', 'quest').not('aula', 'is', null).in('disciplina', c).order('id') as any) : Promise.resolve([] as any[]),
  ])
  const porLink = new Map<string, { plataforma_id: string; url: string }[]>()
  for (const u of urls) {
    const l = porLink.get(u.link_id)
    if (l) l.push({ plataforma_id: u.plataforma_id, url: u.url }); else porLink.set(u.link_id, [{ plataforma_id: u.plataforma_id, url: u.url }])
  }
  const usoChave = new Map<string, number>()
  for (const m of metas) { const k = chaveLink(m.disciplina, m.aula); if (k) usoChave.set(k, (usoChave.get(k) ?? 0) + 1) }
  const linhas: LinkLinha[] = raw.map((l) => {
    const k = chaveLink(l.disciplina, l.aula)
    return { id: l.id, disciplina: l.disciplina, aula: l.aula, tema: l.tema ?? null, urls: porLink.get(l.id) ?? [], usos: k ? (usoChave.get(k) ?? 0) : 0 }
  })
  return { ...resBase, modo: 'links', linhas, pendentes: [], total }
}
