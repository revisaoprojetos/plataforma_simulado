import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hojeISO } from '@/lib/cronograma/datas'
import { getGamConfig, gamAtivaParaAluno } from '@/lib/gamificacao'
import { resumoGamificacao, conquistasDoAluno, posicaoNaLiga } from '@/lib/gamificacao/leitura'
import { montarRelatorioEstudante } from '@/app/admin/relatorios/estudantes/_dados'
import { montarPerfilAnalytics } from '@/lib/aluno/perfil-analytics'

// PERFIL — serviço backend (backend-first). TODA a computação pesada do "Perfil e conquistas"
// vive aqui (session-independent: roda do render-miss, da escrita e do worker). A página só LÊ o snapshot.
// Migração: supabase/migrations/20261028050000_perfil_snapshot.sql. Ver docs/ARQUITETURA-BACKEND-FIRST.md.

const T = 'simulado_perfil_snapshot'

export type PerfilCarimbo = { c: string; icon: string }
export type PerfilStat = { v: string; l: string; icon: string }
export type PerfilDados = {
  nome: string
  temGam: boolean
  nivel: number | null
  prog: { pct: number; titulo: string; xpNoNivel: number; xpDoNivel: number } | null
  liga: { nome: string } | null
  posicao: number | null
  streakAtual: number
  streakMaior: number
  xpSemana: number
  xpTotal: number
  carimbos: PerfilCarimbo[]
  carimbosExtra: number
  stats: PerfilStat[]
  resumoSemana: [string, string][]
}

