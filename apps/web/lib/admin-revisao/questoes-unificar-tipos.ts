// Tipos/constantes PUROS (cliente + servidor) da sub-aba Biblioteca › Questões › Unificar › Questões duplicadas.
import type { MembroDup, NivelDup, UsoQ } from './biblioteca-questoes-gestao-tipos'

export type { MembroDup, NivelDup, UsoQ }
export const LIMIAR_MIN = 0.6
export const LIMIAR_PADRAO = 0.9
export type VistaU = 'pendentes' | 'ignoradas' | 'resolvidas'
export type UsoFiltro = '' | 'simulado' | 'respostas' | 'livre'

/** Dimensões de filtro (MULTI-seleção: E entre dimensões, OU dentro da dimensão). */
export type DimU = 'nivel' | 'uso' | 'gabarito' | 'disciplina' | 'banca' | 'ano' | 'status'
export const DIMS_U: readonly DimU[] = ['nivel', 'uso', 'gabarito', 'disciplina', 'banca', 'ano', 'status']
export type ListasU = Record<DimU, string[]>
export type FacetasContU = Record<DimU, Record<string, number>>
export const VALORES_USO: UsoFiltro[] = ['simulado', 'respostas', 'livre']
export const VALORES_GAB = ['divergente', 'ok'] as const
export const VALORES_STATUS = ['publicada', 'rascunho', 'arquivada'] as const
export const ROTULO_USO_U: Record<string, string> = { simulado: 'Em simulado', respostas: 'Com respostas de alunos', livre: 'Sem uso' }
export const ROTULO_GAB_U: Record<string, string> = { divergente: 'Gabarito divergente', ok: 'Gabarito igual' }
export const ROTULO_STATUS_U: Record<string, string> = { publicada: 'Ativa', rascunho: 'Rascunho', arquivada: 'Arquivada' }
export const ROTULO_DIM_U: Record<DimU, string> = { nivel: 'Tipo de coincidência', uso: 'Uso', gabarito: 'Gabarito', disciplina: 'Disciplina', banca: 'Banca', ano: 'Ano', status: 'Status' }
export const listasVaziasU = (): ListasU => ({ nivel: [], uso: [], gabarito: [], disciplina: [], banca: [], ano: [], status: [] })

export interface FiltrosU extends ListasU {
  vista: VistaU; limiar: number; q: string; page: number; pp: number
}
/** Valores de um grupo em cada dimensão (usado pelo filtro E pela contagem ao vivo — mesma regra nos dois). */
export function valoresGrupoU(g: { nivel: string; emSimulado: boolean; comRespostas: boolean; gabDiverge: boolean; discs: Iterable<string>; bancas: Iterable<string>; anos: Iterable<string>; statuses: Iterable<string> }, d: DimU): string[] {
  switch (d) {
    case 'nivel': return [g.nivel]
    case 'uso': return [...(g.emSimulado ? ['simulado'] : []), ...(g.comRespostas ? ['respostas'] : []), ...(!g.emSimulado && !g.comRespostas ? ['livre'] : [])]
    case 'gabarito': return [g.gabDiverge ? 'divergente' : 'ok']
    case 'disciplina': return [...g.discs]
    case 'banca': return [...g.bancas]
    case 'ano': return [...g.anos]
    case 'status': return [...g.statuses]
  }
}
/** Chaves de URL: cada dimensão vira lista separada por vírgula. */
export const paramsListasU = (f: ListasU): Record<DimU, string> => ({ nivel: f.nivel.join(','), uso: f.uso.join(','), gabarito: f.gabarito.join(','), disciplina: f.disciplina.join(','), banca: f.banca.join(','), ano: f.ano.join(','), status: f.status.join(',') })

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
  /** opções existentes (disciplinas/bancas/anos presentes nos grupos da vista) */
  facetas: { disciplinas: FacetaU[]; bancas: FacetaU[]; anos: FacetaU[] }
  /** nº de GRUPOS por opção, com todos os OUTROS filtros aplicados ("quantos eu teria se marcasse esta") */
  contagens: FacetasContU
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
export const FILTROS_U_PADRAO: FiltrosU = { vista: 'pendentes', ...listasVaziasU(), limiar: LIMIAR_PADRAO, q: '', page: 1, pp: 14 }
/** Dados iniciais (SSR) de Unificar › Questões duplicadas: 1ª página + resumo das vistas + membros do 1º grupo (abre na hora). */
export interface InicialUnificar { grupos: RespostaGruposU; primeiro: { ids: string[]; membros: MembroDup[] } | null }
