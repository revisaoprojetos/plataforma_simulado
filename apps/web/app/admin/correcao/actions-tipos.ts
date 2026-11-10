export interface AnotacaoInput {
  arquivo_id?: string | null
  competencia_id?: string | null
  tipo: string
  x: number; y: number
  largura?: number | null; altura?: number | null
  cor?: string | null
  icone?: string | null
  numero?: number | null
  conteudo?: string | null
  comentario?: string | null
}
export interface AnotacaoRow extends AnotacaoInput { id: string; origem: string }

export interface QuesitoPatch {
  nota?: number; comentario?: string | null; audit_state?: string; mensagem_aluno?: string | null
  conceito?: string | null; excerpt?: string | null; pagina?: string | null; linhas?: string | null
  recognized?: string[]; missing?: string[]; leitura_duvidosa?: boolean
}
