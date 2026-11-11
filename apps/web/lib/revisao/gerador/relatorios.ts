import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import type { Geral, LinhaAluno, LinhaCronograma, LinhaDia } from '@/app/admin/cronogramas/relatorios/actions-tipos'
import { limparBusca, norm, ordenarPor, paginarMemoria } from './comum-ger3'

// Sub-aba "Relatórios" do Gerador: tudo por RPC agregada ou consulta paginada (.range()+count). Nada de varrer emissões
// na aplicação (a plataforma tem ~14 mil alunos; o PostgREST corta em 1.000 linhas).

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))
const ZERO: Geral = { emissoes: 0, alunos: 0, cronogramas_usados: 0, concluidas: 0, planejadas: 0, emissoes_7d: 0, emissoes_30d: 0, alunos_30d: 0 }

export async function lerGeral(svc: SupabaseClient, tenantId: string): Promise<Geral> {
  const { data, error } = await svc.rpc('simulado_cronograma_relatorio_geral', { p_tenant: tenantId })
  if (error) throw error
  const b = ((data ?? [])[0] ?? null) as Record<string, unknown> | null
  if (!b) return ZERO
  return { emissoes: n(b.emissoes), alunos: n(b.alunos), cronogramas_usados: n(b.cronogramas_usados), concluidas: n(b.concluidas), planejadas: n(b.planejadas), emissoes_7d: n(b.emissoes_7d), emissoes_30d: n(b.emissoes_30d), alunos_30d: n(b.alunos_30d) }
}

export async function lerSerieDias(svc: SupabaseClient, tenantId: string, dias = 30): Promise<LinhaDia[]> {
  const { data, error } = await svc.rpc('simulado_cronograma_relatorio_por_dia', { p_tenant: tenantId, p_dias: dias })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((d) => ({ dia: String(d.dia), emissoes: n(d.emissoes), concluidas: n(d.concluidas) }))
}

/** Um cronograma por linha (RPC; uma linha por cronograma do catálogo, poucas dezenas) — busca/ordem/página no servidor. */
export async function lerPorCronograma(svc: SupabaseClient, tenantId: string): Promise<LinhaCronograma[]> {
  const { data, error } = await svc.rpc('simulado_cronograma_relatorio_por_cronograma', { p_tenant: tenantId })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    cronograma_id: String(c.cronograma_id), nome: String(c.nome ?? ''), carga_horaria: c.carga_horaria == null ? null : n(c.carga_horaria),
    emissoes: n(c.emissoes), alunos: n(c.alunos), concluidas: n(c.concluidas), planejadas: n(c.planejadas),
  }))
}
export const pct = (feitas: number, total: number): number => (total > 0 ? Math.round((feitas / total) * 100) : 0)

export function paginarPorCronograma(l: LinhaCronograma[], o: { q?: string; ordem?: string; dir: 'asc' | 'desc'; pagina: number; porPagina: number }) {
  const q = norm(o.q ?? '')
  const f = l.filter((c) => !q || norm(c.nome).includes(q))
  const chave: Record<string, (c: LinhaCronograma) => string | number> = {
    nome: (c) => c.nome, emissoes: (c) => c.emissoes, alunos: (c) => c.alunos, carga: (c) => c.carga_horaria ?? 0, progresso: (c) => pct(c.concluidas, c.planejadas),
  }
  return paginarMemoria(ordenarPor(f, chave[o.ordem ?? ''] ?? chave.emissoes, o.ordem ? o.dir : 'desc'), o.pagina, o.porPagina)
}

// ── Alunos ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PaginaAlunos { itens: LinhaAluno[]; total: number; pagina: number; porPagina: number; /** false = RPC v2 ainda não aplicada (ordem fixa por última emissão, sem filtro de andamento) */ v2: boolean }

const mapAluno = (a: Record<string, unknown>): LinhaAluno => ({
  estudante_id: String(a.estudante_id), nome: String(a.nome ?? ''), email: (a.email as string | null) ?? null, emissoes: n(a.emissoes),
  ultima: String(a.ultima), concluidas: n(a.concluidas), planejadas: n(a.planejadas), total_linhas: n(a.total_linhas),
})

export async function listarAlunosRelatorio(svc: SupabaseClient, tenantId: string, o: { q?: string; ordem?: string; dir: 'asc' | 'desc'; situ?: string; pagina: number; porPagina: number }): Promise<PaginaAlunos> {
  const de = (o.pagina - 1) * o.porPagina
  const busca = limparBusca(o.q) || null
  const ordem = ['nome', 'emissoes', 'ultima', 'progresso'].includes(o.ordem ?? '') ? o.ordem : 'ultima'
  const situ = ['completo', 'andamento', 'sem_progresso'].includes(o.situ ?? '') ? o.situ : null
  const v2 = await svc.rpc('simulado_cronograma_relatorio_alunos_v2', { p_tenant: tenantId, p_busca: busca, p_ordem: ordem, p_dir: o.ordem ? o.dir : 'desc', p_situacao: situ, p_limite: o.porPagina, p_offset: de })
  if (!v2.error) {
    const itens = ((v2.data ?? []) as Record<string, unknown>[]).map(mapAluno)
    return { itens, total: itens[0]?.total_linhas ?? 0, pagina: o.pagina, porPagina: o.porPagina, v2: true }
  }
  // Fallback: RPC original (ordem fixa por última emissão; sem filtro de andamento).
  const v1 = await svc.rpc('simulado_cronograma_relatorio_alunos', { p_tenant: tenantId, p_busca: busca, p_limite: o.porPagina, p_offset: de })
  if (v1.error) throw v1.error
  const itens = ((v1.data ?? []) as Record<string, unknown>[]).map(mapAluno)
  return { itens, total: itens[0]?.total_linhas ?? 0, pagina: o.pagina, porPagina: o.porPagina, v2: false }
}

