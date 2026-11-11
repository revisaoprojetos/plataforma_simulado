// Tipos PUROS (cliente + servidor) da GESTÃO do banco de questões: Classificação · Unificar · Etiquetas.

export type TipoTaxG = 'disciplina' | 'assunto' | 'banca' | 'orgao' | 'cargo' | 'assunto_detalhe' | 'ano'
export const TIPOS_TAX_G: { id: TipoTaxG; nome: string; singular: string; entidade: boolean }[] = [
  { id: 'disciplina', nome: 'Disciplinas', singular: 'disciplina', entidade: true },
  { id: 'assunto', nome: 'Assuntos', singular: 'assunto', entidade: true },
  { id: 'banca', nome: 'Bancas', singular: 'banca', entidade: true },
  { id: 'orgao', nome: 'Órgãos', singular: 'órgão', entidade: true },
  { id: 'cargo', nome: 'Cargos', singular: 'cargo', entidade: false },
  { id: 'assunto_detalhe', nome: 'Assunto específico', singular: 'assunto específico', entidade: false },
  { id: 'ano', nome: 'Anos', singular: 'ano', entidade: false },
]
export const ehTipoTaxG = (v: unknown): v is TipoTaxG => TIPOS_TAX_G.some((x) => x.id === v)

export interface ResumoClassif {
  total: number
  campos: { k: string; rot: string; visao: string; sem: number; com: number; pct: number }[]
  /** questões com TODOS os campos centrais (disciplina, assunto, banca, ano) */
  completas: number
  divergentes: number
  visoes: Record<string, number>
  cadastro: { disciplinas: number; assuntos: number; bancas: number; orgaos: number; cargos: number; assuntosDetalhe: number; anos: number; etiquetas: number }
  degradado?: boolean
}

export interface ItemTaxG {
  id: string; nome: string; questoes: number
  /** disciplina: nº de assuntos · assunto: disciplina pai */
  extra?: number; paiId?: string | null; paiNome?: string | null; cor?: string | null; classificacao?: string | null
}
export interface RespostaTaxG { itens: ItemTaxG[]; total: number; page: number; pp: number; disciplinas?: { id: string; nome: string }[]; degradado?: boolean }

export interface SugestaoQ {
  disciplinaId?: string | null; disciplina?: string | null; assuntoId?: string | null; assunto?: string | null
  bancaId?: string | null; banca?: string | null; orgaoId?: string | null; orgao?: string | null; ano?: number | null
  /** de onde veio o sinal (texto curto para o admin) */
  fonte: string
}

export type NivelDup = 'identica' | 'codigo' | 'enunciado' | 'semelhante'
export const ROTULO_NIVEL_DUP: Record<NivelDup, string> = {
  identica: 'Idêntica', codigo: 'Mesmo código externo', enunciado: 'Mesmo enunciado, alternativas diferentes', semelhante: 'Muito semelhante',
}
export const DESC_NIVEL_DUP: Record<NivelDup, string> = {
  identica: 'Mesmo enunciado e mesmas alternativas (mesmo gabarito): a unificação completa é permitida.',
  codigo: 'Mesmo código externo (external_id) — vieram da mesma origem de importação.',
  enunciado: 'Enunciado igual, mas alternativas ou gabarito diferentes: só “arquivar duplicada” (pode ser outra questão).',
  semelhante: 'Texto quase igual (≥ 90%): revisar lado a lado antes de decidir.',
}
export interface UsoQ { simulados: number; respostas: number; favoritos: number; comentarios: number; feedbacks: number; bancos: number; conteudos: number }
export interface MembroDup {
  id: string; codigo: string | null; status: string | null; enunciado: string; disciplina: string | null; assunto: string | null; banca: string | null; orgao: string | null
  ano: number | null; cargo: string | null; nivel: string | null; versao: number; anulada: boolean; externalId: string | null; criadoEm: string | null
  alternativas: { ordem: number; texto: string; correta: boolean }[]
  etiquetas: { id: string; nome: string; cor: string | null }[]
  uso: UsoQ
}
export interface GrupoDup { id: string; nivel: NivelDup; n: number; ativas: number; amostra: string; ids: string[]; usado: boolean }
export interface RespostaDup { grupos: GrupoDup[]; total: number; page: number; pp: number; totalQuestoes: number; geradoEm: number; porNivel: Record<NivelDup, number>; degradado?: boolean }

export type Confianca = 'alta' | 'media' | 'baixa'
export const ROTULO_CONFIANCA: Record<Confianca, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa (revisar)' }
export interface CandidatoTermo { id: string; confianca: Confianca; motivo: string; itens: ItemTaxG[]; canonicaId: string; questoes: number }
export interface RespostaTermos { grupos: CandidatoTermo[]; total: number; page: number; pp: number; porConfianca: Record<Confianca, number>; geradoEm: number; totalItens: number }

export type FuncaoEtiquetaG = 'anular' | 'avisar' | 'desconsiderar'
export interface EtiquetaG {
  id: string; nome: string; cor: string | null; funcao: FuncaoEtiquetaG | null; questoes: number; emSimulados: number; criadoEm: string | null
}
export interface RespostaEtiquetasG { itens: EtiquetaG[]; total: number; semUso: number; semEtiqueta: number; totalQuestoes: number; parecidas: { a: string; b: string; motivo: string }[] }
