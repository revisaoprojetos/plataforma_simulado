// Tipos (e constantes puras) das abas "Cronogramas" e "Regras" da Liberação de aulas. SEM 'use server'.

import type { Resultado } from './tipos'
export type { Resultado }

export const OFFSET_PADRAO = 28
export const CORES_TRILHA = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#db2777', '#0891b2', '#65a30d', '#dc2626']

export type VisLiberacao = 'aulas' | 'cronogramas' | 'regras' | 'alunos' | 'excecoes' | 'log'
export const VIS_LIBERACAO: Array<{ id: VisLiberacao; titulo: string }> = [
  { id: 'aulas', titulo: 'Aulas (data-base)' },
  { id: 'cronogramas', titulo: 'Cronogramas' },
  { id: 'regras', titulo: 'Regras' },
  { id: 'alunos', titulo: 'Alunos' },
  { id: 'excecoes', titulo: 'Exceções' },
  { id: 'log', titulo: 'Log' },
]

export interface Trilha {
  id: string
  nome: string
  descricao: string | null
  ordem: number
  inicioCronograma: string | null
  offsetDias: number
  segmentoIds: string[]
  cor: string | null
  ativo: boolean
  /** Aulas com data nesta trilha (informativo). */
  aulasComData: number
}

export interface EntradaTrilha {
  id?: string
  nome: string
  descricao?: string | null
  cor?: string | null
  inicioCronograma?: string | null
  offsetDias: number
  ativo: boolean
  ordem?: number
}

export interface CelulaTrilha {
  dataCronograma: string | null
  dataManual: string | null
  /** liberaEmTrilha(): manual exata ou cronograma − offset. null = a aula não existe na trilha. */
  efetiva: string | null
}

export interface LinhaGrade {
  id: string                // simulado_produto_liberacao_aulas.id
  ordem: number
  disciplina: string
  numeroAula: number | null
  titulo: string
  dataBase: string          // data_liberacao atual
  menor: string | null      // menorLiberacao entre as trilhas ativas
  celulas: Record<string, CelulaTrilha> // trilhaId → célula
}

export interface FiltrosGrade { q?: string; disc?: string; ord?: string; dir?: 'asc' | 'desc' }

export type AcaoGrade =
  | { tipo: 'deslocar'; trilhaId: string; dias: number; incluirManual: boolean }
  | { tipo: 'limpar_manual'; trilhaId: string | null }       // null = todas as trilhas
  | { tipo: 'limpar_data'; trilhaId: string }                // remove a aula da trilha (data_cronograma = null)

export interface EntradaCelula { liberacaoAulaId: string; trilhaId: string; dataCronograma: string | null; dataManual: string | null }

export interface MudancaBase { aulaId: string; ordem: number; disciplina: string; titulo: string; de: string; para: string }
export interface PreviaRecalculo { total: number; mudam: number; semTrilha: number; antecipam: number; adiam: number; amostra: MudancaBase[] }

// ── importação da 2ª aba ──
export interface PreviaTrilhaImport { nome: string; existente: boolean; inicio: string | null; offsetDias: number; celulasComData: number }
export interface PreviaLinhaImport {
  ordem: number
  disciplina: string
  titulo: string
  casou: 'ordem' | 'titulo' | 'nenhum'
  aulaTitulo: string | null
  datas: Record<string, string | null> // nome da trilha → data (já somada do desconto)
}
export interface PreviaImportTrilhas {
  abaLida: string
  linhasLidas: number
  linhasCasadas: number
  linhasSemAula: number
  celulasComData: number
  celulasVazias: number
  celulasNovas: number
  celulasAlteradas: number
  celulasIguais: number
  manuaisPreservadas: number
  trilhas: PreviaTrilhaImport[]
  invalidas: Array<{ linha: number; motivo: string }>
  semAula: PreviaLinhaImport[]
  amostra: PreviaLinhaImport[]
  descontoDias: number
}

export interface ContagemTrilha { trilhaId: string; alunos: number }
export interface ContagemAudiencia {
  audiencia: number            // alunos considerados
  amostrado: boolean           // true se a audiência passou do teto e foi truncada
  total: number                // alunos com acesso ao produto
  porTrilha: ContagemTrilha[]
  emVarias: number
  semTrilha: number
  calculadoEm: string
}

import type { RegraSegmento } from '@/lib/segmentos/tipos'
export interface SegmentoLeve { id: string; nome: string; resumo: string; regra: RegraSegmento }

export const PPS_GRADE = [10, 14, 25, 50]
export const PP_PADRAO_GRADE = 14

export const AVISO_MIGRACAO = 'Aplique as migrações 20261117010000 e 20261118020000 para usar os cronogramas de liberação.'
