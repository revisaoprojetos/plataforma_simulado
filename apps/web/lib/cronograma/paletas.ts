/**
 * As 10 paletas de cor das tabelas (spec §4, passo 7).
 *
 * Cada uma define quatro cores, e elas valem tanto para a tabela na tela quanto para o
 * DOCX — é o mesmo dado alimentando os dois, para o documento baixado não sair diferente
 * do que o aluno viu.
 *
 * `primaria`   faixa da semana e destaques
 * `revisao`    faixa das semanas de revisão e recesso
 * `cabecalho`  fundo da linha de cabeçalho da tabela
 * `celula`     fundo alternado das células de conteúdo
 *
 * A capa do DOCX NÃO muda com a paleta — é imagem fixa, como no gerador legado.
 */

export type Paleta = {
  slug: string
  nome: string
  primaria: string
  revisao: string
  cabecalho: string
  celula: string
}

export const PALETAS: readonly Paleta[] = [
  // A primeira é o padrão: roxo e dourado da identidade da Revisão.
  { slug: 'revisao', nome: 'Revisão (roxo e dourado)', primaria: '#4c1d95', revisao: '#b45309', cabecalho: '#5b21b6', celula: '#f5f3ff' },
  { slug: 'azul-marinho', nome: 'Azul-marinho', primaria: '#1e3a5f', revisao: '#475569', cabecalho: '#1e40af', celula: '#eff6ff' },
  { slug: 'cinza-grafite', nome: 'Cinza-grafite', primaria: '#374151', revisao: '#6b7280', cabecalho: '#4b5563', celula: '#f3f4f6' },
  { slug: 'lavanda-sobria', nome: 'Lavanda sóbria', primaria: '#6d28d9', revisao: '#8b5cf6', cabecalho: '#7c3aed', celula: '#f5f3ff' },
  { slug: 'areia-cafe', nome: 'Areia e café', primaria: '#78350f', revisao: '#a16207', cabecalho: '#92400e', celula: '#fffbeb' },
  { slug: 'bronze-carvao', nome: 'Bronze e carvão', primaria: '#292524', revisao: '#b45309', cabecalho: '#44403c', celula: '#fafaf9' },
  { slug: 'indigo', nome: 'Índigo', primaria: '#312e81', revisao: '#4f46e5', cabecalho: '#3730a3', celula: '#eef2ff' },
  { slug: 'azul-aco', nome: 'Azul-aço', primaria: '#0c4a6e', revisao: '#0369a1', cabecalho: '#075985', celula: '#f0f9ff' },
  { slug: 'perola-taupe', nome: 'Pérola e taupe', primaria: '#57534e', revisao: '#78716c', cabecalho: '#6b7280', celula: '#fafaf9' },
  { slug: 'chumbo-prata', nome: 'Chumbo e prata', primaria: '#1f2937', revisao: '#64748b', cabecalho: '#334155', celula: '#f8fafc' },
]

export const PALETA_PADRAO = PALETAS[0]

export function acharPaleta(slug: string | null | undefined): Paleta {
  return PALETAS.find((p) => p.slug === slug) ?? PALETA_PADRAO
}

/** Chave usada para lembrar a escolha no navegador (spec §4: "a escolha é lembrada"). */
export const CHAVE_PALETA_LOCAL = 'cronograma:paleta'
