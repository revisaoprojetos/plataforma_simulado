import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { hashCpf } from '@/lib/privacidade/cpf-cripto'
import { ContextoAluno, avaliarSegmentos } from '@/lib/segmentos/avaliar'
import type { AulaConsulta, ExcecaoConsulta, TrilhaAlunoRef } from '@/lib/produtos/liberacao-consulta-aluno'
import { lerAulasProduto, semTabela } from '../dados'
import type { AlunoOpcao, ExcecaoLinha, GrupoOpcao, ModuloOpcao } from './tipos-alunos'

// Leituras da aba Alunos/Exceções/Log. Só LEEM. Filtro/ordem/paginação no banco; sem N+1 (lotes de 80).
// Tolerante: sem as tabelas da migração devolve migrado=false.

type Svc = ReturnType<typeof createAdminClient>
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const termoSeguro = (s: string | undefined) => (s ?? '').replace(/[%,()*\\]/g, ' ').trim().slice(0, 80)

export interface TrilhaBase { id: string; nome: string; segmentoIds: string[]; ordem: number }
export interface BaseProduto {
  migradoPlanilha: boolean
  migradoTrilhas: boolean
  gateAtivo: boolean
  aulas: AulaConsulta[]
  modulos: ModuloOpcao[]
  trilhas: TrilhaBase[]
}

export async function carregarBase(svc: Svc, tenantId: string, produtoId: string): Promise<BaseProduto> {
  const [{ aulas }, cfgR, planR, trR] = await Promise.all([
    lerAulasProduto(svc, tenantId, produtoId),
    svc.from('simulado_produto_liberacao_cfg').select('ativo').eq('tenant_id', tenantId).eq('produto_id', produtoId).maybeSingle(),
    svc.from('simulado_produto_liberacao_aulas').select('id, aula_id, data_liberacao').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).not('aula_id', 'is', null).order('ordem', { ascending: true }).limit(5000),
    svc.from('simulado_liberacao_trilhas').select('id, nome, segmento_ids, offset_dias, ordem').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).order('ordem', { ascending: true }).order('nome', { ascending: true }),
  ])
  const migradoPlanilha = !semTabela(cfgR.error) && !semTabela(planR.error)
  const migradoTrilhas = !semTabela(trR.error)
  const planilha = new Map<string, { linhaId: string; data: string }>()
  for (const r of (planR.data ?? []) as any[]) if (r.aula_id && !planilha.has(r.aula_id)) planilha.set(r.aula_id, { linhaId: r.id, data: r.data_liberacao })
  const linhaParaAula = new Map<string, string>()
  for (const [aulaId, v] of planilha) linhaParaAula.set(v.linhaId, aulaId)

  const trilhasRaw = ((trR.data ?? []) as any[])
  const trilhas: TrilhaBase[] = trilhasRaw.map((t) => ({ id: t.id, nome: t.nome, segmentoIds: (t.segmento_ids ?? []) as string[], ordem: t.ordem ?? 0 }))
  const offset = new Map<string, number>(trilhasRaw.map((t) => [t.id, Number(t.offset_dias) || 0]))
  const porAula = new Map<string, Record<string, { data_cronograma: string | null; data_manual: string | null; offset_dias: number }>>()
  if (migradoTrilhas && trilhas.length) {
    const ta = await fetchAllByIn<any>(trilhas.map((t) => t.id), (ids) =>
      svc.from('simulado_liberacao_trilha_aulas').select('trilha_id, liberacao_aula_id, data_cronograma, data_manual').eq('tenant_id', tenantId).in('trilha_id', ids).order('id', { ascending: true }) as any).catch(() => [] as any[])
    for (const r of ta) {
      const aulaId = linhaParaAula.get(r.liberacao_aula_id)
      if (!aulaId) continue
      const m = porAula.get(aulaId) ?? {}
      m[r.trilha_id] = { data_cronograma: r.data_cronograma, data_manual: r.data_manual, offset_dias: offset.get(r.trilha_id) ?? 0 }
      porAula.set(aulaId, m)
    }
  }
  const consultas: AulaConsulta[] = aulas.map((a) => ({ id: a.id, titulo: a.titulo, moduloId: a.moduloId, disciplina: a.disciplina, dataPlanilha: planilha.get(a.id)?.data ?? null, porTrilha: porAula.get(a.id) ?? {} }))
  const mods = new Map<string, string>()
  for (const a of aulas) if (!mods.has(a.moduloId)) mods.set(a.moduloId, a.disciplina)
  return {
    migradoPlanilha, migradoTrilhas, gateAtivo: !!(cfgR.data as any)?.ativo, aulas: consultas, trilhas,
    modulos: [...mods].map(([id, titulo]) => ({ id, titulo })).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR')),
  }
}

