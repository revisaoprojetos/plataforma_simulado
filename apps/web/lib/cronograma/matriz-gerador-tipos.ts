// Contratos (client-safe, sem I/O) da MATRIZ DE AULAS do Gerador — /admin/cronogramas/conteudos/[id].
// Uma linha por AULA; colunas = seções (tipos de meta ↔ classificações do tenant) + "Links de questões".

export const POR_PAGINA_MATRIZ = [10, 25, 50] as const
export const SITUACOES_MATRIZ = ['sem_conteudo', 'automatico', 'selecionado'] as const
export type SituacaoLinhaMatriz = (typeof SITUACOES_MATRIZ)[number]
export const ROTULO_SITUACAO: Record<SituacaoLinhaMatriz, string> = {
  sem_conteudo: 'Sem conteúdo vinculado',
  automatico: 'Só automático',
  selecionado: 'Com seleção',
}

export interface ColunaMatriz {
  /** slug do tipo de meta (seção da aula). */
  tipo: string
  nome: string
  cor: string | null
  classificacaoId: string | null
  classificacaoSlug: string | null
  papel: string | null
}

export interface SelecaoCelula {
  documentoId: string
  titulo: string
  pasta: string | null
  parteId: string | null
  parteNome: string | null
  classificacaoSlug: string | null
  rotuloAluno: string | null
  visivelAluno: boolean
  regrasOverride: Record<string, unknown>
  /** documento despublicado/apagado: a seleção não vale para o aluno (cai no automático). */
  indisponivel: boolean
}

export interface RegraCelula {
  /** minutos calculados NO SERVIDOR (null = não calculável: modo manual ou documento sem contagem de páginas). */
  minutos: number | null
  modo: string
  /** de onde veio o modo de tempo (meta = override desta célula; area = regra da área × classificação; padrao). */
  origem: 'meta' | 'area' | 'padrao'
  paginas: number | null
}

export interface CelulaDocumento {
  tipo: string
  /** a aula tem essa seção cadastrada no conjunto (linha em conjunto_aulas)? */
  existeSecao: boolean
  selecao: SelecaoCelula | null
  auto: { documentoId: string; titulo: string } | null
  regra: RegraCelula | null
}

export interface LinhaMatriz {
  /** chave normalizada da aula ("01" = "1"). */
  chave: string
  aula: string
  titulo: string
  conteudos: string[]
  celulas: Record<string, CelulaDocumento>
  links: { aulaId: string | null; itens: { plataformaId: string; url: string }[] }
  situacao: SituacaoLinhaMatriz
}

export interface PlataformaLinkMatriz { id: string; nome: string; slug: string }

export interface MatrizDados {
  conjunto: { id: string; nome: string; disciplina: string; disciplina_id: string | null; descricao: string | null }
  colunas: ColunaMatriz[]
  /** seção que carrega os links de questões (tipo com `mostra_links`), ou null. */
  tipoLinks: { tipo: string; nome: string } | null
  plataformas: PlataformaLinkMatriz[]
  linhas: LinhaMatriz[]
  total: number
  /** chaves de TODAS as aulas do filtro atual (até 300) — alvo de "selecionar todos" nas ações em lote. */
  chavesFiltradas: string[]
  page: number
  pp: number
  resumo: { aulas: number; semConteudo: number; automatico: number; selecionado: number }
  /** tabela de seleção ausente (migration 16 pendente): matriz só leitura. */
  semTabelaSelecao: boolean
  /** tipos para o filtro "por seção/classificação". */
  tiposFiltro: { tipo: string; nome: string }[]
  classificacoesFiltro: { slug: string; nome: string }[]
}

export interface DocSeletor {
  id: string
  titulo: string
  pasta: string | null
  disciplina: string
  classificacaoSlug: string | null
  sugerido: boolean
}

export interface DocsSeletorResposta {
  docs: DocSeletor[]
  total: number
  page: number
  pp: number
  /** documento que o resolvedor automático escolheria para esta célula. */
  sugestao: { documentoId: string; titulo: string } | null
}

export interface ParteSeletor { id: string; nome: string; rotuloIni: string | null; rotuloFim: string | null; metasEmUso: number }

export const MSG_MIGRACAO_SELECAO = 'Seleção por aula ainda não disponível (aplicar a migration 16-conteudo-partes-classificacao.sql).'

/**
 * Situação da aula a partir das células de documento ESPERADAS (seção existe na aula ou já tem seleção):
 * alguma sem seleção e sem automático → 'sem_conteudo'; senão alguma com seleção → 'selecionado'; senão 'automatico'.
 */
export function situacaoDaLinha(celulas: { temSelecao: boolean; temAuto: boolean }[]): SituacaoLinhaMatriz {
  if (celulas.some((c) => !c.temSelecao && !c.temAuto)) return 'sem_conteudo'
  return celulas.some((c) => c.temSelecao) ? 'selecionado' : 'automatico'
}