const VAZIO: PerfilDados = {
  nome: 'Aluno', temGam: false, nivel: null, prog: null, liga: null, posicao: null,
  streakAtual: 0, streakMaior: 0, xpSemana: 0, xpTotal: 0,
  carimbos: [], carimbosExtra: 0, stats: [], resumoSemana: [],
}

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const fmtNota = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
const fmtHoras = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min` }

// icone (lucide, vindo das conquistas) → nome de ícone da nova plataforma (fallback 'star').
const ICONE_MAP: Record<string, string> = {
  flame: 'flame', trophy: 'trophy', star: 'star', crown: 'trophy', shield: 'shield', target: 'target',
  medal: 'trophy', rocket: 'bolt', zap: 'bolt', gem: 'layers', sparkles: 'star', award: 'star',
  'book-open': 'book', 'book-marked': 'book', book: 'book', graduation: 'book',
}
const COR_CICLO = ['var(--danger)', 'var(--gold)', 'var(--ok)', '#2F5BD3', 'var(--brand)']
// Carimbos de exemplo (só quando a gamificação está inativa ou sem conquistas desbloqueadas).
const CARIMBOS_EXEMPLO: PerfilCarimbo[] = [
  { c: 'var(--danger)', icon: 'flame' }, { c: 'var(--gold)', icon: 'star' },
  { c: 'var(--ok)', icon: 'trophy' }, { c: '#2F5BD3', icon: 'book' }, { c: 'var(--brand)', icon: 'bolt' },
]

/** COMPUTA o perfil (pesado). Session-independent — nunca chamado no render do caminho rápido. */
export async function computarPerfil(svc: SupabaseClient, tenantId: string, estId: string): Promise<PerfilDados> {
  if (!tenantId || !estId) return VAZIO

  const gamConfig = await getGamConfig(svc, tenantId)
  const gamAtivo = await gamAtivaParaAluno(svc, tenantId, estId, gamConfig)

  const [est, rel, gamResumo, conquistas] = await Promise.all([
    svc.from('simulado_estudantes').select('nome').eq('id', estId).maybeSingle().then((r) => r.data as { nome?: string } | null),
    montarRelatorioEstudante(svc, estId, tenantId),
    gamAtivo ? resumoGamificacao(svc, tenantId, estId, gamConfig!) : Promise.resolve(null),
    gamAtivo ? conquistasDoAluno(svc, tenantId, estId, gamConfig!) : Promise.resolve([]),
  ])

  const pos = gamResumo ? await posicaoNaLiga(svc, tenantId, gamResumo.liga.id, gamResumo.xpTotal) : null

  // Analytics (resumo da semana) — mesmo motor da tela Desempenho.
  const analytics = await montarPerfilAnalytics(svc, estId, tenantId, {
    porDisciplina: rel?.porDisciplina ?? [], notaMedia: rel?.notaMedia ?? null, acertoMedio: rel?.acertoMedio ?? null, turmaNota: null, posicaoPercentil: null,
  })

  const nome = est?.nome ?? 'Aluno'
  const prog = gamResumo?.progresso ?? null
  const nivel = gamResumo?.nivel ?? prog?.nivel ?? null

  // Carimbos (conquistas desbloqueadas reais) → bolinhas do cabeçalho; fallback de exemplo quando vazio.
  const desbloqueadas = (conquistas ?? []).filter((c) => c.desbloqueada)
  const carimbos: PerfilCarimbo[] = desbloqueadas.length
    ? desbloqueadas.slice(0, 5).map((c, i) => ({ c: c.def.cor || COR_CICLO[i % COR_CICLO.length], icon: ICONE_MAP[c.def.icone] ?? 'star' }))
    : CARIMBOS_EXEMPLO
  const carimbosExtra = Math.max(0, desbloqueadas.length - 5)

  // Indicadores (REAL): relatório do estudante + XP do mês (gamificação).
  const stats: PerfilStat[] = [
    { v: fmtInt(rel?.simulados ?? 0), l: 'Simulados feitos', icon: 'clip' },
    { v: fmtNota(rel?.notaMedia), l: 'Nota média', icon: 'star' },
    { v: rel?.acertoMedio != null ? `${rel.acertoMedio}%` : '—', l: 'Acerto médio', icon: 'target' },
    { v: rel?.tempoMedioMin != null ? `${fmtInt(rel.tempoMedioMin)} min` : '—', l: 'Tempo médio', icon: 'clock' },
    { v: fmtNota(rel?.melhorNota), l: 'Melhor nota', icon: 'trophy' },
    { v: gamResumo ? fmtInt(gamResumo.xpMes) : '—', l: 'XP este mês', icon: 'bolt' },
  ]

  // Resumo da semana (REAL): tempo/simulados do analytics + XP da semana da gamificação.
  const rs = analytics?.resumoSemana ?? null
  const resumoSemana: [string, string][] = [
    [rs ? fmtHoras(rs.tempoMin) : '—', 'estudadas'],
    [rs ? fmtInt(rs.simulados) : '—', 'simulados'],
    [gamResumo ? `+${fmtInt(gamResumo.xpSemana)}` : '—', 'XP'],
  ]

  return {
    nome, temGam: !!gamResumo, nivel,
    prog: prog ? { pct: prog.pct, titulo: prog.titulo, xpNoNivel: prog.xpNoNivel, xpDoNivel: prog.xpDoNivel } : null,
    liga: gamResumo ? { nome: gamResumo.liga.nome } : null,
    posicao: pos,
    streakAtual: gamResumo?.streakAtual ?? 0,
    streakMaior: gamResumo?.streakMaior ?? 0,
    xpSemana: gamResumo?.xpSemana ?? 0,
    xpTotal: gamResumo?.xpTotal ?? 0,
    carimbos, carimbosExtra, stats, resumoSemana,
  }
}

/** LÊ o perfil (caminho rápido): 1 linha pronta. Só computa se não houver snapshot ou se o dia virou. */
export async function carregarPerfil(svc: SupabaseClient, tenantId: string, estId: string): Promise<PerfilDados> {
  if (!tenantId || !estId) return VAZIO
  const hoje = hojeISO()
  try {
    const { data } = await svc.from(T).select('dia, dados').eq('tenant_id', tenantId).eq('estudante_id', estId).maybeSingle()
    const row = data as { dia?: string; dados?: PerfilDados } | null
    if (row && row.dia === hoje && row.dados) return row.dados
  } catch { /* tabela ausente (sem migração) → computa direto */ }
  const dados = await computarPerfil(svc, tenantId, estId)
  try {
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dia: hoje, dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* snapshot best-effort */ }
  return dados
}

/** WRITE-BEHIND: recomputa e grava o snapshot (chamado nas ações que mudam o perfil). */
export async function atualizarPerfilSnapshot(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  if (!tenantId || !estId) return
  try {
    const dados = await computarPerfil(svc, tenantId, estId)
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dia: hojeISO(), dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* best-effort */ }
}

/** STALE-MARK: marca o snapshot como DESATUALIZADO (1 UPDATE leve, SEM recompute) — a PRÓXIMA leitura
 * (read-through de `carregarPerfil`) recomputa, pois `dia` deixa de ser hoje. Usado nos hot paths de
 * PRÁTICA (banco de questões / prática pessoal), onde o write-behind pesado seria proibitivo.
 * Best-effort; no-op se a linha não existe (read-through computa do zero) ou se já está stale (`neq`). */
export async function marcarPerfilDesatualizado(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  if (!tenantId || !estId) return
  try {
    await svc.from(T).update({ dia: '2000-01-01' }).eq('tenant_id', tenantId).eq('estudante_id', estId).neq('dia', '2000-01-01')
  } catch { /* best-effort (tabela ausente/sem migração) → próxima leitura computa */ }
}