/** Trilhas (do produto) em que UM aluno casa, avaliando os Segmentos (memo por contexto). */
export async function trilhasDoAluno(svc: Svc, tenantId: string, estudanteId: string, trilhas: TrilhaBase[]): Promise<TrilhaAlunoRef[]> {
  const segs = [...new Set(trilhas.flatMap((t) => t.segmentoIds))]
  if (!segs.length) return []
  const ctx = new ContextoAluno(svc, tenantId, estudanteId)
  const ok = await avaliarSegmentos(ctx, segs).catch(() => new Map<string, boolean>())
  return trilhas.filter((t) => t.segmentoIds.some((s) => ok.get(s))).map((t) => ({ id: t.id, nome: t.nome }))
}

/** Executa `fn` sobre `itens` com no máximo `n` em paralelo. */
export async function emLotes<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; out[k] = await fn(itens[k]) }
  }))
  return out
}

export async function listarAlunos(svc: Svc, tenantId: string, f: { q?: string; ord?: string; dir?: 'asc' | 'desc' }, pagina: number, pp: number): Promise<{ rows: AlunoOpcao[]; total: number }> {
  let q = svc.from('simulado_estudantes').select('id, nome, email', { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
  const termo = termoSeguro(f.q)
  if (termo) {
    const partes = [`nome.ilike.%${termo}%`, `email.ilike.%${termo}%`]
    const h = hashCpf(termo)
    if (h) partes.push(`cpf_hash.eq.${h}`)
    q = q.or(partes.join(','))
  }
  const col = f.ord === 'email' ? 'email' : 'nome'
  q = q.order(col, { ascending: f.dir !== 'desc' }).order('id', { ascending: true }).range((pagina - 1) * pp, pagina * pp - 1)
  const { data, count } = await q
  return { rows: ((data ?? []) as any[]).map((r) => ({ id: r.id, nome: r.nome ?? '(sem nome)', email: r.email ?? '' })), total: count ?? 0 }
}

export async function lerAluno(svc: Svc, tenantId: string, id: string): Promise<AlunoOpcao | null> {
  if (!UUID_RE.test(id)) return null
  const { data } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  const r = data as any
  return r ? { id: r.id, nome: r.nome ?? '(sem nome)', email: r.email ?? '' } : null
}

export async function listarGrupos(svc: Svc, tenantId: string): Promise<GrupoOpcao[]> {
  const { data } = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tenantId).order('nome', { ascending: true }).limit(2000)
  return ((data ?? []) as any[]).map((g) => ({ id: g.id, nome: g.nome ?? '(sem nome)' }))
}

/** Exceções que valem para cada aluno: as dele + as dos grupos (vigentes de participação) dele. */
export async function excecoesDosAlunos(svc: Svc, tenantId: string, produtoId: string, estudanteIds: string[]): Promise<{ migrado: boolean; porAluno: Map<string, ExcecaoConsulta[]> }> {
  const porAluno = new Map<string, ExcecaoConsulta[]>()
  if (!estudanteIds.length) return { migrado: true, porAluno }
  const cols = 'id, alvo_tipo, alvo_id, estudante_id, grupo_id, acao, motivo, expira_em, ativo'
  const proprias = await fetchAllByIn<any>(estudanteIds, (ids) =>
    svc.from('simulado_liberacao_excecoes').select(cols).eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).in('estudante_id', ids).order('id', { ascending: true }) as any).catch((e) => e)
  if (!Array.isArray(proprias)) return { migrado: !semTabela(proprias as any), porAluno }
  const agora = new Date().toISOString()
  const membros = await fetchAllByIn<any>(estudanteIds, (ids) =>
    svc.from('simulado_grupo_membros').select('estudante_id, grupo_id, expira_em').in('estudante_id', ids).order('grupo_id', { ascending: true }).order('estudante_id', { ascending: true }) as any).catch(() => [] as any[])
  const gruposDe = new Map<string, Set<string>>()
  for (const m of membros) { if (m.expira_em && m.expira_em < agora) continue; const s = gruposDe.get(m.estudante_id) ?? new Set(); s.add(m.grupo_id); gruposDe.set(m.estudante_id, s) }
  const grupoIds = [...new Set([...gruposDe.values()].flatMap((s) => [...s]))]
  const doGrupo = grupoIds.length ? await fetchAllByIn<any>(grupoIds, (ids) =>
    svc.from('simulado_liberacao_excecoes').select(cols).eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).in('grupo_id', ids).order('id', { ascending: true }) as any).catch(() => [] as any[]) : []
  const nomes = new Map<string, string>()
  const gids = [...new Set(doGrupo.map((e: any) => e.grupo_id))] as string[]
  if (gids.length) for (const g of await fetchAllByIn<any>(gids, (ids) => svc.from('simulado_grupos').select('id, nome').in('id', ids).order('id', { ascending: true }) as any).catch(() => [] as any[])) nomes.set(g.id, g.nome)
  const conv = (e: any, escopo: 'aluno' | 'grupo'): ExcecaoConsulta => ({ id: e.id, alvoTipo: e.alvo_tipo, alvoId: e.alvo_id, acao: e.acao, escopo, grupoNome: e.grupo_id ? nomes.get(e.grupo_id) ?? null : null, motivo: e.motivo, expiraEm: e.expira_em, ativo: !!e.ativo })
  const grupoExc = new Map<string, any[]>()
  for (const e of doGrupo) { const l = grupoExc.get(e.grupo_id) ?? []; l.push(e); grupoExc.set(e.grupo_id, l) }
  for (const id of estudanteIds) {
    const lista: ExcecaoConsulta[] = []
    for (const e of proprias) if (e.estudante_id === id) lista.push(conv(e, 'aluno'))
    for (const g of gruposDe.get(id) ?? []) for (const e of grupoExc.get(g) ?? []) lista.push(conv(e, 'grupo'))
    porAluno.set(id, lista)
  }
  return { migrado: true, porAluno }
}

