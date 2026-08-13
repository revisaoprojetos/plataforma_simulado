import { cache } from 'react'

// Tipos da CONFIG de gamificação (espelham o JSONB de simulado_gamificacao_config).
export interface XpRegras {
  simulado: { base: number; por_acerto: number; bonus_nota_max: number }
  pratica: { por_acerto: number; bonus_disc_fraca: number }
  streak: { por_dia: number; cap: number; tolerancia_dias: number }
  chest: { cada_n_dias: number; xp: number }
  fim_semana: { ativo: boolean; multiplicador: number }
  meta_dia: { xp: number; bonus: number }
}
/** Cargo/título exibido a partir de um nível (ex.: nível 6+ = "Júnior"). */
export interface TituloNivel { nivel_min: number; titulo: string }
export interface NivelCurva { tipo: string; base: number; incremento: number; nivel_max: number; titulos: TituloNivel[] }
export interface LigaDef { id: string; nome: string; xp_min: number; cor: string }
export type MissaoTipo = 'finalizar_simulado' | 'acertar_n' | 'praticar_n'
export interface MissaoDef { id: string; titulo: string; tipo: MissaoTipo; meta: number; xp: number; ativa?: boolean }
/** Como as missões aparecem por dia: 'todas' as ativas, ou 'rodizio' de N por dia. */
export interface MissoesConfig { modo: 'todas' | 'rodizio'; por_dia: number }
export type ConquistaRegraTipo = 'xp_total' | 'streak' | 'simulados_concluidos' | 'nota_max'
export interface ConquistaDef { id: string; titulo: string; descricao: string; icone: string; cor?: string; regra: { tipo: ConquistaRegraTipo; meta: number }; xp: number }

export type TrilhaEstilo = 'cards' | 'caminho'
export interface GamConfig {
  tenantId: string
  ativo: boolean
  timezone: string
  trilha_estilo: TrilhaEstilo
  trilha_visiveis: number
  xp_regras: XpRegras
  nivel_curva: NivelCurva
  ligas: LigaDef[]
  missoes_def: MissaoDef[]
  missoes_config: MissoesConfig
  conquistas_def: ConquistaDef[]
}

