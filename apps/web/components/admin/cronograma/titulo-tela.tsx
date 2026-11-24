'use client'

import { CabecalhoArea } from '@/components/admin/cabecalho-area'

/**
 * Título da tela dentro de Cronogramas: H1 + descrição + ações. e, logo abaixo, a nav de Cronogramas (o CabecalhoArea
 * em modo "dentro do shell" posiciona eyebrow + BarraSetor + grupos + sub-abas). Não monte abas próprias de navegação.
 */
export function TituloTela({ titulo, descricao, acoes, denso }: { titulo: string; descricao?: React.ReactNode; acoes?: React.ReactNode; denso?: boolean }) {
  return <CabecalhoArea titulo={titulo} descricao={descricao} acoes={acoes} denso={denso} />
}
