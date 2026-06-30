// Núcleo do editor de cadernos por blocos (estilo Gutenberg) — adaptado p/ Next.js.
// Documento serializado em JSON (igual ao Gutenberg): a árvore de blocos é salva
// em simulado_cadernos_designer.config (jsonb), não em tabelas normalizadas.

export const MM_TO_PX = 3.7795
export const MM_TO_PT = 2.8346
// Geometria fiel A4 (preview ~96dpi).
export const SHEET_W = 794 // 210mm
export const SHEET_H = 1123 // 297mm
export const PAD_H = 64 // ~48pt
export const PAD_V = 48 // ~36pt

export type BlockCategory = 'conteudo' | 'avaliacao' | 'identificacao' | 'estrutura'

export type Block<A = Record<string, unknown>> = {
  id: string
  type: string
  attributes: A
  innerBlocks?: Block[]
}

export type PageKind = 'capa' | 'conteudo' | 'gabarito' | 'branca' | 'contracapa'

export type Page = {
  id: string
  kind: PageKind
  titulo?: string
  blocks: Block[]
}

/** Cabeçalho/rodapé correntes (repetidos nas páginas). */
export type RunningConfig = {
  cabecalhoAtivo: boolean
  rodapeAtivo: boolean
  mostrarNumeroPagina: boolean
}
export const RUNNING_PADRAO: RunningConfig = { cabecalhoAtivo: false, rodapeAtivo: false, mostrarNumeroPagina: true }

export type CadernoDoc = {
  versao: 1
  pages: Page[]
  cabecalho?: Block[]
  rodape?: Block[]
  running?: RunningConfig
}

/** "Modalidade" = um caderno dentro do conjunto (cada um com seu documento). */
export type Modalidade = { id: string; nome: string }

export const MODALIDADES_PADRAO: Modalidade[] = [
  { id: 'gabarito_objetivo', nome: 'Gabarito Objetivo' },
  { id: 'gabarito_discursivo', nome: 'Gabarito Discursivo' },
  { id: 'diagnostico', nome: 'Diagnóstico' },
]

export const PAGE_KINDS: { id: PageKind; nome: string }[] = [
  { id: 'capa', nome: 'Capa' },
  { id: 'conteudo', nome: 'Conteúdo' },
  { id: 'gabarito', nome: 'Gabarito' },
  { id: 'branca', nome: 'Branca' },
  { id: 'contracapa', nome: 'Contracapa' },
]

export function genId(type: string): string {
  try { return `${type}_${crypto.randomUUID().slice(0, 8)}` }
  catch { return `${type}_${Date.now().toString(36)}${Math.round(Math.random() * 1e4)}` }
}

export function novoDoc(): CadernoDoc {
  return {
    versao: 1,
    pages: [{ id: genId('page'), kind: 'conteudo', titulo: 'Página 1', blocks: [] }],
    cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO },
  }
}

export type QuestaoData = { id: string; numero: number; enunciado: string; tipo: string; disciplina?: string; alternativas: { letra: string; texto: string; correta: boolean }[] }

/** Dados reais (ou de exemplo) que os blocos `dynamic` consomem. */
export type CadernoData = {
  questoes: QuestaoData[]
  numQuestoes: number
  numAlternativas: number
  vars: Record<string, string>
  /** Questão corrente dentro de um bloco de repetição (preenchido a cada iteração). */
  questaoAtual?: QuestaoData
  /** Letra marcada pelo aluno corrente em cada questão (mala direta): questaoId → "A"/"B"… */
  respostas?: Record<string, string>
  /** Gabarito liberado? Controla a exibição da correção (marcada × correta). */
  gabaritoLiberado?: boolean
}