// ───────────────────────────── nomes (alunos / grupos / admins) ─────────────────────────────

async function nomesAlunos(svc: Svc, tenantId: string, ids: string[]): Promise<Map<string, AlunoOpcao>> {
  const m = new Map<string, AlunoOpcao>()
  const u = [...new Set(ids.filter(Boolean))]
  if (!u.length) return m
  const rows = await fetchAllByIn<any>(u, (c) => svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true }) as any).catch(() => [] as any[])
  for (const r of rows) m.set(r.id, { id: r.id, nome: r.nome ?? '(sem nome)', email: r.email ?? '' })
  return m
}
async function nomesGrupos(svc: Svc, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  const u = [...new Set(ids.filter(Boolean))]
  if (!u.length) return m
  const rows = await fetchAllByIn<any>(u, (c) => svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true }) as any).catch(() => [] as any[])
  for (const r of rows) m.set(r.id, r.nome ?? '(sem nome)')
  return m
}
async function nomesAdmins(svc: Svc, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  await Promise.all([...new Set(ids.filter((x) => UUID_RE.test(x)))].slice(0, 60).map(async (uid) => {
    try {
      const { data } = await svc.auth.admin.getUserById(uid)
      const u = data?.user
      if (u) m.set(uid, ((u.user_metadata as any)?.nome as string) || u.email || '')
    } catch { /* ignora */ }
  }))
  return m
}

/** Ids de alunos cujo nome/e-mail/CPF casa com o termo (máx. 300). */
export async function idsAlunosPorBusca(svc: Svc, tenantId: string, termoBruto: string): Promise<string[]> {
  const termo = termoSeguro(termoBruto)
  if (!termo) return []
  const partes = [`nome.ilike.%${termo}%`, `email.ilike.%${termo}%`]
  const h = hashCpf(termo)
  if (h) partes.push(`cpf_hash.eq.${h}`)
  const { data } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', tenantId).eq('deletado', false).or(partes.join(',')).limit(300)
  return ((data ?? []) as any[]).map((r) => r.id)
}

