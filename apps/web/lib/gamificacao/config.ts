import { cache } from 'react'

// Tipos da CONFIG de gamificação (espelham o JSONB de simulado_gamificacao_config).
export interface XpRegras {
  simulado: { base: number; por_acerto: number; bonus_nota_max: number }
  pratica: { por_acerto: number; bonus_disc_fraca: number }
  streak: { por_dia: number; cap: number }
  chest: { cada_n_dias: number; xp: number }
}
export interface NivelCurva { tipo: string; base: number; incremento: number; nivel_max: number }
export interface LigaDef { id: string; nome: string; xp_min: number; cor: string }
export type MissaoTipo = 'finalizar_simulado' | 'acertar_n' | 'praticar_n'
export interface MissaoDef { id: string; titulo: string; tipo: MissaoTipo; meta: number; xp: number }
export type ConquistaRegraTipo = 'xp_total' | 'streak' | 'simulados_concluidos' | 'nota_max'
export interface ConquistaDef { id: string; titulo: string; descricao: string; icone: string; regra: { tipo: ConquistaRegraTipo; meta: number }; xp: number }

export interface GamConfig {
  tenantId: string
  ativo: boolean
  timezone: string
  xp_regras: XpRegras
  nivel_curva: NivelCurva
  ligas: LigaDef[]
  missoes_def: MissaoDef[]
  conquistas_def: ConquistaDef[]
}

// Defaults — ESPELHAM o seed da migração 20260812000001_gamificacao.sql. Usados como fallback
// quando a config do tenant ainda não existe/está incompleta e no "restaurar padrões" do admin.
export const DEFAULT_XP_REGRAS: XpRegras = {
  simulado: { base: 20, por_acerto: 2, bonus_nota_max: 30 },
  pratica: { por_acerto: 5, bonus_disc_fraca: 3 },
  streak: { por_dia: 10, cap: 50 },
  chest: { cada_n_dias: 7, xp: 100 },
}
export const DEFAULT_NIVEL_CURVA: NivelCurva = { tipo: 'formula', base: 100, incremento: 40, nivel_max: 30 }
export const DEFAULT_LIGAS: LigaDef[] = [
  { id: 'bronze', nome: 'Bronze', xp_min: 0, cor: '#a16207' },
  { id: 'prata', nome: 'Prata', xp_min: 500, cor: '#94a3b8' },
  { id: 'ouro', nome: 'Ouro', xp_min: 1500, cor: '#f59e0b' },
  { id: 'safira', nome: 'Safira', xp_min: 3000, cor: '#0ea5e9' },
  { id: 'diamante', nome: 'Diamante', xp_min: 5000, cor: '#8b5cf6' },
]
export const DEFAULT_MISSOES: MissaoDef[] = [
  { id: 'm_simulado', titulo: 'Complete 1 simulado', tipo: 'finalizar_simulado', meta: 1, xp: 30 },
  { id: 'm_acertos', titulo: 'Acerte 20 questões', tipo: 'acertar_n', meta: 20, xp: 20 },
  { id: 'm_pratica', titulo: 'Pratique 10 questões', tipo: 'praticar_n', meta: 10, xp: 15 },
]
export const DEFAULT_CONQUISTAS: ConquistaDef[] = [
  { id: 'c_primeiro', titulo: 'Primeiro simulado', descricao: 'Conclua seu primeiro simulado', icone: 'rocket', regra: { tipo: 'simulados_concluidos', meta: 1 }, xp: 20 },
  { id: 'c_streak7', titulo: 'Semana em chamas', descricao: 'Mantenha 7 dias de sequência', icone: 'flame', regra: { tipo: 'streak', meta: 7 }, xp: 50 },
  { id: 'c_1000xp', titulo: '1000 XP', descricao: 'Acumule 1000 XP', icone: 'zap', regra: { tipo: 'xp_total', meta: 1000 }, xp: 0 },
  { id: 'c_nota100', titulo: 'Nota 100', descricao: 'Tire 100 em um simulado', icone: 'trophy', regra: { tipo: 'nota_max', meta: 100 }, xp: 40 },
  { id: 'c_maratona', titulo: 'Maratonista', descricao: 'Conclua 20 simulados', icone: 'medal', regra: { tipo: 'simulados_concluidos', meta: 20 }, xp: 60 },
]

export const DEFAULT_CONFIG = {
  ativo: false,
  timezone: 'America/Sao_Paulo',
  xp_regras: DEFAULT_XP_REGRAS,
  nivel_curva: DEFAULT_NIVEL_CURVA,
  ligas: DEFAULT_LIGAS,
  missoes_def: DEFAULT_MISSOES,
  conquistas_def: DEFAULT_CONQUISTAS,
}

/**
 * Lê a config de gamificação do tenant, com fallback para os defaults (chave a chave).
 * Memoizado por request. Retorna null só se não houver tenant.
 * `svc` = client service-role (createServiceClient/createAdminClient).
 */
export const getGamConfig = cache(async (svc: any, tenantId: string | null): Promise<GamConfig | null> => {
  if (!tenantId) return null
  let row: any = null
  try {
    const { data } = await svc
      .from('simulado_gamificacao_config')
      .select('ativo, timezone, xp_regras, nivel_curva, ligas, missoes_def, conquistas_def')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    row = data
  } catch {
    // Tabela ainda não migrada → gamificação inerte.
    return { tenantId, ...DEFAULT_CONFIG, ativo: false }
  }
  const r = row ?? {}
  return {
    tenantId,
    ativo: r.ativo === true,
    timezone: r.timezone || DEFAULT_CONFIG.timezone,
    xp_regras: { ...DEFAULT_XP_REGRAS, ...(r.xp_regras ?? {}) },
    nivel_curva: { ...DEFAULT_NIVEL_CURVA, ...(r.nivel_curva ?? {}) },
    ligas: Array.isArray(r.ligas) && r.ligas.length ? r.ligas : DEFAULT_LIGAS,
    missoes_def: Array.isArray(r.missoes_def) ? r.missoes_def : DEFAULT_MISSOES,
    conquistas_def: Array.isArray(r.conquistas_def) ? r.conquistas_def : DEFAULT_CONQUISTAS,
  }
})