// Defaults — ESPELHAM o seed da migração 20260812000001_gamificacao.sql. Usados como fallback
// quando a config do tenant ainda não existe/está incompleta e no "restaurar padrões" do admin.
export const DEFAULT_XP_REGRAS: XpRegras = {
  simulado: { base: 20, por_acerto: 2, bonus_nota_max: 30 },
  pratica: { por_acerto: 5, bonus_disc_fraca: 3 },
  streak: { por_dia: 10, cap: 50, tolerancia_dias: 0 },
  chest: { cada_n_dias: 7, xp: 100 },
  fim_semana: { ativo: false, multiplicador: 2 },
  meta_dia: { xp: 50, bonus: 0 },
}
export const DEFAULT_TITULOS: TituloNivel[] = [
  { nivel_min: 1, titulo: 'Aprendiz' },
  { nivel_min: 3, titulo: 'Estagiário' },
  { nivel_min: 6, titulo: 'Júnior' },
  { nivel_min: 10, titulo: 'Pleno' },
  { nivel_min: 14, titulo: 'Sênior' },
  { nivel_min: 18, titulo: 'Procurador' },
  { nivel_min: 22, titulo: 'Promotor' },
  { nivel_min: 26, titulo: 'Advogado' },
  { nivel_min: 30, titulo: 'Mestre do Direito' },
]
export const DEFAULT_NIVEL_CURVA: NivelCurva = { tipo: 'formula', base: 100, incremento: 40, nivel_max: 30, titulos: DEFAULT_TITULOS }
export const DEFAULT_LIGAS: LigaDef[] = [
  { id: 'bronze', nome: 'Bronze', xp_min: 0, cor: '#a16207' },
  { id: 'prata', nome: 'Prata', xp_min: 500, cor: '#94a3b8' },
  { id: 'ouro', nome: 'Ouro', xp_min: 1500, cor: '#f59e0b' },
  { id: 'safira', nome: 'Safira', xp_min: 3000, cor: '#0ea5e9' },
  { id: 'diamante', nome: 'Diamante', xp_min: 5000, cor: '#8b5cf6' },
]
export const DEFAULT_MISSOES: MissaoDef[] = [
  { id: 'm_simulado', titulo: 'Complete 1 simulado', tipo: 'finalizar_simulado', meta: 1, xp: 30, ativa: true },
  { id: 'm_simulado2', titulo: 'Complete 2 simulados', tipo: 'finalizar_simulado', meta: 2, xp: 50, ativa: true },
  { id: 'm_acertos10', titulo: 'Acerte 10 questões', tipo: 'acertar_n', meta: 10, xp: 10, ativa: true },
  { id: 'm_acertos', titulo: 'Acerte 20 questões', tipo: 'acertar_n', meta: 20, xp: 20, ativa: true },
  { id: 'm_acertos30', titulo: 'Acerte 30 questões', tipo: 'acertar_n', meta: 30, xp: 30, ativa: true },
  { id: 'm_pratica5', titulo: 'Pratique 5 questões', tipo: 'praticar_n', meta: 5, xp: 8, ativa: true },
  { id: 'm_pratica', titulo: 'Pratique 10 questões', tipo: 'praticar_n', meta: 10, xp: 15, ativa: true },
  { id: 'm_pratica20', titulo: 'Pratique 20 questões', tipo: 'praticar_n', meta: 20, xp: 25, ativa: true },
]
export const DEFAULT_MISSOES_CONFIG: MissoesConfig = { modo: 'todas', por_dia: 3 }
export const DEFAULT_CONQUISTAS: ConquistaDef[] = [
  { id: 'c_primeiro', titulo: 'Primeiro simulado', descricao: 'Conclua seu primeiro simulado', icone: 'rocket', regra: { tipo: 'simulados_concluidos', meta: 1 }, xp: 20 },
  { id: 'c_streak7', titulo: 'Semana em chamas', descricao: 'Mantenha 7 dias de sequência', icone: 'flame', regra: { tipo: 'streak', meta: 7 }, xp: 50 },
  { id: 'c_1000xp', titulo: '1000 XP', descricao: 'Acumule 1000 XP', icone: 'zap', regra: { tipo: 'xp_total', meta: 1000 }, xp: 0 },
  { id: 'c_nota100', titulo: 'Nota 100', descricao: 'Tire 100 em um simulado', icone: 'trophy', regra: { tipo: 'nota_max', meta: 100 }, xp: 40 },
  { id: 'c_maratona', titulo: 'Maratonista', descricao: 'Conclua 20 simulados', icone: 'medal', regra: { tipo: 'simulados_concluidos', meta: 20 }, xp: 60 },
  // +10 sugeridas
  { id: 'c_streak3', titulo: 'Aquecendo', descricao: 'Mantenha 3 dias de sequência', icone: 'flame', regra: { tipo: 'streak', meta: 3 }, xp: 15 },
  { id: 'c_streak30', titulo: 'Inabalável', descricao: 'Mantenha 30 dias de sequência', icone: 'crown', regra: { tipo: 'streak', meta: 30 }, xp: 150 },
  { id: 'c_simulados5', titulo: 'Ritmo de estudo', descricao: 'Conclua 5 simulados', icone: 'target', regra: { tipo: 'simulados_concluidos', meta: 5 }, xp: 30 },
  { id: 'c_simulados50', titulo: 'Veterano', descricao: 'Conclua 50 simulados', icone: 'shield', regra: { tipo: 'simulados_concluidos', meta: 50 }, xp: 120 },
  { id: 'c_simulados100', titulo: 'Lenda dos simulados', descricao: 'Conclua 100 simulados', icone: 'crown', regra: { tipo: 'simulados_concluidos', meta: 100 }, xp: 200 },
  { id: 'c_2500xp', titulo: '2.500 XP', descricao: 'Acumule 2.500 XP', icone: 'sparkles', regra: { tipo: 'xp_total', meta: 2500 }, xp: 0 },
  { id: 'c_5000xp', titulo: '5.000 XP', descricao: 'Acumule 5.000 XP', icone: 'gem', regra: { tipo: 'xp_total', meta: 5000 }, xp: 0 },
  { id: 'c_10000xp', titulo: '10.000 XP', descricao: 'Acumule 10.000 XP', icone: 'crown', regra: { tipo: 'xp_total', meta: 10000 }, xp: 0 },
  { id: 'c_nota80', titulo: 'Quase lá', descricao: 'Tire 80 ou mais em um simulado', icone: 'star', regra: { tipo: 'nota_max', meta: 80 }, xp: 20 },
  { id: 'c_nota90', titulo: 'Excelência', descricao: 'Tire 90 ou mais em um simulado', icone: 'award', regra: { tipo: 'nota_max', meta: 90 }, xp: 30 },
  // +10 sugeridas (2ª leva)
  { id: 'c_xp500', titulo: 'Primeiros 500 XP', descricao: 'Acumule 500 XP', icone: 'zap', regra: { tipo: 'xp_total', meta: 500 }, xp: 0 },
  { id: 'c_xp25000', titulo: '25.000 XP', descricao: 'Acumule 25.000 XP', icone: 'crown', regra: { tipo: 'xp_total', meta: 25000 }, xp: 0 },
  { id: 'c_streak14', titulo: 'Duas semanas', descricao: 'Mantenha 14 dias de sequência', icone: 'flame', regra: { tipo: 'streak', meta: 14 }, xp: 80 },
  { id: 'c_streak60', titulo: 'Dois meses de foco', descricao: 'Mantenha 60 dias de sequência', icone: 'gem', regra: { tipo: 'streak', meta: 60 }, xp: 250 },
  { id: 'c_streak100', titulo: 'Cem dias', descricao: 'Mantenha 100 dias de sequência', icone: 'crown', regra: { tipo: 'streak', meta: 100 }, xp: 400 },
  { id: 'c_simulados10', titulo: 'Dez simulados', descricao: 'Conclua 10 simulados', icone: 'medal', regra: { tipo: 'simulados_concluidos', meta: 10 }, xp: 50 },
  { id: 'c_simulados25', titulo: 'Constância', descricao: 'Conclua 25 simulados', icone: 'shield', regra: { tipo: 'simulados_concluidos', meta: 25 }, xp: 80 },
  { id: 'c_simulados200', titulo: 'Imparável', descricao: 'Conclua 200 simulados', icone: 'trophy', regra: { tipo: 'simulados_concluidos', meta: 200 }, xp: 300 },
  { id: 'c_nota70', titulo: 'No caminho', descricao: 'Tire 70 ou mais em um simulado', icone: 'star', regra: { tipo: 'nota_max', meta: 70 }, xp: 15 },
  { id: 'c_nota95', titulo: 'Quase perfeito', descricao: 'Tire 95 ou mais em um simulado', icone: 'award', regra: { tipo: 'nota_max', meta: 95 }, xp: 35 },
]

