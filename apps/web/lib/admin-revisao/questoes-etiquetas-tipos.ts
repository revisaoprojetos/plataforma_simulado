// Tipos PUROS (cliente + servidor) da sub-aba ETIQUETAS (Biblioteca > Questões).
export type FuncaoEtiquetaQ = 'anular' | 'avisar' | 'desconsiderar'

export interface EtiquetaQ {
  id: string; nome: string; cor: string | null; funcao: FuncaoEtiquetaQ | null
  questoes: number; emSimulados: number
  criadoEm: string | null
  /** última atualização de uma questão que carrega a etiqueta (null = sem uso / dado indisponível). */
  ultimoUso: string | null
  /** id do grupo de nomes iguais após normalização (acento/caixa/pontuação), quando há mais de uma etiqueta com o mesmo nome. */
  grupoDup: string | null
}

export interface IndicadoresEtiquetas {
  etiquetas: number; semUso: number; comFuncao: number
  totalQuestoes: number; semEtiqueta: number
  /** grupos de etiquetas cujo nome normalizado é igual (sugestão de mesclar). */
  duplicadas: { chave: string; itens: { id: string; nome: string; questoes: number }[] }[]
}

export interface ListaEtiquetas {
  itens: EtiquetaQ[]; total: number; page: number; pp: number
  indicadores: IndicadoresEtiquetas
  degradado?: boolean
}

export type FiltroEtiquetas = '' | 'sem_uso' | 'mais_usadas' | 'duplicadas' | 'funcao'
export type OrdemEtiquetas = 'nome' | 'questoes' | 'simulados' | 'ultimo' | 'criada'

export interface QuestaoMini { id: string; codigo: string | null; enunciado: string; disciplina: string | null; banca: string | null; atualizadoEm: string | null }

export interface DetalheEtiqueta {
  total: number
  semOutra: number // questões que só têm esta etiqueta
  recentes: QuestaoMini[]
  porDisciplina: { nome: string; n: number }[]
  porBanca: { nome: string; n: number }[]
}

export interface PreviaMesclar { destino: string; origens: { id: string; nome: string; questoes: number }[]; resultado: number; funcaoDiferente: boolean }
export interface PreviaExcluir { nome: string; questoes: number; emSimulados: number; funcao: FuncaoEtiquetaQ | null }
