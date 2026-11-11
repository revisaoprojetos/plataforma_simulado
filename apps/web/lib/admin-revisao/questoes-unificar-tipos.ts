// Tipos/constantes PUROS (cliente + servidor) da sub-aba Biblioteca › Questões › Unificar › Questões duplicadas.
import type { MembroDup, NivelDup, UsoQ } from './biblioteca-questoes-gestao-tipos'

export type { MembroDup, NivelDup, UsoQ }
export const LIMIAR_MIN = 0.6
export const LIMIAR_PADRAO = 0.9
export type VistaU = 'pendentes' | 'ignoradas' | 'resolvidas'
export type UsoFiltro = '' | 'simulado' | 'respostas' | 'livre'

export interface FiltrosU {
  vista: VistaU; nivel: string; uso: UsoFiltro; disciplina: string; banca: string; ano: string; status: string
  gabarito: '' | 'divergente' | 'ok'; limiar: number; q: string; page: number; pp: number
}

export interface GrupoU {
  id: string; ids: string[]; n: number; ativas: number; nivel: NivelDup
  /** menor similaridade de enunciado usada para ligar o grupo (1 = exatamente igual) */
  scoreMin: number
  amostra: string
  emSimulado: boolean; comRespostas: boolean
  /** gabaritos (texto da alternativa correta) diferentes entre as questões do grupo */
  gabDiverge: boolean
  ignorados: number
}
export interface FacetaU { id: string; nome: string; n: number }
export interface ResumoU {
  grupos: number; questoes: number; porNivel: Record<NivelDup, number>; gabDiverge: number; emSimulado: number; comRespostas: number
  ignoradas: number; resolvidas: number
}
export interface RespostaGruposU {
  ok: true; grupos: GrupoU[]; total: number; page: number; pp: number; totalQuestoes: number; geradoEm: number; limiar: number
  resumo: ResumoU
  facetas: { disciplinas: FacetaU[]; bancas: FacetaU[]; anos: FacetaU[] }
  /** tabela de "não é duplicada" existe? (senão a UI usa localStorage) */
  ignorarServidor: boolean
  /** pares ignorados (ordenados a<b "a|b") — só para a UI saber o que mostrar */
  degradado?: boolean
}

export interface PreviaU {
  ok: boolean; error?: string
  modos: { completa: { permitido: boolean; motivo: string }; arquivar: { permitido: boolean; motivo: string; precisaConfirmar: boolean } }
  gabaritoDivergente: boolean; gabaritoDetalhe: string
  uso: Record<string, UsoQ>
  moveria: { etiquetas: number | null; favoritos: number; comentarios: number; feedbacks: number; bancos: number }
  simulados: { reapontaveis: number; mantidos: number; semSessaoMasComMestre: number }
  ficam: { simulados: number; respostas: number; conteudos: number }
  preenche: string[]
  /** vínculo mestre↔duplicada é gravado? (tabela simulado_questoes_unificacoes existe) */
  vinculoServidor: boolean
}

export interface HistoricoU {
  id: string; mestreId: string; duplicadas: string[]; modo: 'completa' | 'arquivar'; executadoEm: string; desfeitoEm: string | null
  resumo: Record<string, any>
}

export const ROTULO_VISTA: Record<VistaU, string> = { pendentes: 'Pendentes', ignoradas: 'Marcadas “não é duplicada”', resolvidas: 'Já resolvidas' }
export const chavePar = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Filtros padrão da 1ª tela (SSR e cliente usam EXATAMENTE a mesma chave → o cliente reaproveita o `inicial` sem chamada). */
export const FILTROS_U_PADRAO: FiltrosU = { vista: 'pendentes', nivel: '', uso: '', disciplina: '', banca: '', ano: '', status: '', gabarito: '', limiar: LIMIAR_PADRAO, q: '', page: 1, pp: 14 }
/** Dados iniciais (SSR) de Unificar › Questões duplicadas: 1ª página + resumo das vistas + membros do 1º grupo (abre na hora). */
export interface InicialUnificar { grupos: RespostaGruposU; primeiro: { ids: string[]; membros: MembroDup[] } | null }
