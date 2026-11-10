// Tipos exportados por configuracoes/banners/actions.ts — fora do 'use server' para não quebrar o next build.

export interface BannerInput {
  tipo: 'banner' | 'popup' | 'hero'
  titulo?: string | null
  mensagem?: string | null
  imagem_url?: string | null
  imagemOrig?: string | null
  link?: string | null
  cor?: string | null
  ativo?: boolean
  ordem?: number
  destaqueAtivo?: boolean
  destaqueTexto?: string | null
  fadeAtivo?: boolean
  fadeNivel?: number
  popupEstilo?: 'classico' | 'sobre' | 'compacto' | 'cartaz' | 'lado' | 'faixa'
  popupPontas?: 'arredondado' | 'quadrado'
  bannerTextoPos?: string
  bannerTextoCor?: 'claro' | 'escuro'
  bannerTextoTam?: 'pequeno' | 'medio' | 'grande'
  bannerTextoX?: number
  bannerTextoY?: number
  bannerOcultarTitulo?: boolean
  bannerOcultarMensagem?: boolean
  agendaInicio?: string | null
  agendaFim?: string | null
  freq?: 'login' | 'sempre' | 'uma_vez'
}
