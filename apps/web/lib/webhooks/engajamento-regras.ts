/**
 * Regras de engajamento POR WEBHOOK (guardadas em simulado_webhook_saida.engajamento_regras jsonb).
 * Tipos + defaults + resolver PUROS (sem server-only) — seguros para o form (client) e para o disparo.
 *
 * Cada webhook que assina um evento gamificacao.* define aqui SUAS regras:
 *  - inativo   : dias sem entrar + mensagem
 *  - sequencia : nº de dias consecutivos que dispara + mensagem
 *  - marco     : lista de marcos (dias) + mensagem
 */
export interface RegraGatilho {
  /** inativo: dias sem entrar; sequencia: nº de dias consecutivos. */
  dias?: number
  /** marco: lista de marcos (dias) que disparam. */
  marcos?: number[]
  /** Mensagem (template) — variáveis {{nome}} {{dias}} {{marco}} {{streak}} {{maior}}. */
  mensagem: string
}
export interface EngajamentoRegras {
  inativo: RegraGatilho
  sequencia: RegraGatilho
  marco: RegraGatilho
}

export const DEFAULT_REGRAS: EngajamentoRegras = {
  inativo: { dias: 1, mensagem: 'Oi {{nome}}! Notamos que faz {{dias}} dia que você não aparece por aqui. Bora voltar e retomar sua rotina de estudos? 💪' },
  sequencia: { dias: 4, mensagem: 'Mandou bem, {{nome}}! Já são {{streak}} dias seguidos estudando. Continue firme e não perca o ritmo! 🔥' },
  marco: { marcos: [7, 14, 21, 30], mensagem: 'Parabéns, {{nome}}! 🏆 Você completou {{marco}} dias consecutivos de estudo. Que constância!' },
}

const intNum = (v: unknown, def: number, lo = 1, hi = 3650): number => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def
}
const marcosLimpos = (v: unknown, def: number[]): number[] => {
  if (!Array.isArray(v)) return def
  const out = [...new Set(v.map((x) => Math.trunc(Number(x))).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
  return out.length ? out : def
}
const str = (v: unknown, def: string): string => (typeof v === 'string' && v.trim() ? v : def)

/** Normaliza o jsonb cru (parcial) → regras completas com defaults. */
export function resolverRegras(raw: unknown): EngajamentoRegras {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<EngajamentoRegras>
  const g = (k: keyof EngajamentoRegras): Partial<RegraGatilho> => ((r[k] && typeof r[k] === 'object') ? (r[k] as any) : {})
  const i = g('inativo'), s = g('sequencia'), m = g('marco')
  return {
    inativo: { dias: intNum(i.dias, DEFAULT_REGRAS.inativo.dias!, 1, 365), mensagem: str(i.mensagem, DEFAULT_REGRAS.inativo.mensagem) },
    sequencia: { dias: intNum(s.dias, DEFAULT_REGRAS.sequencia.dias!, 2, 365), mensagem: str(s.mensagem, DEFAULT_REGRAS.sequencia.mensagem) },
    marco: { marcos: marcosLimpos(m.marcos, DEFAULT_REGRAS.marco.marcos!), mensagem: str(m.mensagem, DEFAULT_REGRAS.marco.mensagem) },
  }
}

/** Interpola {{nome}} {{dias}} {{marco}} {{streak}} {{maior}} no template. */
export function interpolar(tpl: string, vars: Record<string, string | number>): string {
  return String(tpl ?? '').replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, k: string) => (vars[k] != null ? String(vars[k]) : ''))
}

export const GAMIF_EVENTOS = ['gamificacao.inativo', 'gamificacao.sequencia', 'gamificacao.marco'] as const
export const ehEventoGamif = (c: string) => c.startsWith('gamificacao.')