// ── Emissões ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface LinhaEmissao {
  id: string; criadoEm: string; estudanteId: string; aluno: string; cronogramaId: string; cronograma: string; titulo: string | null
  via: string | null; atorTipo: string; arquivada: boolean; downloads: { docx: number; ficha: number; csv: number }
}
const COL_EMISSAO: Record<string, string> = { quando: 'criado_em', aluno: 'estudante_nome', cronograma: 'cronograma_nome', via: 'via_acesso' }

export async function listarEmissoes(svc: SupabaseClient, tenantId: string, o: { q?: string; via?: string; cronograma?: string; arq?: string; ordem?: string; dir: 'asc' | 'desc'; pagina: number; porPagina: number }) {
  const de = (o.pagina - 1) * o.porPagina
  let qb = svc.from('simulado_cronograma_emissoes')
    .select('id, criado_em, estudante_id, estudante_nome, cronograma_id, cronograma_nome, titulo, via_acesso, ator_tipo, arquivada', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('is_teste', false)
  const q = limparBusca(o.q)
  if (q) qb = qb.or(`estudante_nome.ilike.%${q}%,cronograma_nome.ilike.%${q}%,titulo.ilike.%${q}%`)
  if (o.via) qb = qb.eq('via_acesso', o.via)
  if (o.cronograma && /^[0-9a-f-]{36}$/i.test(o.cronograma)) qb = qb.eq('cronograma_id', o.cronograma)
  if (o.arq === 'sim') qb = qb.eq('arquivada', true)
  if (o.arq === 'nao') qb = qb.eq('arquivada', false)
  const col = COL_EMISSAO[o.ordem ?? ''] ?? 'criado_em'
  const { data, count, error } = await qb.order(col, { ascending: (o.ordem ? o.dir : 'desc') === 'asc' }).order('id').range(de, de + o.porPagina - 1)
  if (error) throw error
  const rows = (data ?? []) as Array<Record<string, unknown>>
  const ids = rows.map((r) => String(r.id))
  const dls = new Map<string, { docx: number; ficha: number; csv: number }>()
  if (ids.length) {
    const lista = await fetchAllByIn<{ emissao_id: string; botao: 'docx' | 'ficha' | 'csv'; id: string }>(ids, (ch) =>
      svc.from('simulado_cronograma_downloads').select('id, emissao_id, botao').eq('tenant_id', tenantId).in('emissao_id', ch).order('id') as never, { chunk: 80 })
    for (const d of lista) { const x = dls.get(d.emissao_id) ?? { docx: 0, ficha: 0, csv: 0 }; x[d.botao] = (x[d.botao] ?? 0) + 1; dls.set(d.emissao_id, x) }
  }
  const itens: LinhaEmissao[] = rows.map((r) => ({
    id: String(r.id), criadoEm: String(r.criado_em), estudanteId: String(r.estudante_id), aluno: String(r.estudante_nome ?? 'Aluno'),
    cronogramaId: String(r.cronograma_id), cronograma: String(r.cronograma_nome ?? ''), titulo: (r.titulo as string | null) ?? null,
    via: (r.via_acesso as string | null) ?? null, atorTipo: String(r.ator_tipo ?? ''), arquivada: r.arquivada === true,
    downloads: dls.get(String(r.id)) ?? { docx: 0, ficha: 0, csv: 0 },
  }))
  return { itens, total: count ?? 0, pagina: o.pagina, porPagina: o.porPagina }
}

// ── Downloads ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface LinhaDownload { id: string; criadoEm: string; botao: string; atorTipo: string | null; aluno: string; cronograma: string }

export async function listarDownloads(svc: SupabaseClient, tenantId: string, o: { q?: string; botao?: string; ordem?: string; dir: 'asc' | 'desc'; pagina: number; porPagina: number }) {
  const de = (o.pagina - 1) * o.porPagina
  let qb = svc.from('simulado_cronograma_downloads')
    .select('id, criado_em, botao, ator_tipo, emissao:simulado_cronograma_emissoes!inner(estudante_nome, cronograma_nome, is_teste)', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('emissao.is_teste', false)
  if (o.botao === 'docx' || o.botao === 'ficha' || o.botao === 'csv') qb = qb.eq('botao', o.botao)
  const q = limparBusca(o.q)
  if (q) qb = qb.or(`estudante_nome.ilike.%${q}%,cronograma_nome.ilike.%${q}%`, { referencedTable: 'emissao' })
  const col = o.ordem === 'botao' ? 'botao' : 'criado_em'
  const { data, count, error } = await qb.order(col, { ascending: (o.ordem ? o.dir : 'desc') === 'asc' }).order('id').range(de, de + o.porPagina - 1)
  if (error) throw error
  const itens: LinhaDownload[] = ((data ?? []) as unknown as Array<{ id: string; criado_em: string; botao: string; ator_tipo: string | null; emissao: { estudante_nome: string | null; cronograma_nome: string | null } | { estudante_nome: string | null; cronograma_nome: string | null }[] | null }>).map((r) => {
    const e = Array.isArray(r.emissao) ? r.emissao[0] : r.emissao
    return { id: r.id, criadoEm: r.criado_em, botao: r.botao, atorTipo: r.ator_tipo, aluno: e?.estudante_nome ?? 'Aluno', cronograma: e?.cronograma_nome ?? '' }
  })
  return { itens, total: count ?? 0, pagina: o.pagina, porPagina: o.porPagina }
}