// ───────────────────────────── exceções (lista paginada) ─────────────────────────────

export interface FiltrosExcecao { q?: string; alvo?: string; acao?: string; dest?: string; ativo?: string; vig?: string; ord?: string; dir?: 'asc' | 'desc'; aluno?: string }
const COLS_ORDEM_EXC: Record<string, string> = { criado: 'criado_em', validade: 'expira_em', acao: 'acao', alvo: 'alvo_tipo', ativo: 'ativo' }

export async function listarExcecoes(svc: Svc, tenantId: string, produtoId: string, f: FiltrosExcecao, pagina: number, pp: number, titulos: Map<string, string>): Promise<{ migrado: boolean; rows: ExcecaoLinha[]; total: number }> {
  let q = svc.from('simulado_liberacao_excecoes').select('id, alvo_tipo, alvo_id, estudante_id, grupo_id, acao, motivo, expira_em, ativo, criado_por, criado_em', { count: 'exact' }).eq('tenant_id', tenantId).eq('produto_id', produtoId)
  const agora = new Date().toISOString()
  if (f.alvo === 'aula' || f.alvo === 'modulo') q = q.eq('alvo_tipo', f.alvo)
  if (f.acao === 'liberar' || f.acao === 'bloquear') q = q.eq('acao', f.acao)
  if (f.dest === 'aluno') q = q.not('estudante_id', 'is', null)
  if (f.dest === 'grupo') q = q.not('grupo_id', 'is', null)
  if (f.ativo === 'sim') q = q.eq('ativo', true)
  if (f.ativo === 'nao') q = q.eq('ativo', false)
  if (f.vig === 'vigente') q = q.eq('ativo', true).or(`expira_em.is.null,expira_em.gt.${agora}`)
  if (f.vig === 'expirada') q = q.lte('expira_em', agora)
  if (f.aluno && UUID_RE.test(f.aluno)) q = q.eq('estudante_id', f.aluno)
  const termo = termoSeguro(f.q)
  if (termo) {
    const [alunos, grupos] = await Promise.all([
      idsAlunosPorBusca(svc, tenantId, termo),
      svc.from('simulado_grupos').select('id').eq('tenant_id', tenantId).ilike('nome', `%${termo}%`).limit(200),
    ])
    const gids = ((grupos.data ?? []) as any[]).map((g) => g.id)
    const partes = [`motivo.ilike.%${termo}%`]
    if (alunos.length) partes.push(`estudante_id.in.(${alunos.slice(0, 150).join(',')})`)
    if (gids.length) partes.push(`grupo_id.in.(${gids.slice(0, 100).join(',')})`)
    const alvosPorTitulo = [...titulos].filter(([, t]) => t.toLowerCase().includes(termo.toLowerCase())).map(([id]) => id).slice(0, 100)
    if (alvosPorTitulo.length) partes.push(`alvo_id.in.(${alvosPorTitulo.join(',')})`)
    q = q.or(partes.join(','))
  }
  const col = COLS_ORDEM_EXC[f.ord ?? ''] ?? 'criado_em'
  q = q.order(col, { ascending: f.ord ? f.dir !== 'desc' : false, nullsFirst: false }).order('id', { ascending: true }).range((pagina - 1) * pp, pagina * pp - 1)
  const { data, count, error } = await q
  if (semTabela(error)) return { migrado: false, rows: [], total: 0 }
  const raw = (data ?? []) as any[]
  const [alunos, grupos, admins] = await Promise.all([
    nomesAlunos(svc, tenantId, raw.map((r) => r.estudante_id)),
    nomesGrupos(svc, tenantId, raw.map((r) => r.grupo_id)),
    nomesAdmins(svc, raw.map((r) => r.criado_por)),
  ])
  const rows: ExcecaoLinha[] = raw.map((r) => {
    const al = r.estudante_id ? alunos.get(r.estudante_id) : null
    return {
      id: r.id, alvoTipo: r.alvo_tipo, alvoId: r.alvo_id, alvoTitulo: titulos.get(r.alvo_id) ?? '(removido)',
      estudanteId: r.estudante_id, grupoId: r.grupo_id,
      destinoNome: r.estudante_id ? al?.nome ?? '(aluno removido)' : grupos.get(r.grupo_id) ?? '(grupo removido)',
      destinoSub: r.estudante_id ? al?.email ?? '' : 'Grupo',
      acao: r.acao, motivo: r.motivo, expiraEm: r.expira_em, ativo: !!r.ativo, vigente: !!r.ativo && (!r.expira_em || r.expira_em > agora),
      criadoPor: r.criado_por ? admins.get(r.criado_por) || String(r.criado_por).slice(0, 8) : '—', criadoEm: r.criado_em,
    }
  })
  return { migrado: true, rows, total: count ?? 0 }
}

