import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { hojeBrtISO } from '@/lib/brt'
import {
  CFG_PADRAO, diaSemanaDe,
  type AulaOpcao, type FiltrosLiberacao, type LinhaLiberacao, type LiberacaoCfg, type ProdutoOpcao, type ResumoLiberacao,
} from './tipos'

// Leituras da sub-aba "Liberação de aulas" (só LEEM; backend-first: filtro/ordem/paginação no banco).
// Tolerante: sem as tabelas da migração 20261117010000 devolve migrado=false em vez de quebrar.

type Svc = ReturnType<typeof createAdminClient>
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

export function semTabela(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  const m = String(err.message ?? '')
  return err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST204' || /schema cache|does not exist/i.test(m)
}

export async function listarProdutos(svc: Svc, tenantId: string): Promise<ProdutoOpcao[]> {
  const { data } = await svc.from('simulado_produtos').select('id, nome, tipo, ordem').eq('tenant_id', tenantId).order('ordem', { ascending: true }).order('nome', { ascending: true })
  return ((data ?? []) as any[]).map((p) => ({ id: p.id, nome: p.nome, tipo: p.tipo ?? '' }))
}

export async function lerCfg(svc: Svc, tenantId: string, produtoId: string): Promise<{ migrado: boolean; cfg: LiberacaoCfg }> {
  const { data, error } = await svc.from('simulado_produto_liberacao_cfg').select('ativo, sem_plano, com_plano, dias_antes').eq('tenant_id', tenantId).eq('produto_id', produtoId).maybeSingle()
  if (semTabela(error)) return { migrado: false, cfg: CFG_PADRAO }
  const d = data as any
  return { migrado: true, cfg: d ? { ativo: !!d.ativo, sem_plano: d.sem_plano, com_plano: d.com_plano, dias_antes: Number(d.dias_antes) || 0 } : CFG_PADRAO }
}

/** Aulas (submódulos) do produto + a matéria (módulo raiz) de cada uma — lean, ~300 linhas. */
export async function lerAulasProduto(svc: Svc, tenantId: string, produtoId: string): Promise<{ aulas: AulaOpcao[]; disciplinas: string[] }> {
  const mods = await fetchAll<{ id: string; pai_id: string | null; titulo: string; ordem: number }>(() =>
    svc.from('simulado_produto_modulos').select('id, pai_id, titulo, ordem').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).order('ordem', { ascending: true }).order('id', { ascending: true }) as any)
  const raizes = new Map(mods.filter((m) => !m.pai_id).map((m) => [m.id, m.titulo]))
  const aulas = mods.filter((m) => m.pai_id && raizes.has(m.pai_id)).map((m) => ({ id: m.id, titulo: m.titulo, moduloId: m.pai_id!, disciplina: raizes.get(m.pai_id!)! }))
  return { aulas, disciplinas: [...raizes.values()] }
}

export async function lerResumo(svc: Svc, tenantId: string, produtoId: string): Promise<ResumoLiberacao | null> {
  const hoje = hojeBrtISO()
  const base = () => svc.from('simulado_produto_liberacao_aulas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('produto_id', produtoId)
  const [t, v, lib, prox] = await Promise.all([
    base(),
    base().not('aula_id', 'is', null),
    base().eq('ativo', true).lte('data_liberacao', hoje),
    svc.from('simulado_produto_liberacao_aulas').select('data_liberacao, titulo, disciplina').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).gt('data_liberacao', hoje).order('data_liberacao', { ascending: true }).order('ordem', { ascending: true }).limit(1),
  ])
  if (t.error) return null
  const p = ((prox.data ?? []) as any[])[0]
  const total = t.count ?? 0, vinculadas = v.count ?? 0
  return { total, vinculadas, semVinculo: total - vinculadas, jaLiberadas: lib.count ?? 0, proxima: p ? { data: p.data_liberacao, titulo: p.titulo, disciplina: p.disciplina } : null }
}

const COLS_ORDEM: Record<string, string> = { ordem: 'ordem', data: 'data_liberacao', disciplina: 'disciplina', numero: 'numero_aula', titulo: 'titulo', semana: 'semana', vinculo: 'aula_id', ativo: 'ativo', cronograma: 'cronogramas' }
const SELECT = 'id, ordem, modulo_id, aula_id, disciplina, numero_aula, titulo, data_liberacao, cronogramas, semana, observacao, data_original, ativo'

