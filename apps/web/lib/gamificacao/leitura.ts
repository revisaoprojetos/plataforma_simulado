import { getGamConfig, type GamConfig, type LigaDef, type MissaoDef, type ConquistaDef } from './config'
import { progressoNivel, ligaParaXp, proximaLiga, type ProgressoNivel } from './niveis'
import { missoesDoDia } from './rodizio'
import { diaLocal, inicioDaSemanaISO, inicioDoMesISO } from './datas'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'

// ─────────── RESUMO (hero do portal) ───────────
export interface ResumoGamificacao {
  ativo: boolean
  xpTotal: number
  nivel: number
  progresso: ProgressoNivel
  liga: LigaDef
  proxima: LigaDef | null
  streakAtual: number
  streakMaior: number
  xpSemana: number
  xpMes: number
  xpHoje: number
  metaDiaXp: number
}

async function somaPeriodo(svc: any, tenantId: string, estudanteId: string, desdeISO: string): Promise<number> {
  const { data } = await svc
    .from('simulado_xp_eventos')
    .select('xp')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    .gte('criado_em', desdeISO)
    .limit(1000)
  return ((data ?? []) as any[]).reduce((a, r) => a + (Number(r.xp) || 0), 0)
}

/** Resumo de gamificação do aluno para o hero (cache + XP semana/mês). Retorna null se inativo. */
export async function resumoGamificacao(svc: any, tenantId: string, estudanteId: string, cfg?: GamConfig | null): Promise<ResumoGamificacao | null> {
  const config = cfg ?? (await getGamConfig(svc, tenantId))
  if (!config?.ativo) return null
  const { data: row } = await svc
    .from('simulado_gamificacao_estudante')
    .select('xp_total, nivel, liga, streak_atual, streak_maior')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    .maybeSingle()
  const xpTotal = row?.xp_total ?? 0
  const [xpSemana, xpMes, xpHoje] = await Promise.all([
    somaPeriodo(svc, tenantId, estudanteId, inicioDaSemanaISO()),
    somaPeriodo(svc, tenantId, estudanteId, inicioDoMesISO()),
    svc.rpc('rpc_xp_dia', { p_tenant: tenantId, p_estudante: estudanteId, p_tz: config.timezone }).then((r: any) => Number(r?.data ?? 0)).catch(() => 0),
  ])
  return {
    ativo: true,
    xpTotal,
    nivel: row?.nivel ?? 1,
    progresso: progressoNivel(xpTotal, config.nivel_curva),
    liga: ligaParaXp(xpTotal, config.ligas),
    proxima: proximaLiga(xpTotal, config.ligas),
    streakAtual: row?.streak_atual ?? 0,
    streakMaior: row?.streak_maior ?? 0,
    xpSemana,
    xpMes,
    xpHoje,
    metaDiaXp: config.xp_regras.meta_dia?.xp ?? 0,
  }
}

// ─────────── MISSÕES DE HOJE ───────────
export interface MissaoView { def: MissaoDef; progresso: number; completa: boolean }

export async function missoesHoje(svc: any, tenantId: string, estudanteId: string, cfg?: GamConfig | null): Promise<MissaoView[]> {
  const config = cfg ?? (await getGamConfig(svc, tenantId))
  if (!config?.ativo) return []
  const hoje = diaLocal(config.timezone)
  const { data } = await svc
    .from('simulado_missao_progresso')
    .select('missao_id, progresso, completa')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('dia', hoje)
  const porId = new Map<string, any>((data ?? []).map((r: any) => [r.missao_id, r]))
  return missoesDoDia(config.missoes_def ?? [], config.missoes_config, hoje).map((def) => {
    const p = porId.get(def.id)
    return { def, progresso: Math.min(p?.progresso ?? 0, def.meta), completa: p?.completa ?? false }
  })
}

// ─────────── CONQUISTAS ───────────
export interface ConquistaView { def: ConquistaDef; desbloqueada: boolean; desbloqueadoEm: string | null }

export async function conquistasDoAluno(svc: any, tenantId: string, estudanteId: string, cfg?: GamConfig | null): Promise<ConquistaView[]> {
  const config = cfg ?? (await getGamConfig(svc, tenantId))
  if (!config?.ativo) return []
  const { data } = await svc
    .from('simulado_conquista_desbloqueios')
    .select('conquista_id, desbloqueado_em')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
  const porId = new Map<string, string>((data ?? []).map((r: any) => [r.conquista_id, r.desbloqueado_em]))
  return (config.conquistas_def ?? []).map((def) => ({
    def,
    desbloqueada: porId.has(def.id),
    desbloqueadoEm: porId.get(def.id) ?? null,
  }))
}

// ─────────── LEADERBOARDS ───────────
export interface RankingItem { estudanteId: string; nome: string; xp: number; posicao: number; eu: boolean }

async function nomesDe(svc: any, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const rows = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_estudantes').select('id, nome').in('id', chunk).order('id'))
  return new Map(rows.map((r) => [r.id, r.nome as string]))
}

/** Leaderboard por XP TOTAL dentro de uma liga (tier). */
export async function leaderboardLiga(svc: any, tenantId: string, liga: string, eu: string, limite = 20): Promise<RankingItem[]> {
  const { data } = await svc
    .from('simulado_gamificacao_estudante')
    .select('estudante_id, xp_total')
    .eq('tenant_id', tenantId).eq('liga', liga)
    .order('xp_total', { ascending: false })
    .limit(limite)
  const rows = (data ?? []) as any[]
  const nomes = await nomesDe(svc, rows.map((r) => r.estudante_id))
  return rows.map((r, i) => ({ estudanteId: r.estudante_id, nome: nomes.get(r.estudante_id) ?? 'Aluno', xp: r.xp_total, posicao: i + 1, eu: r.estudante_id === eu }))
}

