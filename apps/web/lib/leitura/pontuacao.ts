// Pontuação do LegProc Digital (preparada para a gamificação). Enquanto a gamificação do tenant estiver
// DESLIGADA, o ranking usa só os ACERTOS do quiz; quando ligada, os pontos por aula/acerto + combo (aula
// gabaritada) passam a valer. As definições são editáveis no admin (config do módulo) e ficam guardadas
// em `simulado_pastas.pontuacao` (jsonb) — dormentes até a gamificação ser ativada.

/** Marco de sequência que SOMA um bônus ao atingir N dias consecutivos (ex.: 14→+15, 21→+35, 30→+50). */
export interface MarcoSequencia { dias: number; bonus: number }

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
  /** Bônus por SEMANA consecutiva de sequência (a cada 7 dias). Ex.: 10 = +10 por semana. */
  bonus_semana: number
  /** Marcos de sequência que somam um bônus extra ao atingir N dias (além do semanal). */
  marcos_sequencia: MarcoSequencia[]
  /** Janela (dias) de atividade p/ o aluno CONTAR como "praticando" no ranking — a última aula tem de
   *  ser dentro dos últimos N dias. 0 = mostra todos com atividade (sem filtro de recência). */
  dias_ativo: number
}

// Marcos padrão = tabela pedida: 14 dias (2 semanas) +15, 21 dias +35, mês (30) +50.
export const MARCOS_SEQUENCIA_PADRAO: MarcoSequencia[] = [{ dias: 14, bonus: 15 }, { dias: 21, bonus: 35 }, { dias: 30, bonus: 50 }]

// Padrão = tabela pedida: 5 por leitura, 5 por quiz, +10 por semana de sequência + marcos; sem filtro de recência.
export const PONTUACAO_LEITURA_PADRAO: PontuacaoLeitura = { pontos_aula: 5, pontos_quiz: 5, pontos_acerto: 0, combo_ativo: false, combo_bonus: 0, bonus_semana: 10, marcos_sequencia: MARCOS_SEQUENCIA_PADRAO, dias_ativo: 0 }

/** Higieniza o jsonb cru (do banco) para o formato canônico, caindo nos padrões. */
export function normalizarPontuacaoLeitura(raw: unknown): PontuacaoLeitura {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const marcos = Array.isArray(r.marcos_sequencia)
    ? (r.marcos_sequencia as any[]).filter((m) => m && typeof m === 'object' && Number.isFinite(m.dias) && Number.isFinite(m.bonus)).map((m) => ({ dias: Math.max(1, Math.round(m.dias)), bonus: Math.round(m.bonus) }))
    : MARCOS_SEQUENCIA_PADRAO
  return {
    pontos_aula: num(r.pontos_aula, PONTUACAO_LEITURA_PADRAO.pontos_aula),
    pontos_quiz: num(r.pontos_quiz, PONTUACAO_LEITURA_PADRAO.pontos_quiz),
    pontos_acerto: num(r.pontos_acerto, PONTUACAO_LEITURA_PADRAO.pontos_acerto),
    combo_ativo: r.combo_ativo == null ? PONTUACAO_LEITURA_PADRAO.combo_ativo : !!r.combo_ativo,
    combo_bonus: num(r.combo_bonus, PONTUACAO_LEITURA_PADRAO.combo_bonus),
    bonus_semana: num(r.bonus_semana, PONTUACAO_LEITURA_PADRAO.bonus_semana),
    marcos_sequencia: marcos,
    dias_ativo: Math.max(0, Math.round(num(r.dias_ativo, 0))),
  }
}

/** Bônus de SEQUÊNCIA (streak) em pontos: soma o bônus SEMANAL (a cada 7 dias) + os MARCOS atingidos.
 *  Ex. (tabela padrão): 7d=+10 · 14d=+35 (2×10 semanal + 15 marco) · 21d=+80 · 30d=+140. */
export function bonusSequenciaLeitura(dias: number, cfg: PontuacaoLeitura | null | undefined): number {
  if (!cfg || dias < 7) return 0
  const semanal = Math.floor(dias / 7) * (cfg.bonus_semana ?? 0)
  const marcos = (cfg.marcos_sequencia ?? []).reduce((s, m) => s + (dias >= m.dias ? (m.bonus ?? 0) : 0), 0)
  return semanal + marcos
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
