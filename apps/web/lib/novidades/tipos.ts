// NOVIDADES — tipos + constantes PUROS (sem 'server-only'), usáveis pelo client. I/O em ./novidades.

export type CategoriaNovidade = 'bbb' | 'plataforma' | 'cursos' | 'materiais' | 'jurisclub' | 'outro'
export type NovidadeKind = 'brand' | 'gold' | 'green' | 'blue' | 'pink' | 'gray'

export interface Novidade {
  id: string
  categoria: CategoriaNovidade
  titulo: string
  descricao: string | null
  destaque: boolean
  cover_url: string | null
  cta_label: string | null
  cta_url: string | null
  cta2_label: string | null
  cta2_url: string | null
  publicado_em: string
}
export interface NovidadeComLeitura extends Novidade {
  lida: boolean
}

// Filtros/rotulos das categorias (ordem da barra de chips, fiel ao mockup).
export const CATEGORIAS: { value: CategoriaNovidade; label: string }[] = [
  { value: 'bbb', label: 'BBB do Revisão' },
  { value: 'cursos', label: 'Cursos' },
  { value: 'plataforma', label: 'Plataforma' },
  { value: 'materiais', label: 'Materiais' },
  { value: 'jurisclub', label: 'JurisClub' },
]

export const CAT_LABEL: Record<CategoriaNovidade, string> = {
  bbb: 'BBB do Revisão', plataforma: 'Plataforma', cursos: 'Cursos', materiais: 'Materiais', jurisclub: 'JurisClub', outro: 'Novidade',
}
export const CAT_KIND: Record<CategoriaNovidade, NovidadeKind> = {
  bbb: 'gold', plataforma: 'brand', cursos: 'blue', materiais: 'green', jurisclub: 'pink', outro: 'gray',
}