/** Posição do aluno dentro da sua liga (por XP total). */
export async function posicaoNaLiga(svc: any, tenantId: string, liga: string, xpTotal: number): Promise<number> {
  const { count } = await svc
    .from('simulado_gamificacao_estudante')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('liga', liga)
    .gt('xp_total', xpTotal)
  return (count ?? 0) + 1
}

/** Leaderboard por XP num PERÍODO (semana/mês) via RPC — janela derivada de now(), sem reset. */
export async function rankingPeriodo(svc: any, tenantId: string, desdeISO: string, eu: string, limite = 20): Promise<RankingItem[]> {
  const { data } = await svc.rpc('rpc_xp_ranking_periodo', { p_tenant: tenantId, p_desde: desdeISO })
  const rows = ((data ?? []) as any[]).slice(0, limite)
  const nomes = await nomesDe(svc, rows.map((r) => r.estudante_id))
  return rows.map((r, i) => ({ estudanteId: r.estudante_id, nome: nomes.get(r.estudante_id) ?? 'Aluno', xp: Number(r.xp), posicao: i + 1, eu: r.estudante_id === eu }))
}

/**
 * Recorta o ranking para exibir no máximo 10 linhas: se o aluno está no top 10, mostra o top 10;
 * se não, mostra os 9 primeiros e o próprio aluno no lugar do 10º (mantendo a posição real).
 */
export function top10ComVoce(itens: RankingItem[], euId: string): RankingItem[] {
  if (itens.length <= 10) return itens
  const euIdx = itens.findIndex((i) => i.estudanteId === euId)
  if (euIdx < 0) return itens.slice(0, 10) // aluno sem posição → só o top 10
  if (euIdx < 10) return itens.slice(0, 10)
  return [...itens.slice(0, 9), itens[euIdx]]
}

// ─────────── PROGRESSO DAS CONQUISTAS (barras) ───────────
export interface ConquistaProgresso { def: ConquistaDef; atual: number; meta: number; pct: number; desbloqueada: boolean }

export async function conquistasProgresso(svc: any, tenantId: string, estudanteId: string, cfg?: GamConfig | null): Promise<ConquistaProgresso[]> {
  const config = cfg ?? (await getGamConfig(svc, tenantId))
  if (!config?.ativo) return []
  const defs = config.conquistas_def ?? []
  if (!defs.length) return []
  const [cacheRes, desbRes, sessRes] = await Promise.all([
    svc.from('simulado_gamificacao_estudante').select('xp_total, streak_atual').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).maybeSingle(),
    svc.from('simulado_conquista_desbloqueios').select('conquista_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId),
    svc.from('simulado_sessoes_prova').select('simulado_id, nota').eq('estudante_id', estudanteId).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false),
  ])
  const unlocked = new Set((desbRes.data ?? []).map((r: any) => r.conquista_id))
  const sess = (sessRes.data ?? []) as any[]
  const simConcl = new Set(sess.map((s) => s.simulado_id)).size
  const notaMax = sess.reduce((m, s) => Math.max(m, s.nota != null ? Number(s.nota) : 0), 0)
  const stat = (t?: string) => t === 'xp_total' ? (cacheRes.data?.xp_total ?? 0) : t === 'streak' ? (cacheRes.data?.streak_atual ?? 0) : t === 'simulados_concluidos' ? simConcl : t === 'nota_max' ? Math.round(notaMax) : 0
  const out: ConquistaProgresso[] = defs.map((d) => {
    const atual = stat(d.regra?.tipo)
    const meta = d.regra?.meta ?? 1
    return { def: d, atual: Math.min(atual, meta), meta, pct: meta ? Math.min(100, Math.round((atual / meta) * 100)) : 0, desbloqueada: unlocked.has(d.id) }
  })
  const rank = (x: ConquistaProgresso) => (x.desbloqueada ? 2 : x.pct > 0 ? 0 : 1)
  out.sort((a, b) => (rank(a) !== rank(b) ? rank(a) - rank(b) : b.pct - a.pct))
  return out
}

// ─────────── ATIVIDADE DA SEMANA (calendário de sequência) ───────────
export interface DiaAtivo { dia: string; label: string; ativo: boolean; hoje: boolean }
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Últimos 7 dias (na tz do tenant) marcando quais tiveram atividade (evento de XP). */
export async function atividadeSemana(svc: any, tenantId: string, estudanteId: string, tz: string): Promise<DiaAtivo[]> {
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString()
  let ativos = new Set<string>()
  try {
    const { data } = await svc.from('simulado_xp_eventos').select('criado_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).gte('criado_em', desde).limit(1000)
    ativos = new Set((data ?? []).map((r: any) => diaLocal(tz, new Date(r.criado_em))))
  } catch { /* tolerante */ }
  const hoje = diaLocal(tz)
  const out: DiaAtivo[] = []
  for (let i = 6; i >= 0; i--) {
    const dia = diaLocal(tz, new Date(Date.now() - i * 86_400_000))
    const dow = new Date(dia + 'T00:00:00Z').getUTCDay()
    out.push({ dia, label: DOW[dow], ativo: ativos.has(dia), hoje: dia === hoje })
  }
  return out
}

export { inicioDaSemanaISO, inicioDoMesISO }
