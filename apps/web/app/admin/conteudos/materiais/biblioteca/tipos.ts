// Tipos compartilhados do bloco Biblioteca do Estúdio de Conteúdo.
// Ficam FORA do arquivo 'use server' (actions.ts): um módulo 'use server' só pode exportar
// funções async. Estes tipos são importados pelas actions (anotações) e pelos componentes client.

export interface MaterialRow {
  id: string
  titulo: string
  tipo_origem: string
  pasta_id: string | null
  versao_atual_id: string | null
  criado_em: string | null
  atualizado_em: string | null
}

export interface EtiquetaConteudo {
  id: string
  nome: string
  cor: string | null
}

export interface VinculoCliente {
  id: string
  produto_tipo: string
  produto_ref_id: string
  modo: 'ultima' | 'fixada'
  versao_fixada_id: string | null
  rotulo: string
}

/** Primeiro vínculo ("onde o material é usado") de um documento — coluna CONTEÚDO/VÍNCULO das listas. */
export interface RotuloVinculo {
  rotulo: string
  produto_tipo: string
  produto_ref_id: string
  total: number
}
