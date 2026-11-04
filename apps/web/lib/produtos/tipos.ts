// Tipos do módulo Produtos / Extensivos. Ver docs/produtos-extensivos-blueprint.md.

export type ProdutoTipo = 'extensivo' | 'assinatura' | 'pre_edital' | 'sprint' | 'amostra' | 'mentoria' | 'avulso' | 'outro'
export type ProdutoTier = 'passaporte' | 'vitalicio' | 'normal'
export type ValidadeTipo = 'vitalicio' | 'dias' | 'data_fixa'
export type FonteProvider = 'curseduca' | 'guru' | 'manual' | string
/** Recursos que um produto pode liberar. banco/biblioteca_pasta/desafio são todos `simulado_pastas`. */
export type ItemTipo = 'grupo' | 'banco' | 'simulado' | 'biblioteca_pasta' | 'biblioteca_doc' | 'desafio' | 'cronograma'
export type AssinaturaOrigem = 'integracao' | 'manual'

export type ProdutoTema = 'claro' | 'escuro'
/** Formato de exibição do CONTEÚDO (currículo) do produto pro aluno. */
export type VitrineLayout = 'netflix' | 'grade' | 'trilha' | 'trilha_imagem' | 'lista'
export const VITRINE_LAYOUTS: { v: VitrineLayout; label: string; descricao: string }[] = [
  { v: 'netflix', label: 'Netflix (carrosséis)', descricao: 'Linhas horizontais com as capas dos módulos.' },
  { v: 'grade', label: 'Cards em grade', descricao: 'Capas numa grade que preenche a tela, sem rolar para o lado.' },
  { v: 'trilha_imagem', label: 'Trilha com imagem', descricao: 'Etapas conectadas em caminho, cada uma com a capa do módulo e o progresso.' },
  { v: 'trilha', label: 'Trilha simples', descricao: 'Etapas conectadas em caminho, só com texto e progresso (sem capas).' },
  { v: 'lista', label: 'Lista / acordeão', descricao: 'Módulos empilhados que expandem mostrando as aulas.' },
]
/** Layout dos carrosséis da vitrine (espelha os tamanhos da Curseduca). */
export type SecaoTamanho = 'vertical_small' | 'vertical_large' | 'horizontal_small' | 'horizontal_large' | 'destaque'
export type SecaoTipo = 'banner' | 'carrossel'
export type SecaoOrdenacao = 'manual' | 'alfabetica' | 'recentes'

export interface Produto {
  id: string
  nome: string
  slug: string | null
  tipo: ProdutoTipo
  descricao: string | null
  tier: ProdutoTier
  validade_tipo: ValidadeTipo
  validade_dias: number | null
  validade_data: string | null
  ativo: boolean
  // Identidade visual (branding do produto — espelha a "área de membros" da Curseduca).
  cor: string | null
  cor_secundaria: string | null
  tema: ProdutoTema
  logo_url: string | null
  capa_url: string | null
  banner_url: string | null
  banner_mobile_url: string | null
  gamificacao: boolean
  /** Modo "em edição/manutenção": true = acesso TOTALMENTE bloqueado (até matriculados). Default false. */
  acesso_bloqueado: boolean
  /** Formato de exibição do conteúdo pro aluno (default 'netflix'). Opcional: coluna nova, lida tolerante. */
  vitrine_layout?: VitrineLayout
  ordem: number
}

/** Um item referenciado numa seção de vitrine (também é o que o produto libera). */
export interface ItemRef { tipo_item: ItemTipo; item_id: string }

/** Seção da vitrine do produto: banner (imagem) ou carrossel (nome + tamanho + itens). */
export interface ProdutoSecao {
  id: string
  produto_id: string
  ordem: number
  tipo: SecaoTipo
  nome: string | null
  tamanho: SecaoTamanho
  ordenacao: SecaoOrdenacao
  config: { imagem?: string; imagem_mobile?: string; link?: string; itens?: ItemRef[] }
  ativo: boolean
}

export const SECAO_TAMANHOS: { v: SecaoTamanho; label: string }[] = [
  { v: 'vertical_small', label: 'Vertical pequeno' },
  { v: 'vertical_large', label: 'Vertical grande' },
  { v: 'horizontal_small', label: 'Horizontal pequeno' },
  { v: 'horizontal_large', label: 'Horizontal grande' },
  { v: 'destaque', label: 'Destaque' },
]

export interface ProdutoFonte {
  id: string
  produto_id: string
  provider: FonteProvider
  fonte_ref: string | null
  fonte_nome: string | null
  ativo: boolean
}

export interface ProdutoItem {
  id: string
  produto_id: string
  tipo_item: ItemTipo
  item_id: string
  permissoes: { ler?: boolean; baixar?: boolean; grifar?: boolean } | null
  ativo: boolean
}

export interface ProdutoDetalhe extends Produto {
  fontes: ProdutoFonte[]
  itens: ProdutoItem[]
  secoes: ProdutoSecao[]
  membros: number
}

/** As pastas (banco/biblioteca/desafio) compartilham a mesma mecânica de acesso (simulado_pasta_estudantes). */
export const ITENS_PASTA: ItemTipo[] = ['banco', 'biblioteca_pasta', 'desafio']

export const PRODUTO_TIPOS: { v: ProdutoTipo; label: string }[] = [
  { v: 'extensivo', label: 'Extensivo' },
  { v: 'assinatura', label: 'Assinatura' },
  { v: 'pre_edital', label: 'Pré-Edital' },
  { v: 'sprint', label: 'Sprint' },
  { v: 'amostra', label: 'Amostra' },
  { v: 'mentoria', label: 'Mentoria' },
  { v: 'avulso', label: 'Avulso' },
  { v: 'outro', label: 'Outro' },
]

/** Produto "leve" do editor do Estúdio: identidade + vitrine. Fontes/itens/membros NÃO vêm no page (lazy por aba). */
export type ProdutoLeve = Produto & { secoes: ProdutoSecao[] }
