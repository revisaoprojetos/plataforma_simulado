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

export { inicioDaSemanaISO, inicioDoMesISO }
