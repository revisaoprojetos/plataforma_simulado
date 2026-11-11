// Tipos/constantes PUROS (sem server-only) da Biblioteca / Videoteca / Central de Atualizações (Plataforma Revisão).
// Fonte: protótipo admin-plataforma-revisao (V.materiais / V.videoteca / V.atualizacoes, CR_TYPES, LIB_BIB, UTIPO).

export type TipoBib = 'pdfull' | 'pdflash' | 'pdfight' | 'legproc' | 'flashcards' | 'questoes' | 'simulados' | 'jurisclub'

/** Ordem e rótulos das abas da Biblioteca (LIB_BIB do protótipo: a videoaula fica na Videoteca). */
export const TIPOS_BIB: { id: TipoBib; nome: string; desc: string }[] = [
  { id: 'pdfull', nome: 'PDFull', desc: 'Material principal de cada aula. A ordem define a fila do cronograma, e as páginas definem o tempo da meta.' },
  { id: 'pdflash', nome: 'PDFlash', desc: 'Material de revisão ligado à aula. Entra no cronograma depois do PDFull, conforme as regras de revisão.' },
  { id: 'pdfight', nome: 'PDFight', desc: 'Material ligado à aula.' },
  { id: 'legproc', nome: 'LegProc', desc: 'Lei seca distribuída por semana. Cada bloco ocupa o tempo de LegProc definido nas regras.' },
  { id: 'flashcards', nome: 'Flashcards', desc: 'Baralhos de flashcards ligados à aula.' },
  { id: 'questoes', nome: 'Questões', desc: 'O banco de questões da plataforma, organizado por disciplina e assunto (ou banca, órgão, ano…), e os conjuntos de questões ligados às aulas.' },
  { id: 'simulados', nome: 'Simulados', desc: 'Simulados disponíveis para o aluno do Extensivo.' },
  { id: 'jurisclub', nome: 'JurisClub', desc: 'Edições mensais do JurisClub.' },
]
export const ids_TIPOS_BIB = TIPOS_BIB.map((t) => t.id)
export const ehTipoBib = (v: unknown): v is TipoBib => ids_TIPOS_BIB.includes(v as TipoBib)

/** Linha de documento (Biblioteca) das abas PDFull/PDFlash/PDFight/LegProc/Questões/JurisClub. */
export interface LinhaMaterial {
  id: string
  titulo: string
  disciplina: string | null
  pasta: string | null
  tipoOrigem: string | null
  visivel: boolean
  paginas: number | null
  versao: number
  /** minutos no ritmo padrão (só PDFull) — calculado no servidor. */
  tempoMin: number | null
  /** nº de questões do conjunto (aba Questões). */
  qtdQuestoes: number | null
  atualizadoEm: string | null
  // ── Gestão (pastas/colunas do legado) ──
  pastaId: string | null
  /** Caminho completo da pasta (Disciplina › PDFull). */
  pastaCaminho: string | null
  status: string
  restrito: boolean
  leituraLegproc: boolean
  criadoEm: string | null
  metadados: Record<string, any>
}

/** Nó da árvore de pastas da Biblioteca (contagem = documentos da ABA ativa na pasta e subpastas). */
export interface NoPasta {
  id: string; nome: string; paiId: string | null; cor: string | null
  disciplinaId: string | null; classificacao: string | null; tipoMaterial: string | null; restrito: boolean
  proprios: number; total: number
}
export interface ArvoreBib { nos: NoPasta[]; semPasta: number; categoria: 'conteudo' | 'jurisclub' }
export type OpcoesFiltroBib = Partial<Record<'disciplina' | 'assunto_especifico' | 'tribunal' | 'informativo' | 'ano' | 'estado_origem' | 'selos', string[]>>
export interface ResumoBib {
  porTipo: Record<TipoBib, number>; total: number; pdfs: number; escondidos: number; reportesAbertos: number; temOculto: boolean
  /** Aba Questões: total REAL do banco (simulado_questoes) e nº de documentos "Conjunto de questões" (porTipo.questoes passa a ser o banco). */
  bancoQuestoes?: number; conjuntosQuestoes?: number
}
export interface RespostaBib {
  aba: TipoBib; total: number; page: number; pp: number
  rows: LinhaMaterial[]; baralhos: LinhaBaralho[] | null; simulados: LinhaSimulado[] | null
  arvore?: ArvoreBib; opcoes?: OpcoesFiltroBib; resumo: ResumoBib; aviso?: string; degradado?: boolean
}
export interface EstadoBib {
  aba: TipoBib; q: string; pasta: string | null; sub: boolean; vis: 'todos' | 'escondidos' | 'visiveis'; status: string
  acesso: '' | 'restrito' | 'todos'; sort: string; dir: 'asc' | 'desc'; page: number; pp: number; meta: Record<string, string>
}

export interface LinhaBaralho { id: string; nome: string; cartoes: number; status: string; alcance: string }
export interface LinhaSimulado { id: string; titulo: string; status: string; modo: string | null; questoes: number; duracaoMin: number | null; inicio: string | null }

export interface VersaoDoc { numero: number; origem: string; criadaEm: string; paginas: number | null; atual: boolean }

export type TipoAtualizacao = 'legislacao' | 'jurisprudencia' | 'correcao' | 'conteudo_novo'
export const TIPOS_ATUALIZACAO: { id: TipoAtualizacao; nome: string }[] = [
  { id: 'legislacao', nome: 'Legislação' },
  { id: 'jurisprudencia', nome: 'Jurisprudência' },
  { id: 'correcao', nome: 'Correção' },
  { id: 'conteudo_novo', nome: 'Conteúdo novo' },
]
export const NOME_TIPO_ATUALIZACAO: Record<TipoAtualizacao, string> = Object.fromEntries(TIPOS_ATUALIZACAO.map((t) => [t.id, t.nome])) as Record<TipoAtualizacao, string>
