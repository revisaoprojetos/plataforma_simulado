// Dados REAIS das Ligas (liga atual, progressão, pódio por iniciais, XP da semana). A lista completa
// do ranking reusa o componente funcional existente (LigaRankingFull), injetado via SLOT `ranking`.

export interface LigaTier { nome: string; xpMin: number; atual: boolean; passada: boolean; cor?: string | null }
export interface LigaPeer { pos: number; iniciais: string; xp: number; eu?: boolean }

export interface LigaData {
  ligaNome: string
  ligaCor?: string | null
  posicao: number
  membros: number
  xpTotal: number
  xpSemana: number
  streak: number
  proximaNome: string | null
  faltam: number
  tiers: LigaTier[]
  podio: LigaPeer[] // top 3 (iniciais)
  semana: { dia: string; xp: number }[]
}
