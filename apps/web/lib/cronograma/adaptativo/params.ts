/**
 * PARÂMETROS CONFIGURÁVEIS DO CRONOGRAMA ADAPTATIVO (v3).
 *
 * Reúne os valores que até a 2.8 eram CONSTANTES no motor (motor28.ts / engine.ts / lp-catalogo.ts).
 * A partir da v3 o admin pode ajustá-los por tenant (ver `config-metas.ts` → `tema.cronograma_adaptativo_cfg`),
 * e o motor os lê por `ctx.params`. `PARAMS_PADRAO` reproduz EXATAMENTE o comportamento 2.8 — enquanto a
 * config do tenant estiver vazia, o plano gerado é idêntico ao de hoje (determinismo preservado).
 *
 * Módulo PURO (sem imports/ 'server-only'): o shape é compartilhado entre o motor (compilado p/ o iframe),
 * a camada server e o admin. O motor usa um subconjunto estrutural em `Contexto.params`.
 */

export interface ParamsAdaptativo {
  // ── Tempo & ritmo ──
  /** Ritmo de leitura padrão (páginas/hora) quando o aluno não fez o teste. */
  velPadrao: number
  /** Dia com menos de X min de estudo não recebe PDFULL (prioriza questões). */
  diaCurtoMin: number

  // ── Durações das metas (min) ──
  durFl: number // Revisão (flash)
  durQu: number // Questões
  durLp: number // LegProc
  durRf: number // Revisão de semana especial
  durRq: number // Questões de semana especial

  // ── Revisões ──
  /** Revisão N semanas de conteúdo após o PDFull. */
  offsetRevisao: number
  /** Questões N semanas de conteúdo após o PDFull. */
  offsetQuestoes: number
  /** Disciplinas que NÃO geram revisão regular. */
  semFlash: string[]

  // ── PDFull ──
  /** Teto de PDFulls NOVOS por dia quando o aluno permite "mais de um". (1 quando não permite.) */
  tetoPdfDia: number

  // ── LegProc ──
  lpMetasDia: number // teto de metas de LegProc por dia
  lpDiscDia: number // teto de disciplinas distintas de LegProc por dia
  lpMesmaDisc: number // teto de metas da mesma disciplina por dia (da mesma lei)
  lpJanelaRodizio: number // janela do rodízio de disciplinas
  charsMetaLp: number // caracteres por meta de LegProc (corte da lei)

  // ── Semana ──
  /** Concentra Questões/LegProc no último dia quando a semana soma até X horas. */
  concentracaoAteH: number
  /** Teto de semanas que o motor planeja à frente. */
  maxSemanas: number

  // ── Inteligência de desempenho (Fase 3) ──
  acertoMin: number // acerto (%) abaixo do qual o tema vira prioritário na revisão
  /** Usa o desempenho (grau/acerto) para priorizar temas fracos em TODO o plano, não só na revisão. */
  usarDesempenhoNoPlano: boolean
  /** Força do reforço de temas fracos (0 = desligado; 1 = padrão). */
  pesoDesempenho: number
}

/** Valores 2.8 (defaults). Mexer aqui muda o comportamento base de TODOS os tenants — prefira a config por tenant. */
export const PARAMS_PADRAO: ParamsAdaptativo = {
  velPadrao: 17,
  diaCurtoMin: 120,
  durFl: 60,
  durQu: 30,
  durLp: 30,
  durRf: 60,
  durRq: 30,
  offsetRevisao: 1,
  offsetQuestoes: 2,
  semFlash: ['Direito Eleitoral', 'Direito Internacional', 'Direito Internacional Privado', 'Legislação de Ensino', 'Legislação da AGU'],
  tetoPdfDia: 2,
  lpMetasDia: 4,
  lpDiscDia: 2,
  lpMesmaDisc: 2,
  lpJanelaRodizio: 6,
  charsMetaLp: 12000,
  concentracaoAteH: 18,
  maxSemanas: 200,
  acertoMin: 60,
  usarDesempenhoNoPlano: false,
  pesoDesempenho: 0,
}

const inteiro = (v: unknown, def: number, min: number, max: number): number => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
}
const listaDisc = (v: unknown, def: string[]): string[] => {
  if (!Array.isArray(v)) return [...def]
  const out = [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()))]
  return out
}

/**
 * Normaliza/clampa um objeto parcial de config → ParamsAdaptativo completo (defaults no que faltar).
 * Usado no admin (ao salvar) e na leitura por tenant. Garante que valores inválidos não quebrem o motor.
 */
export function normalizarParams(raw: unknown): ParamsAdaptativo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const p = PARAMS_PADRAO
  return {
    velPadrao: inteiro(r.velPadrao, p.velPadrao, 5, 60),
    diaCurtoMin: inteiro(r.diaCurtoMin, p.diaCurtoMin, 0, 600),
    durFl: inteiro(r.durFl, p.durFl, 10, 240),
    durQu: inteiro(r.durQu, p.durQu, 10, 240),
    durLp: inteiro(r.durLp, p.durLp, 10, 240),
    durRf: inteiro(r.durRf, p.durRf, 10, 240),
    durRq: inteiro(r.durRq, p.durRq, 10, 240),
    offsetRevisao: inteiro(r.offsetRevisao, p.offsetRevisao, 0, 12),
    offsetQuestoes: inteiro(r.offsetQuestoes, p.offsetQuestoes, 0, 12),
    semFlash: listaDisc(r.semFlash, p.semFlash),
    tetoPdfDia: inteiro(r.tetoPdfDia, p.tetoPdfDia, 1, 6),
    lpMetasDia: inteiro(r.lpMetasDia, p.lpMetasDia, 1, 12),
    lpDiscDia: inteiro(r.lpDiscDia, p.lpDiscDia, 1, 6),
    lpMesmaDisc: inteiro(r.lpMesmaDisc, p.lpMesmaDisc, 1, 6),
    lpJanelaRodizio: inteiro(r.lpJanelaRodizio, p.lpJanelaRodizio, 1, 20),
    charsMetaLp: inteiro(r.charsMetaLp, p.charsMetaLp, 2000, 40000),
    concentracaoAteH: inteiro(r.concentracaoAteH, p.concentracaoAteH, 0, 60),
    maxSemanas: inteiro(r.maxSemanas, p.maxSemanas, 20, 520),
    acertoMin: inteiro(r.acertoMin, p.acertoMin, 0, 100),
    usarDesempenhoNoPlano: r.usarDesempenhoNoPlano === true,
    pesoDesempenho: Math.max(0, Math.min(3, Number(r.pesoDesempenho) || (r.usarDesempenhoNoPlano === true ? 1 : 0))),
  }
}

/** Só os campos que o MOTOR (motor28) consome via ctx.params — subconjunto estrutural, sem semFlash string[] virar Set lá. */
export type ParamsMotor = ParamsAdaptativo
