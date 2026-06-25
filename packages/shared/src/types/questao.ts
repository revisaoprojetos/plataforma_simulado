export type TipoQuestao = 'objetiva' | 'discursiva'
export type StatusQuestao = 'rascunho' | 'publicada' | 'arquivada'
export type GabaritoTipo = 'oficial' | 'extraoficial'
export type NivelDificuldade = 'facil' | 'medio' | 'dificil'

export interface Questao {
  id: string
  tenant_id: string
  external_id?: string
  tipo: TipoQuestao
  enunciado: string
  banca_id?: string
  orgao_id?: string
  ano?: number
  disciplina_id?: string
  assunto_id?: string
  nivel_dificuldade?: NivelDificuldade
  gabarito_tipo?: GabaritoTipo
  comentario_professor?: string
  status: StatusQuestao
  versao: number
  criado_por?: string
  criado_em: string
  atualizado_em: string
  alternativas?: Alternativa[]
  banca?: Banca
  disciplina?: Disciplina
  assunto?: Assunto
}

export interface Alternativa {
  id: string
  questao_id: string
  texto: string
  correta: boolean
  ordem: number
}

export interface Banca {
  id: string
  tenant_id: string
  nome: string
}

export interface Orgao {
  id: string
  tenant_id: string
  nome: string
}

export interface Disciplina {
  id: string
  tenant_id: string
  nome: string
  ordem?: number
}

export interface Assunto {
  id: string
  tenant_id: string
  disciplina_id: string
  nome: string
  pai_id?: string
}

export interface Etiqueta {
  id: string
  tenant_id: string
  nome: string
  cor: string
}
