// FLASHCARDS — tipos + lógica SRS PURA (sem I/O, sem 'server-only'). Pode ser importado pelo CLIENT
// (runner) e pelo servidor. A camada de dados fica em ./flashcards (server-only), que reexporta estes.

export type ResultadoRevisao = 'facil' | 'bom' | 'dificil' | 'errou'
export type EstadoCard = 'novo' | 'aprendendo' | 'revisar' | 'quase' | 'dominado'

export interface Flashcard {
  id: string
  documento_id: string
  frente: string
  verso: string
  ordem: number
  ativo: boolean
}

export interface FlashcardRevisao {
  flashcard_id: string
  caixa: number
  acertos: number
  erros: number
  ultimo_resultado: ResultadoRevisao | null
  ultima_revisao: string | null
  proxima_revisao: string | null
}

// Intervalos Leitner por caixa (em dias). Caixa 0 = volta hoje; sobe a cada acerto; zera ao errar.
export const INTERVALOS_DIAS = [0, 1, 3, 7, 16, 30] as const
export const CAIXA_MAX = INTERVALOS_DIAS.length - 1

/** Estado legível derivado da caixa Leitner (para rótulos/filtros na UI). */
export function estadoDaCaixa(caixa: number, jaRevisou: boolean): EstadoCard {
  if (!jaRevisou) return 'novo'
  if (caixa <= 0) return 'aprendendo'
  if (caixa <= 2) return 'revisar'
  if (caixa <= 4) return 'quase'
  return 'dominado'
}

/** Calcula caixa + próxima revisão a partir do resultado (PURO — sem I/O). */
export function proximoAgendamento(
  caixaAtual: number,
  resultado: ResultadoRevisao,
  agora: Date = new Date(),
): { caixa: number; proximaRevisao: string } {
  let caixa: number
  if (resultado === 'errou') caixa = 0
  else if (resultado === 'dificil') caixa = Math.max(0, caixaAtual) // mantém (reforça hoje/amanhã)
  else if (resultado === 'bom') caixa = Math.min(caixaAtual + 1, CAIXA_MAX)
  else caixa = Math.min(caixaAtual + 2, CAIXA_MAX) // 'facil' pula uma caixa
  const dias = INTERVALOS_DIAS[Math.min(caixa, CAIXA_MAX)]
  const prox = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000)
  return { caixa, proximaRevisao: prox.toISOString() }
}

/** Quantos cartões estão "devidos" hoje (novos ou proxima_revisao <= agora). PURO. */
export function contarDevidos(
  cards: Flashcard[], revs: Map<string, FlashcardRevisao>, agora = new Date(),
): number {
  let n = 0
  for (const c of cards) {
    const r = revs.get(c.id)
    if (!r || !r.proxima_revisao || new Date(r.proxima_revisao) <= agora) n++
  }
  return n
}
