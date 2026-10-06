// Contrato de DADOS REAIS da área "Simulados Realizados" (quando ligada ao backend).
// Cada item carrega os HREFs reais — os componentes renderizam <a>/<Link> funcionais (não botões inertes).

export interface RlzCapa {
  rotulo: string
  sub: string
  cor?: string | null
  capa?: string | null
}

export interface RlzEmAndamento {
  id: string
  titulo: string
  capa: RlzCapa
  banca?: string
  /** Área/pasta-alvo (MEQ: subtítulo abaixo do título). */
  area?: string
  /** Progresso (para a barra + "Questão X de N"). */
  questaoAtual: number
  total: number
  pct: number
  /** Link para retomar/abrir o simulado. */
  continuarHref: string
}

export interface RlzConcluido {
  id: string
  titulo: string
  capa: RlzCapa
  banca?: string
  /** Área/pasta-alvo (MEQ: subtítulo abaixo do título na tabela). */
  area?: string
  data: string // dd/mm
  nota: number | null
  notaLiberada: boolean
  /** Página interna do resultado (clique no card). */
  href: string
  correcaoHref: string
  /** Ações da tabela MEQ (Refazer / Baixar caderno). */
  refazerHref: string
  baixarHref?: string
}

export interface RlzPersonalizado {
  id: string
  nome: string
  status: 'rascunho' | 'concluido'
  nota?: number | null
  nQuestoes?: number
  /** Resumo das matérias (coluna "Matérias" da tabela MEQ). */
  materias?: string
  href: string
  /** Ações da tabela MEQ (Refazer concluído / Editar rascunho + Baixar). */
  refazerHref?: string
  editarHref?: string
  baixarHref?: string
}

export interface RealizadosData {
  stats: {
    feitos: number
    concluidos: number
    mediaGeral: number | null
    melhorNota: number | null
    /** MEQ: sublinhas dos KPIs. */
    novosNoMes?: number | null
    pctConcluidos?: number | null
    melhorNotaOrigem?: string | null
  }
  emAndamento: RlzEmAndamento[]
  concluidos: RlzConcluido[]
  personalizados: { criarHref: string; itens: RlzPersonalizado[] }
}