// ───────────────────────────── log ─────────────────────────────

export interface FiltrosLog { origem?: string; acao?: string; de?: string; ate?: string; q?: string; ord?: string; dir?: 'asc' | 'desc' }
export interface LogLinha { id: string; origem: string; acao: string; alvoTipo: string | null; alvoTitulo: string; aluno: string; feitoPor: string; criadoEm: string; detalhe: unknown }
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

export async function listarLog(svc: Svc, tenantId: string, produtoId: string, f: FiltrosLog, pagina: number, pp: number, titulos: Map<string, string>): Promise<{ migrado: boolean; rows: LogLinha[]; total: number; acoes: string[] }> {
  let q = svc.from('simulado_liberacao_log').select('id, origem, acao, alvo_tipo, alvo_id, estudante_id, detalhe, feito_por, criado_em', { count: 'exact' }).eq('tenant_id', tenantId).eq('produto_id', produtoId)
  if (f.origem && ['manual', 'automatico', 'importacao'].includes(f.origem)) q = q.eq('origem', f.origem)
  if (f.acao) q = q.eq('acao', f.acao.slice(0, 60))
  if (f.de && DATA_RE.test(f.de)) q = q.gte('criado_em', `${f.de}T00:00:00-03:00`)
  if (f.ate && DATA_RE.test(f.ate)) q = q.lte('criado_em', `${f.ate}T23:59:59-03:00`)
  const termo = termoSeguro(f.q)
  if (termo) {
    const ids = await idsAlunosPorBusca(svc, tenantId, termo)
    q = ids.length ? q.in('estudante_id', ids.slice(0, 150)) : q.eq('estudante_id', '00000000-0000-0000-0000-000000000000')
  }
  q = q.order(f.ord === 'acao' ? 'acao' : f.ord === 'origem' ? 'origem' : 'criado_em', { ascending: f.ord ? f.dir !== 'desc' : false }).order('id', { ascending: true }).range((pagina - 1) * pp, pagina * pp - 1)
  const { data, count, error } = await q
  if (semTabela(error)) return { migrado: false, rows: [], total: 0, acoes: [] }
  const raw = (data ?? []) as any[]
  const [alunos, admins, acoesR] = await Promise.all([
    nomesAlunos(svc, tenantId, raw.map((r) => r.estudante_id)),
    nomesAdmins(svc, raw.map((r) => r.feito_por)),
    svc.from('simulado_liberacao_log').select('acao').eq('tenant_id', tenantId).eq('produto_id', produtoId).order('criado_em', { ascending: false }).limit(500),
  ])
  const acoes = [...new Set(((acoesR.data ?? []) as any[]).map((a) => a.acao as string))].sort()
  const rows: LogLinha[] = raw.map((r) => ({
    id: r.id, origem: r.origem, acao: r.acao, alvoTipo: r.alvo_tipo, alvoTitulo: r.alvo_id ? titulos.get(r.alvo_id) ?? '' : '',
    aluno: r.estudante_id ? alunos.get(r.estudante_id)?.nome ?? '(aluno removido)' : '—',
    feitoPor: r.feito_por ? admins.get(r.feito_por) || String(r.feito_por).slice(0, 8) : r.origem === 'manual' ? '—' : 'Sistema',
    criadoEm: r.criado_em, detalhe: r.detalhe,
  }))
  return { migrado: true, rows, total: count ?? 0, acoes }
}

