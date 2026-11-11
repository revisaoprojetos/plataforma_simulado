import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { EDICAO_COLS, type EdicaoRow, type JulgadoRow, type QuestaoJcRow, type ErrataRow } from './jurisclub-tipos'

// Leitura do JurisClub (Plataforma Revisão). Só LÊ dados prontos: paginação .range()+count, sem cálculo no render.
// Totais dos KPIs vêm das colunas denormalizadas n_julgados/n_questoes (mantidas pelas actions).

export const PER_PAGE_JC = [10, 24, 25, 50, 100]

export interface FiltroEdicoes {
  pasta?: string | null
  f: 'todos' | 'ras' | 'ag' | 'pub'
  q?: string
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  pp?: number
}

const STATUS_F: Record<string, string> = { ras: 'rascunho', ag: 'agendado', pub: 'publicado' }
const SORT_EDICOES = new Set(['titulo', 'status', 'n_julgados', 'n_questoes', 'publicado_em', 'criado_em'])
const like = (s: string) => s.replace(/[%_,()]/g, ' ').trim()

export interface KpisJc { noAr: number; rascunhos: number; julgados: number; questoes: number; porPasta: Record<string, number> }

/** KPIs do topo + contagem por pasta (já filtrada pela situação) — pequeno: 1 linha por edição, só 4 colunas. */
export async function kpisJurisclub(tenantId: string, f: FiltroEdicoes['f']): Promise<KpisJc> {
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from('jurisclub_edicoes').select('id, pasta, status, n_julgados, n_questoes')
    .eq('tenant_id', tenantId).eq('deletado', false).order('id'))
  const k: KpisJc = { noAr: 0, rascunhos: 0, julgados: 0, questoes: 0, porPasta: {} }
  for (const r of rows) {
    if (r.status === 'publicado') { k.noAr++; k.julgados += r.n_julgados ?? 0; k.questoes += r.n_questoes ?? 0 }
    if (r.status === 'rascunho') k.rascunhos++
    if (f === 'todos' || STATUS_F[f] === r.status) k.porPasta[r.pasta] = (k.porPasta[r.pasta] ?? 0) + 1
  }
  return k
}

export async function listarEdicoes(tenantId: string, F: FiltroEdicoes): Promise<{ rows: EdicaoRow[]; total: number; page: number; pp: number }> {
  const svc = createAdminClient()
  const pp = PER_PAGE_JC.includes(F.pp ?? 0) ? (F.pp as number) : 25
  const page = Math.max(1, F.page ?? 1)
  const sort = SORT_EDICOES.has(F.sort ?? '') ? (F.sort as string) : 'criado_em'
  let q = svc.from('jurisclub_edicoes').select(EDICAO_COLS, { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
  if (F.pasta) q = q.eq('pasta', F.pasta)
  if (STATUS_F[F.f]) q = q.eq('status', STATUS_F[F.f])
  const t = like(F.q ?? '')
  if (t) q = q.ilike('titulo', `%${t}%`)
  const { data, count } = await q.order(sort, { ascending: F.dir === 'asc', nullsFirst: false }).order('id', { ascending: true }).range((page - 1) * pp, page * pp - 1)
  return { rows: (data ?? []) as unknown as EdicaoRow[], total: count ?? 0, page, pp }
}

export async function obterEdicao(tenantId: string, id: string): Promise<EdicaoRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const svc = createAdminClient()
  const { data } = await svc.from('jurisclub_edicoes').select(EDICAO_COLS).eq('id', id).eq('tenant_id', tenantId).eq('deletado', false).maybeSingle()
  return (data as unknown as EdicaoRow) ?? null
}

/** Resumo p/ o "Como você quer começar?" (a partir de uma já pronta): últimas edições da pasta. */
export async function edicoesDaPasta(tenantId: string, pasta: string): Promise<{ id: string; titulo: string }[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('jurisclub_edicoes').select('id, titulo').eq('tenant_id', tenantId).eq('deletado', false).eq('pasta', pasta)
    .order('criado_em', { ascending: false }).order('id').limit(100)
  return (data ?? []) as { id: string; titulo: string }[]
}

/** Simulado Trimestral = aplicado no admin de simulados: lista os simulados cujo título começa com "Simulado Trimestral". */
export async function simuladosTrimestrais(tenantId: string): Promise<{ rows: { id: string; titulo: string; status: string }[]; total: number }> {
  const svc = createAdminClient()
  const { data, count } = await svc.from('simulado_simulados').select('id, titulo, status', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('deletado', false).is('owner_estudante_id', null).ilike('titulo', 'Simulado Trimestral%')
    .order('created_at', { ascending: false }).order('id').range(0, 23)
  return { rows: (data ?? []) as any[], total: count ?? 0 }
}

export async function gruposDoTenant(tenantId: string): Promise<{ id: string; nome: string }[]> {
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tenantId).order('nome').order('id'))
  return rows as { id: string; nome: string }[]
}

