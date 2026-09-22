// Pontuação do LegProc Digital (preparada para a gamificação). Enquanto a gamificação do tenant estiver
// DESLIGADA, o ranking usa só os ACERTOS do quiz; quando ligada, os pontos por aula/acerto + combo (aula
// gabaritada) passam a valer. As definições são editáveis no admin (config do módulo) e ficam guardadas
// em `simulado_pastas.pontuacao` (jsonb) — dormentes até a gamificação ser ativada.

export interface PontuacaoLeitura {
  /** Pontos por LEITURA concluída (ler a aula). */
  pontos_aula: number
  /** Pontos por concluir o QUIZ da aula (independe de acerto). */
  pontos_quiz: number
  /** Pontos por ACERTO no quiz da aula. */
  pontos_acerto: number
  /** Liga o bônus de COMBO por aula GABARITADA (100% do quiz). */
  combo_ativo: boolean
  /** Bônus somado por aula gabaritada quando o combo está ligado. */
  combo_bonus: number
}

// Padrão = tabela pedida: 5 por leitura, 5 por concluir o quiz, sem pontos por acerto e sem combo.
export const PONTUACAO_LEITURA_PADRAO: PontuacaoLeitura = { pontos_aula: 5, pontos_quiz: 5, pontos_acerto: 0, combo_ativo: false, combo_bonus: 0 }

/** Higieniza o jsonb cru (do banco) para o formato canônico, caindo nos padrões. */
export function normalizarPontuacaoLeitura(raw: unknown): PontuacaoLeitura {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    pontos_aula: num(r.pontos_aula, PONTUACAO_LEITURA_PADRAO.pontos_aula),
    pontos_quiz: num(r.pontos_quiz, PONTUACAO_LEITURA_PADRAO.pontos_quiz),
    pontos_acerto: num(r.pontos_acerto, PONTUACAO_LEITURA_PADRAO.pontos_acerto),
    combo_ativo: r.combo_ativo == null ? PONTUACAO_LEITURA_PADRAO.combo_ativo : !!r.combo_ativo,
    combo_bonus: num(r.combo_bonus, PONTUACAO_LEITURA_PADRAO.combo_bonus),
  }
}

export interface DesempenhoLeitura { acertos: number; aulasConcluidas: number; aulasGabaritadas: number }

/**
 * Pontuação do aluno num módulo. Com a gamificação DESLIGADA (gamAtivo=false), o ranking é por ACERTOS
 * puros. Ligada, aplica a config (aula + acerto + combo de gabarito).
 */
export function pontuarLegProc(cfg: PontuacaoLeitura | null | undefined, d: DesempenhoLeitura, gamAtivo: boolean): number {
  if (!gamAtivo || !cfg) return d.acertos
  // Cada aula concluída = respondeu todo o quiz → vale a LEITURA + o QUIZ (pontos_aula + pontos_quiz),
  // igual ao XP real (5+5). Mais os pontos por acerto e o combo de gabarito, quando configurados.
  return d.aulasConcluidas * (cfg.pontos_aula + cfg.pontos_quiz) + d.acertos * cfg.pontos_acerto + (cfg.combo_ativo ? d.aulasGabaritadas * cfg.combo_bonus : 0)
}
