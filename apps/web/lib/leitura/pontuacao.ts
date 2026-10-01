// Pontuação do LegProc Digital (preparada para a gamificação). Enquanto a gamificação do tenant estiver
// DESLIGADA, o ranking usa só os ACERTOS do quiz; quando ligada, os pontos por aula/acerto + combo (aula
// gabaritada) passam a valer. As definições são editáveis no admin (config do módulo) e ficam guardadas
// em `simulado_pastas.pontuacao` (jsonb) — dormentes até a gamificação ser ativada.

/** Marco que SOMA um bônus ao atingir N dias (ex.: 14→+15, 21→+35, 30→+50). */
export interface MarcoSequencia { dias: number; bonus: number }
/** Modo de um bônus por dias: AUTOMÁTICO (+X a cada N dias, repetindo) ou PERSONALIZADO (marcos editáveis). */
export type BonusModo = 'auto' | 'custom'

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
  // ── Bônus de SEQUÊNCIA (dias CONSECUTIVOS) ── modo auto (ciclo) OU custom (marcos).
  /** Modo do bônus de sequência. */
  sequencia_modo: BonusModo
  /** AUTO: pontos a cada `semana_dias` dias. */
  bonus_semana: number
  /** AUTO: tamanho do ciclo, em dias (padrão 7 = semanal). */
  semana_dias: number
  /** CUSTOM: marcos "ao atingir N dias seguidos". */
  marcos_sequencia: MarcoSequencia[]
  // ── Bônus de CONCLUSÃO (TOTAL de dias feitos, não consecutivo) ── modo auto OU custom.
  /** Modo do bônus de conclusão. */
  conclusao_modo: BonusModo
  /** AUTO: tamanho do ciclo de conclusão, em dias. */
  conclusao_cada: number
  /** AUTO: pontos a cada `conclusao_cada` dias concluídos. */
  conclusao_bonus: number
  /** CUSTOM: marcos "ao concluir N dias no total". */
  marcos_conclusao: MarcoSequencia[]
  /** Janela (dias) de atividade p/ o aluno CONTAR como "praticando" no ranking — a última aula tem de
   *  ser dentro dos últimos N dias. 0 = mostra todos com atividade (sem filtro de recência). */
  dias_ativo: number
}

// Marcos padrão = tabela pedida: 14 dias (2 semanas) +15, 21 dias +35, mês (30) +50.
export const MARCOS_SEQUENCIA_PADRAO: MarcoSequencia[] = [{ dias: 14, bonus: 15 }, { dias: 21, bonus: 35 }, { dias: 30, bonus: 50 }]

// Padrão = tabela pedida: 5 por leitura, 5 por quiz, +10 por semana de sequência + marcos; sem filtro de recência.
export const PONTUACAO_LEITURA_PADRAO: PontuacaoLeitura = { pontos_aula: 5, pontos_quiz: 5, pontos_acerto: 0, combo_ativo: false, combo_bonus: 0, sequencia_modo: 'auto', bonus_semana: 10, semana_dias: 7, marcos_sequencia: MARCOS_SEQUENCIA_PADRAO, conclusao_modo: 'custom', conclusao_cada: 7, conclusao_bonus: 0, marcos_conclusao: [], dias_ativo: 0 }

/** Higieniza uma lista crua de marcos (dias/bonus) para o formato canônico. */
function normalizarMarcos(raw: unknown, fallback: MarcoSequencia[]): MarcoSequencia[] {
  return Array.isArray(raw)
    ? (raw as any[]).filter((m) => m && typeof m === 'object' && Number.isFinite(m.dias) && Number.isFinite(m.bonus)).map((m) => ({ dias: Math.max(1, Math.round(m.dias)), bonus: Math.round(m.bonus) }))
    : fallback
}

/** Higieniza o jsonb cru (do banco) para o formato canônico, caindo nos padrões. */
export function normalizarPontuacaoLeitura(raw: unknown): PontuacaoLeitura {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const marcos = normalizarMarcos(r.marcos_sequencia, MARCOS_SEQUENCIA_PADRAO)
  const marcosConclusao = normalizarMarcos(r.marcos_conclusao, [])
  const modo = (v: unknown, d: BonusModo): BonusModo => (v === 'auto' || v === 'custom' ? v : d)
  return {
    pontos_aula: num(r.pontos_aula, PONTUACAO_LEITURA_PADRAO.pontos_aula),
    pontos_quiz: num(r.pontos_quiz, PONTUACAO_LEITURA_PADRAO.pontos_quiz),
    pontos_acerto: num(r.pontos_acerto, PONTUACAO_LEITURA_PADRAO.pontos_acerto),
    combo_ativo: r.combo_ativo == null ? PONTUACAO_LEITURA_PADRAO.combo_ativo : !!r.combo_ativo,
    combo_bonus: num(r.combo_bonus, PONTUACAO_LEITURA_PADRAO.combo_bonus),
    sequencia_modo: modo(r.sequencia_modo, 'auto'),
    bonus_semana: num(r.bonus_semana, PONTUACAO_LEITURA_PADRAO.bonus_semana),
    semana_dias: Math.max(1, Math.round(num(r.semana_dias, 7))),
    marcos_sequencia: marcos,
    conclusao_modo: modo(r.conclusao_modo, 'custom'),
    conclusao_cada: Math.max(1, Math.round(num(r.conclusao_cada, 7))),
    conclusao_bonus: num(r.conclusao_bonus, 0),
    marcos_conclusao: marcosConclusao,
    dias_ativo: Math.max(0, Math.round(num(r.dias_ativo, 0))),
  }
}

/** Soma dos marcos atingidos por `dias`. */
function somaMarcos(dias: number, marcos: MarcoSequencia[] | undefined): number {
  return (marcos ?? []).reduce((s, m) => s + (dias >= m.dias ? (m.bonus ?? 0) : 0), 0)
}
/** Bônus do CICLO automático: +pts a cada `cada` dias. */
function bonusCiclo(dias: number, cada: number, pts: number): number {
  const periodo = Math.max(1, cada)
  return dias < periodo ? 0 : Math.floor(dias / periodo) * (pts ?? 0)
}

/** Bônus de SEQUÊNCIA (dias CONSECUTIVOS): modo AUTO (ciclo) OU CUSTOM (marcos "ao atingir"). */
export function bonusSequenciaLeitura(dias: number, cfg: PontuacaoLeitura | null | undefined): number {
  if (!cfg) return 0
  return (cfg.sequencia_modo ?? 'auto') === 'custom'
    ? somaMarcos(dias, cfg.marcos_sequencia)
    : bonusCiclo(dias, cfg.semana_dias ?? 7, cfg.bonus_semana ?? 0)
}

/** Bônus de CONCLUSÃO (TOTAL de dias feitos, não consecutivo): modo AUTO (ciclo) OU CUSTOM (marcos "ao concluir"). */
export function bonusConclusaoLeitura(diasConcluidos: number, cfg: PontuacaoLeitura | null | undefined): number {
  if (!cfg) return 0
  return (cfg.conclusao_modo ?? 'custom') === 'auto'
    ? bonusCiclo(diasConcluidos, cfg.conclusao_cada ?? 7, cfg.conclusao_bonus ?? 0)
    : somaMarcos(diasConcluidos, cfg.marcos_conclusao)
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
