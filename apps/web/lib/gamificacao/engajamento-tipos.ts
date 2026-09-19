/**
 * ENGAJAMENTO por sequência/status (gamificação) — TIPOS + defaults + resolver PUROS (sem server-only),
 * seguros para client (forms) e para o config. A lógica de DISPARO (server-only) fica em `engajamento.ts`.
 *
 * Gatilhos, 100% editáveis por tenant:
 *  - `inativo`    : o aluno parou de entrar N dia(s) depois de ter iniciado → chamada para voltar.
 *  - `sequencia`  : o aluno atingiu N dias consecutivos (ex.: 4) → incentivo para continuar.
 *  - `marco`      : o aluno completou um marco de sequência (7/14/21/30…) → parabenização.
 *
 * A config vive em `simulado_gamificacao_config.xp_regras.engajamento` (jsonb) → SEM migração de config.
 */
export type EngajamentoTipo = 'inativo' | 'sequencia' | 'marco'

export interface EngajamentoGatilho {
  ativo: boolean
  /** inativo: dias sem entrar; sequencia: nº de dias consecutivos que dispara o incentivo. */
  dias?: number
  /** marco: lista de marcos de sequência que disparam a parabenização. */
  marcos?: number[]
  /** Mensagem editável (template) com variáveis {{nome}} {{dias}} {{marco}} {{streak}} {{maior}}. */
  mensagem: string
}

export interface EngajamentoConfig {
  inativo: EngajamentoGatilho
  sequencia: EngajamentoGatilho
  marco: EngajamentoGatilho
}

export const DEFAULT_ENGAJAMENTO: EngajamentoConfig = {
  inativo: { ativo: false, dias: 1, mensagem: 'Oi {{nome}}! Notamos que faz {{dias}} dia que você não aparece por aqui. Bora voltar e retomar sua rotina de estudos? 💪' },
  sequencia: { ativo: false, dias: 4, mensagem: 'Mandou bem, {{nome}}! Já são {{streak}} dias seguidos estudando. Continue firme e não perca o ritmo! 🔥' },
  marco: { ativo: false, marcos: [7, 14, 21, 30], mensagem: 'Parabéns, {{nome}}! 🏆 Você completou {{marco}} dias consecutivos de estudo. Que constância! Siga assim e vá ainda mais longe.' },
}

/** Catálogo dos eventos de engajamento (chave usada nos webhooks/automações + rótulo no admin). */
export const EVENTOS_ENGAJAMENTO = [
  { chave: 'engajamento.inativo', label: 'Engajamento: aluno parou de entrar (inativo)' },
  { chave: 'engajamento.sequencia', label: 'Engajamento: sequência de dias consecutivos' },
  { chave: 'engajamento.marco', label: 'Engajamento: marco de sequência (7/14/21/30…)' },
] as const

export const eventoDoTipo = (tipo: EngajamentoTipo) => `engajamento.${tipo}` as const

const intNum = (v: unknown, def: number, lo = 1, hi = 3650): number => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def
}
const marcosLimpos = (v: unknown, def: number[]): number[] => {
  if (!Array.isArray(v)) return def
  const out = [...new Set(v.map((x) => Math.trunc(Number(x))).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
  return out.length ? out : def
}
const str = (v: unknown, def: string): string => (typeof v === 'string' ? v : def)

/** Normaliza a config (tolerante a ausência/parcial) — usada no getGamConfig e nos consumidores. */
export function resolverEngajamento(raw: unknown): EngajamentoConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<EngajamentoConfig>
  const g = (k: keyof EngajamentoConfig): Partial<EngajamentoGatilho> => ((r[k] && typeof r[k] === 'object') ? (r[k] as any) : {})
  const i = g('inativo'), s = g('sequencia'), m = g('marco')
  return {
    inativo: { ativo: i.ativo === true, dias: intNum(i.dias, DEFAULT_ENGAJAMENTO.inativo.dias!, 1, 365), mensagem: str(i.mensagem, DEFAULT_ENGAJAMENTO.inativo.mensagem) },
    sequencia: { ativo: s.ativo === true, dias: intNum(s.dias, DEFAULT_ENGAJAMENTO.sequencia.dias!, 2, 365), mensagem: str(s.mensagem, DEFAULT_ENGAJAMENTO.sequencia.mensagem) },
    marco: { ativo: m.ativo === true, marcos: marcosLimpos(m.marcos, DEFAULT_ENGAJAMENTO.marco.marcos!), mensagem: str(m.mensagem, DEFAULT_ENGAJAMENTO.marco.mensagem) },
  }
}

/** Interpola {{nome}} {{dias}} {{marco}} {{streak}} {{maior}} no template da mensagem. */
export function interpolarMensagem(tpl: string, vars: Record<string, string | number>): string {
  return String(tpl ?? '').replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, k: string) => (vars[k] != null ? String(vars[k]) : ''))
}
