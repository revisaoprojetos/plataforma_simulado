import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { DuracaoDivergente, VarianteAula } from '@/app/admin/cronogramas/metas/actions-tipos'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'

// Dados das sub-abas Gerador > Metas (Tipos de meta + Auditoria de metas). Tudo resolvido no servidor:
// busca, filtro, ordenação e página. As leituras reaproveitam as mesmas tabelas/RPCs das telas atuais.

export type QSG = Record<string, string | undefined>
export const PPS_GERADOR = [10, 14, 25, 50, 100]
export const PP_GERADOR_PADRAO = 14

/** Une searchParams (primeiro valor) com a query do basePath (aba/sub), devolvendo caminho e params planos. */
export function montarQsGerador(sp: Record<string, string | string[] | undefined>, basePath: string): { path: string; qs: QSG } {
  const [path, query] = basePath.split('?')
  const qs: QSG = {}
  for (const [k, v] of Object.entries(sp)) { const x = Array.isArray(v) ? v[0] : v; if (x) qs[k] = x }
  for (const [k, v] of new URLSearchParams(query ?? '')) qs[k] = v
  return { path, qs }
}

export const porPaginaGerador = (v: string | undefined) => { const n = Math.trunc(Number(v)); return PPS_GERADOR.includes(n) ? n : PP_GERADOR_PADRAO }
export const paginaGerador = (v: string | undefined) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n >= 1 ? n : 1 }
/** Remove caracteres que o PostgREST usa como sintaxe de filtro. */
export const termoSeguro = (v: string | undefined) => (v ?? '').trim().replace(/[%,()*]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ───────────────────────────── Tipos de meta ─────────────────────────────

export type TipoLinha = TipoMetaDef & { ativo: boolean; usos: number; chips: string[] }

function chipsTipo(t: TipoMetaDef): string[] {
  const xs: string[] = []
  if (t.mostra_links) xs.push('links de questões')
  if (t.aula_no_titulo) xs.push('só a aula no título')
  else if (t.prefixo_aula) xs.push('prefixo de aula')
  if (t.quebra_conteudo) xs.push('quebra o conteúdo')
  if (!t.conta_atividade) xs.push('não conta como atividade')
  if (t.destaque_docx) xs.push('linha alta no DOCX')
  if (!t.sempre_no_docx) xs.push('só na semana em que houver')
  return xs
}

const COLUNAS_ORDEM_TIPO: Record<string, string> = { ordem: 'ordem', nome: 'nome', slug: 'slug', status: 'ativo', docx: 'rotulo_docx' }

export async function paginarTipos(tenantId: string, o: { q?: string; status?: string; ord?: string; dir?: 'asc' | 'desc'; pagina: number; por: number }) {
  const svc = createAdminClient()
  const t = termoSeguro(o.q)
  let q = svc.from('simulado_cronograma_tipos_meta')
    .select('id, slug, nome, rotulo_docx, ordem, cor, ativo, mostra_links, prefixo_aula, aula_no_titulo, quebra_conteudo, conta_atividade, destaque_docx, sempre_no_docx', { count: 'exact' })
    .eq('tenant_id', tenantId)
  if (t) q = q.or(`nome.ilike.%${t}%,slug.ilike.%${t}%,rotulo_docx.ilike.%${t}%`)
  if (o.status === 'ativo') q = q.eq('ativo', true)
  else if (o.status === 'inativo') q = q.eq('ativo', false)
  const col = COLUNAS_ORDEM_TIPO[o.ord ?? ''] ?? 'ordem'
  const from = (o.pagina - 1) * o.por
  const { data, count, error } = await q.order(col, { ascending: o.dir !== 'desc' }).order('id').range(from, from + o.por - 1)
  if (error) return { ok: false as const, error: error.message }
  const base = (data ?? []) as unknown as (TipoMetaDef & { ativo: boolean })[]
  // Uso por tipo: contagem agregada (head) só dos tipos desta página, em paralelo.
  const usos = await Promise.all(base.map((b) =>
    svc.from('simulado_cronograma_metas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('tipo', b.slug).then((r) => r.count ?? 0)))
  const linhas: TipoLinha[] = base.map((b, i) => ({ ...b, usos: usos[i], chips: chipsTipo(b) }))
  return { ok: true as const, linhas, total: count ?? 0 }
}

/** IDs de TODOS os tipos na ordem real (poucos; só ids) — a reordenação (subir/descer) grava a lista inteira. */
export async function idsTiposEmOrdem(tenantId: string): Promise<string[]> {
  const { data } = await createAdminClient().from('simulado_cronograma_tipos_meta').select('id').eq('tenant_id', tenantId).order('ordem').order('nome').order('id')
  return ((data ?? []) as { id: string }[]).map((x) => x.id)
}

// ───────────────────────────── Auditoria: formato de aula ─────────────────────────────

export type LinhaDisciplinaAula = { disciplina: string; aulas: string[]; metas: number; cronogramas: number; nomesCron: string[]; comZero: number; semZero: number }

/** Agrupa as variantes (disciplina+aula) por DISCIPLINA — a decisão real é uma por disciplina — e pagina. */
export function paginarVariantes(variantes: VarianteAula[], o: { q?: string; ord?: string; dir?: 'asc' | 'desc'; pagina: number; por: number }) {
  const mapa = new Map<string, LinhaDisciplinaAula & { ids: Set<string>; nomes: Set<string> }>()
  for (const v of variantes) {
    let d = mapa.get(v.disciplina)
    if (!d) { d = { disciplina: v.disciplina, aulas: [], metas: 0, cronogramas: 0, nomesCron: [], comZero: 0, semZero: 0, ids: new Set(), nomes: new Set() }; mapa.set(v.disciplina, d) }
    d.aulas.push(v.aula_chave); d.metas += v.total
    for (const c of v.cronogramas) { d.ids.add(c.id); d.nomes.add(c.nome) }
    for (const f of v.formas) { if (/^0\d/.test(f.aula)) d.comZero += f.n; else d.semZero += f.n }
  }
  let todas: LinhaDisciplinaAula[] = [...mapa.values()].map((d) => ({
    disciplina: d.disciplina, aulas: d.aulas.sort((a, b) => Number(a) - Number(b)), metas: d.metas, cronogramas: d.ids.size,
    nomesCron: [...d.nomes].sort(), comZero: d.comZero, semZero: d.semZero,
  }))
  const t = norm(o.q ?? '').trim()
  if (t) todas = todas.filter((d) => norm(d.disciplina).includes(t))
  const dir = o.dir === 'asc' ? 1 : -1
  const chave: Record<string, (d: LinhaDisciplinaAula) => number | string> = {
    disc: (d) => d.disciplina, aulas: (d) => d.aulas.length, metas: (d) => d.metas, cron: (d) => d.cronogramas,
  }
  const f = chave[o.ord ?? 'metas'] ?? chave.metas
  const dirEf = o.ord ? (o.dir === 'desc' ? -1 : 1) : dir
  todas.sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : (x as number) - (y as number)) * dirEf })
  const total = todas.length
  const ini = (o.pagina - 1) * o.por
  return { linhas: todas.slice(ini, ini + o.por), total, totalDisciplinas: mapa.size }
}

// ───────────────────────────── Auditoria: durações ─────────────────────────────

export function paginarDuracoes(duracoes: DuracaoDivergente[], o: { q?: string; ord?: string; dir?: 'asc' | 'desc'; pagina: number; por: number }) {
  const t = norm(o.q ?? '').trim()
  let xs = t ? duracoes.filter((d) => norm(`${d.cronograma_nome} ${d.tipo}`).includes(t)) : [...duracoes]
  const chave: Record<string, (d: DuracaoDivergente) => number | string> = {
    cron: (d) => d.cronograma_nome, semana: (d) => d.semana, tipo: (d) => d.tipo, total: (d) => d.total,
  }
  const f = chave[o.ord ?? 'cron'] ?? chave.cron
  const dir = o.dir === 'desc' ? -1 : 1
  xs.sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : (x as number) - (y as number)) * dir || a.semana - b.semana })
  const ini = (o.pagina - 1) * o.por
  return { linhas: xs.slice(ini, ini + o.por), total: xs.length }
}