export const DEFAULT_CONFIG = {
  ativo: false,
  timezone: 'America/Sao_Paulo',
  trilha_estilo: 'cards' as TrilhaEstilo,
  trilha_visiveis: 3,
  xp_regras: DEFAULT_XP_REGRAS,
  nivel_curva: DEFAULT_NIVEL_CURVA,
  ligas: DEFAULT_LIGAS,
  missoes_def: DEFAULT_MISSOES,
  missoes_config: DEFAULT_MISSOES_CONFIG,
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
    // select('*') é tolerante: colunas novas (ex.: missoes_config, ainda não migradas) apenas
    // ficam ausentes no retorno e caem no default — sem quebrar o carregamento.
    const { data } = await svc
      .from('simulado_gamificacao_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    row = data
  } catch {
    // Tabela ainda não migrada → gamificação inerte.
    return { tenantId, ...DEFAULT_CONFIG, ativo: false }
  }
  const r = row ?? {}
  const xr = r.xp_regras ?? {}
  return {
    tenantId,
    ativo: r.ativo === true,
    timezone: r.timezone || DEFAULT_CONFIG.timezone,
    trilha_estilo: (r.trilha_estilo === 'caminho' ? 'caminho' : 'cards') as TrilhaEstilo,
    trilha_visiveis: Number.isFinite(Number(r.trilha_visiveis)) ? Math.max(0, Math.trunc(Number(r.trilha_visiveis))) : 3,
    xp_regras: {
      simulado: { ...DEFAULT_XP_REGRAS.simulado, ...(xr.simulado ?? {}) },
      pratica: { ...DEFAULT_XP_REGRAS.pratica, ...(xr.pratica ?? {}) },
      streak: { ...DEFAULT_XP_REGRAS.streak, ...(xr.streak ?? {}) },
      chest: { ...DEFAULT_XP_REGRAS.chest, ...(xr.chest ?? {}) },
      fim_semana: { ...DEFAULT_XP_REGRAS.fim_semana, ...(xr.fim_semana ?? {}) },
      meta_dia: { ...DEFAULT_XP_REGRAS.meta_dia, ...(xr.meta_dia ?? {}) },
    },
    nivel_curva: { ...DEFAULT_NIVEL_CURVA, ...(r.nivel_curva ?? {}) },
    ligas: Array.isArray(r.ligas) && r.ligas.length ? r.ligas : DEFAULT_LIGAS,
    missoes_def: Array.isArray(r.missoes_def) ? r.missoes_def : DEFAULT_MISSOES,
    missoes_config: { ...DEFAULT_MISSOES_CONFIG, ...(r.missoes_config ?? {}) },
    conquistas_def: Array.isArray(r.conquistas_def) ? r.conquistas_def : DEFAULT_CONQUISTAS,
  }
})
