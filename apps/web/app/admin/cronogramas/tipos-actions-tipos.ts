import type { TipoMetaDef } from '@/lib/cronograma/tipos'

export type TipoComUso = TipoMetaDef & { ativo: boolean; usos: number }

export type EntradaTipo = {
  nome: string
  rotulo_docx: string
  cor: string | null
  mostra_links: boolean
  prefixo_aula: boolean
  aula_no_titulo: boolean
  quebra_conteudo: boolean
  conta_atividade: boolean
  destaque_docx: boolean
  sempre_no_docx: boolean
}