export async function gruposDaEdicao(tenantId: string, edicaoId: string): Promise<string[]> {
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from('jurisclub_edicao_grupos').select('grupo_id').eq('tenant_id', tenantId).eq('edicao_id', edicaoId).order('grupo_id'))
  return rows.map((r: any) => r.grupo_id as string)
}

// ── Julgados ──
const SORT_JUL = new Set(['ordem', 'titulo', 'tribunal', 'disciplina', 'conferido'])

export async function listarJulgados(tenantId: string, edicaoId: string, o: { q?: string; disc?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; pp?: number }) {
  const svc = createAdminClient()
  const pp = PER_PAGE_JC.includes(o.pp ?? 0) ? (o.pp as number) : 25
  const page = Math.max(1, o.page ?? 1)
  const sort = SORT_JUL.has(o.sort ?? '') ? (o.sort as string) : 'ordem'
  let q = svc.from('jurisclub_julgados').select('id, edicao_id, ordem, titulo, tribunal, orgao, disciplina, selos, fazenda, conferido', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('edicao_id', edicaoId)
  if (o.disc) q = q.eq('disciplina', o.disc)
  const t = like(o.q ?? '')
  if (t) q = q.ilike('titulo', `%${t}%`)
  const { data, count } = await q.order(sort, { ascending: o.dir !== 'desc' }).order('id').range((page - 1) * pp, page * pp - 1)
  return { rows: (data ?? []) as unknown as JulgadoRow[], total: count ?? 0, page, pp }
}

export async function disciplinasDaEdicao(tenantId: string, edicaoId: string): Promise<string[]> {
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from('jurisclub_julgados').select('id, disciplina').eq('tenant_id', tenantId).eq('edicao_id', edicaoId).not('disciplina', 'is', null).order('id'))
  return [...new Set(rows.map((r: any) => String(r.disciplina)))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Todos os títulos de julgado da edição (id+titulo) — p/ o select da errata e "Ligada a" das questões. */
export async function titulosJulgados(tenantId: string, edicaoId: string, ids?: string[]): Promise<{ id: string; titulo: string }[]> {
  const svc = createAdminClient()
  if (ids) {
    if (!ids.length) return []
    return fetchAllByIn<any>(ids, (c) => svc.from('jurisclub_julgados').select('id, titulo').eq('tenant_id', tenantId).in('id', c).order('id'))
  }
  return fetchAll<any>(() => svc.from('jurisclub_julgados').select('id, titulo, ordem').eq('tenant_id', tenantId).eq('edicao_id', edicaoId).order('ordem').order('id'))
}

// ── Questões ──
export async function listarQuestoes(tenantId: string, edicaoId: string, o: { q?: string; g?: string; page?: number; pp?: number }) {
  const svc = createAdminClient()
  const pp = PER_PAGE_JC.includes(o.pp ?? 0) ? (o.pp as number) : 25
  const page = Math.max(1, o.page ?? 1)
  let q = svc.from('jurisclub_questoes').select('id, edicao_id, julgado_id, ordem, enunciado, gabarito, disciplina, assunto, comentario, questao_id', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('edicao_id', edicaoId)
  if (o.g === 'C' || o.g === 'E') q = q.eq('gabarito', o.g)
  const t = like(o.q ?? '')
  if (t) q = q.ilike('enunciado', `%${t}%`)
  const { data, count } = await q.order('ordem').order('id').range((page - 1) * pp, page * pp - 1)
  const rows = (data ?? []) as unknown as QuestaoJcRow[]
  const jids = [...new Set(rows.map((r) => r.julgado_id).filter(Boolean) as string[])]
  const tit = new Map((await titulosJulgados(tenantId, edicaoId, jids)).map((j) => [j.id, j.titulo]))
  return { rows: rows.map((r) => ({ ...r, ligada: r.julgado_id ? tit.get(r.julgado_id) ?? null : null })), total: count ?? 0, page, pp }
}

export async function listarErratas(tenantId: string, edicaoId: string): Promise<ErrataRow[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('jurisclub_erratas').select('id, julgado_titulo, texto, avisou, criado_em').eq('tenant_id', tenantId).eq('edicao_id', edicaoId)
    .order('criado_em', { ascending: false }).order('id').limit(100)
  return (data ?? []) as ErrataRow[]
}

/** Títulos dos documentos da Biblioteca ligados à edição (aba Material). */
export async function nomesDocumentos(tenantId: string, ids: (string | null)[]): Promise<Record<string, string>> {
  const lista = [...new Set(ids.filter(Boolean) as string[])]
  if (!lista.length) return {}
  const svc = createAdminClient()
  const rows = await fetchAllByIn<any>(lista, (c) => svc.from('simulado_conteudo_documentos').select('id, titulo').eq('tenant_id', tenantId).in('id', c).order('id'))
  return Object.fromEntries(rows.map((r: any) => [r.id, r.titulo]))
}

/** Questões V/F das 3 últimas edições mensais no ar (base do Simulado Trimestral). */
export async function questoesUltimasEdicoes(tenantId: string): Promise<{ edicoes: number; questoes: number }> {
  const svc = createAdminClient()
  const { data } = await svc.from('jurisclub_edicoes').select('id, n_questoes').eq('tenant_id', tenantId).eq('deletado', false)
    .eq('pasta', 'mensal').eq('status', 'publicado').order('publicado_em', { ascending: false }).order('id').limit(3)
  const rows = (data ?? []) as { n_questoes: number }[]
  return { edicoes: rows.length, questoes: rows.reduce((s, r) => s + (r.n_questoes ?? 0), 0) }
}

// ───────────── Alcance (quem vê) e métricas reais ─────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Alunos distintos membros dos grupos informados (simulado_grupo_membros). */
export async function alunosDosGrupos(tenantId: string, grupoIds: string[]): Promise<number> {
  const ids = [...new Set(grupoIds.filter((x) => UUID.test(x)))]
  if (!ids.length) return 0
  const svc = createAdminClient()
  const rows = await fetchAllByIn<any>(ids, (c) => svc.from('simulado_grupo_membros').select('grupo_id, estudante_id').eq('tenant_id', tenantId).in('grupo_id', c).order('grupo_id').order('estudante_id')).catch(() => [])
  return new Set(rows.map((r: any) => r.estudante_id as string)).size
}

/**
 * "Todos os alunos com JurisClub": estudantes com assinatura ATIVA em produto ativo do tipo 'jurisclub' + membros dos
 * grupos de acesso vinculados a esses produtos. (Produtos "liberados para todos" e segmentos ficam de fora — ver relatório.)
 */
export async function alunosComJurisclub(tenantId: string): Promise<number> {
  const { remember } = await import('@/lib/cache/relatorio-cache')
  return remember(`jurisclub:alunos:${tenantId}`, 300, async () => {
    const svc = createAdminClient()
    const { data: prods } = await svc.from('simulado_produtos').select('id').eq('tenant_id', tenantId).eq('ativo', true).eq('tipo', 'jurisclub').limit(500)
    const pids = ((prods ?? []) as any[]).map((p) => p.id as string)
    if (!pids.length) return 0
    const [ass, itens] = await Promise.all([
      fetchAllByIn<any>(pids, (c) => svc.from('simulado_assinaturas').select('id, estudante_id').eq('tenant_id', tenantId).eq('status', 'ativo').in('produto_id', c).order('id')),
      fetchAllByIn<any>(pids, (c) => svc.from('simulado_produto_itens').select('id, item_id').eq('tenant_id', tenantId).eq('tipo_item', 'grupo').eq('ativo', true).in('produto_id', c).order('id')),
    ])
    const estudantes = new Set<string>(ass.map((a: any) => a.estudante_id as string))
    const grupos = [...new Set(itens.map((i: any) => i.item_id as string))]
    if (grupos.length) {
      const rows = await fetchAllByIn<any>(grupos, (c) => svc.from('simulado_grupo_membros').select('grupo_id, estudante_id').eq('tenant_id', tenantId).in('grupo_id', c).order('grupo_id').order('estudante_id'))
      for (const r of rows) estudantes.add(r.estudante_id as string)
    }
    return estudantes.size
  })
}

export interface MetricasEdicao {
  audiencia: number
  /** alunos distintos com leitura registrada do documento ligado (simulado_conteudo_leitura_progresso). null = edição sem documento. */
  abriram: number | null
  /** respostas dos alunos às V/F da edição na prática do Banco de Questões (simulado_respostas_avulsas). null = V/F não enviadas ao banco. */
  respondidas: number | null
  acertos: number | null
  /** % já calculadas no servidor de dados (null = sem base). */
  pctAbriram: number | null
  pctAcerto: number | null
}

export async function metricasEdicao(tenantId: string, e: Pick<EdicaoRow, 'id' | 'todos' | 'documento_id'>): Promise<MetricasEdicao> {
  const { remember } = await import('@/lib/cache/relatorio-cache')
  return remember(`jurisclub:metricas:${tenantId}:${e.id}`, 120, async () => {
    const svc = createAdminClient()
    const grupos = e.todos ? [] : await gruposDaEdicao(tenantId, e.id)
    const [audiencia, abriram, resp] = await Promise.all([
      e.todos ? alunosComJurisclub(tenantId) : alunosDosGrupos(tenantId, grupos),
      (async () => {
        if (!e.documento_id) return null
        const rows = await fetchAll<any>(() => svc.from('simulado_conteudo_leitura_progresso').select('aluno_id').eq('tenant_id', tenantId).eq('documento_id', e.documento_id as string).order('aluno_id'))
        return new Set(rows.map((r: any) => r.aluno_id as string)).size
      })(),
      (async () => {
        const qs = await fetchAll<any>(() => svc.from('jurisclub_questoes').select('id').eq('tenant_id', tenantId).eq('edicao_id', e.id).order('id'))
        if (!qs.length) return null
        const ext = qs.map((q: any) => `jurisclub-${q.id}`)
        const bank = await fetchAllByIn<any>(ext, (c) => svc.from('simulado_questoes').select('id, external_id').eq('tenant_id', tenantId).in('external_id', c).order('id'))
        if (!bank.length) return null
        const ids = bank.map((b: any) => b.id as string)
        let total = 0, certas = 0
        for (let i = 0; i < ids.length; i += 80) {
          const c = ids.slice(i, i + 80)
          const [t, ok] = await Promise.all([
            svc.from('simulado_respostas_avulsas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('questao_id', c),
            svc.from('simulado_respostas_avulsas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('correta', true).in('questao_id', c),
          ])
          total += t.count ?? 0; certas += ok.count ?? 0
        }
        return { total, certas }
      })(),
    ])
    const respondidas = resp ? resp.total : null
    const acertos = resp ? resp.certas : null
    return {
      audiencia, abriram, respondidas, acertos,
      pctAbriram: abriram != null && audiencia > 0 ? Math.min(100, Math.round((abriram / audiencia) * 100)) : null,
      pctAcerto: respondidas && acertos != null ? Math.round((acertos / respondidas) * 100) : null,
    }
  })
}

/** Disciplinas da taxonomia do tenant (sugestões nos campos de disciplina). */
export async function disciplinasTenant(tenantId: string): Promise<string[]> {
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId).order('nome').order('id')).catch(() => [])
  return [...new Set(rows.map((r: any) => String(r.nome)))]
}