function filtrar(q: any, f: FiltrosLiberacao) {
  const termo = (f.q ?? '').replace(/[%,()*\\]/g, ' ').trim()
  if (termo) q = q.or(`disciplina.ilike.%${termo}%,titulo.ilike.%${termo}%`)
  if (f.disc) q = q.eq('disciplina', f.disc)
  if (f.vinc === 'sim') q = q.not('aula_id', 'is', null)
  if (f.vinc === 'nao') q = q.is('aula_id', null)
  if (f.de && DATA_RE.test(f.de)) q = q.gte('data_liberacao', f.de)
  if (f.ate && DATA_RE.test(f.ate)) q = q.lte('data_liberacao', f.ate)
  if (f.ativo === 'sim') q = q.eq('ativo', true)
  if (f.ativo === 'nao') q = q.eq('ativo', false)
  return q
}
function ordenar(q: any, f: FiltrosLiberacao) {
  const col = COLS_ORDEM[f.ord ?? ''] ?? 'ordem'
  q = q.order(col, { ascending: f.dir !== 'desc', nullsFirst: false })
  return col === 'ordem' ? q : q.order('ordem', { ascending: true })
}

async function paraLinhas(svc: Svc, tenantId: string, rows: any[]): Promise<LinhaLiberacao[]> {
  const ids = [...new Set(rows.map((r) => r.aula_id).filter(Boolean))] as string[]
  const titulos = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 80) {
    const { data } = await svc.from('simulado_produto_modulos').select('id, titulo').eq('tenant_id', tenantId).in('id', ids.slice(i, i + 80))
    for (const m of (data ?? []) as any[]) titulos.set(m.id, m.titulo)
  }
  return rows.map((r) => ({
    id: r.id, ordem: r.ordem, disciplina: r.disciplina, numeroAula: r.numero_aula, titulo: r.titulo, dataLiberacao: r.data_liberacao,
    diaSemana: diaSemanaDe(r.data_liberacao), cronogramas: r.cronogramas, semana: r.semana, observacao: r.observacao, dataOriginal: r.data_original,
    moduloId: r.modulo_id, aulaId: r.aula_id, aulaTitulo: r.aula_id ? titulos.get(r.aula_id) ?? '(aula removida)' : null, ativo: r.ativo,
  }))
}

/** Uma página das linhas (paginação no banco: .range() + count). */
export async function listarPagina(svc: Svc, tenantId: string, produtoId: string, f: FiltrosLiberacao, pagina: number, porPagina: number): Promise<{ total: number; linhas: LinhaLiberacao[]; migrado: boolean }> {
  const from = (pagina - 1) * porPagina
  const { data, count, error } = await ordenar(filtrar(svc.from('simulado_produto_liberacao_aulas').select(SELECT, { count: 'exact' }).eq('tenant_id', tenantId).eq('produto_id', produtoId), f), f).range(from, from + porPagina - 1)
  if (semTabela(error)) return { total: 0, linhas: [], migrado: false }
  return { total: count ?? 0, linhas: await paraLinhas(svc, tenantId, (data ?? []) as any[]), migrado: true }
}

/** Todas as linhas do filtro (para exportar CSV/XLSX), na ordem pedida; desempate por `id` (coluna única). */
export async function listarTodas(svc: Svc, tenantId: string, produtoId: string, f: FiltrosLiberacao): Promise<LinhaLiberacao[]> {
  const rows = await fetchAll<any>(() => ordenar(filtrar(svc.from('simulado_produto_liberacao_aulas').select(SELECT).eq('tenant_id', tenantId).eq('produto_id', produtoId), f), f).order('id', { ascending: true }) as any)
  return paraLinhas(svc, tenantId, rows)
}

/** Matérias distintas das linhas do produto (filtro). */
export async function listarMaterias(svc: Svc, tenantId: string, produtoId: string): Promise<string[]> {
  const rows = await fetchAll<{ disciplina: string; id: string }>(() => svc.from('simulado_produto_liberacao_aulas').select('id, disciplina').eq('tenant_id', tenantId).eq('produto_id', produtoId).order('id', { ascending: true }) as any)
  return [...new Set(rows.map((r) => r.disciplina))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
