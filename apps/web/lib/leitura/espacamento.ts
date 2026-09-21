// Espaçamento GRANULAR do documento de leitura (Desafio de Lei Seca). Controle total pelo admin:
// entrelinha (texto), margem sup/inf de PARÁGRAFOS e a DISTÂNCIA dos blocos — entre blocos (bloco↔bloco)
// e do bloco com o texto/parágrafo (bloco↔texto, acima/abaixo). Guardado em quiz_config.esp (jsonb,
// migration-free). Retrocompatível: sem `esp`, deriva dos legados `espacamento`/`espacamento_texto`.

export interface EspacamentoDoc {
  /** Entrelinha do texto (multiplicador; 1 = padrão ≈ line-height 1.6). */
  linha: number
  /** Margem SUPERIOR entre parágrafos (mult; 0 = padrão). */
  parTop: number
  /** Margem INFERIOR entre parágrafos (mult; 1 = padrão). */
  parBot: number
  /** Distância ENTRE BLOCOS adjacentes (mult; 2.2 = 100% na UI). */
  blocoBloco: number
  /** Distância do bloco com o texto/parágrafo ACIMA dele (mult; 2.2 = 100%). */
  blocoTextoTop: number
  /** Distância do bloco com o texto/parágrafo ABAIXO dele (mult; 2.2 = 100%). */
  blocoTextoBot: number
}

export const DEFAULT_ESPACAMENTO: EspacamentoDoc = { linha: 1, parTop: 0, parBot: 1, blocoBloco: 2.2, blocoTextoTop: 2.2, blocoTextoBot: 2.2 }

const num = (v: unknown, lo: number, hi: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)) : def

/** Limites de cada eixo (usados na UI e ao salvar). */
export const ESP_LIMITES = {
  linha: { min: 0.7, max: 2.2, base: 1 },
  parTop: { min: 0, max: 5, base: 1 },   // base 1 = 0.72rem
  parBot: { min: 0, max: 5, base: 1 },
  blocoBloco: { min: 0, max: 4.4, base: 2.2 },     // base 2.2 = 100%
  blocoTextoTop: { min: 0, max: 4.4, base: 2.2 },
  blocoTextoBot: { min: 0, max: 4.4, base: 2.2 },
} as const

/** Higieniza um EspacamentoDoc cru (parcial). */
export function resolverEspacamento(raw: unknown): EspacamentoDoc {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<EspacamentoDoc>
  return {
    linha: num(r.linha, ESP_LIMITES.linha.min, ESP_LIMITES.linha.max, 1),
    parTop: num(r.parTop, ESP_LIMITES.parTop.min, ESP_LIMITES.parTop.max, 0),
    parBot: num(r.parBot, ESP_LIMITES.parBot.min, ESP_LIMITES.parBot.max, 1),
    blocoBloco: num(r.blocoBloco, ESP_LIMITES.blocoBloco.min, ESP_LIMITES.blocoBloco.max, 2.2),
    blocoTextoTop: num(r.blocoTextoTop, ESP_LIMITES.blocoTextoTop.min, ESP_LIMITES.blocoTextoTop.max, 2.2),
    blocoTextoBot: num(r.blocoTextoBot, ESP_LIMITES.blocoTextoBot.min, ESP_LIMITES.blocoTextoBot.max, 2.2),
  }
}

/** Do quiz_config → EspacamentoDoc: prefere `esp` (granular); senão deriva dos legados. */
export function normalizarEspacamento(quizConfig: unknown): EspacamentoDoc {
  const qc = (quizConfig && typeof quizConfig === 'object' ? quizConfig : {}) as Record<string, unknown>
  if (qc.esp && typeof qc.esp === 'object') return resolverEspacamento(qc.esp)
  const blocos = num(qc.espacamento, ESP_LIMITES.blocoBloco.min, ESP_LIMITES.blocoBloco.max, 2.2)
  const texto = num(qc.espacamento_texto, ESP_LIMITES.parBot.min, 3, 1)
  return { linha: 1, parTop: 0, parBot: texto, blocoBloco: blocos, blocoTextoTop: blocos, blocoTextoBot: blocos }
}

/** CSS vars (--lp-*) para aplicar num container (leitor/prévia). Espalhar no `style`. */
export function estiloEspacamento(e: EspacamentoDoc): Record<string, string | number> {
  return {
    '--lp-linha': e.linha,
    '--lp-par-top': e.parTop,
    '--lp-par-bot': e.parBot,
    '--lp-bloco-bloco': e.blocoBloco,
    '--lp-bloco-texto-top': e.blocoTextoTop,
    '--lp-bloco-texto-bot': e.blocoTextoBot,
  }
}
