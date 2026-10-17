'use client'

// Botão "Baixar" dos cards de simulado (home/pasta) — abre o pop-up com as opções de caderno/gabarito
// (CadernosDownloadDialog) no lugar do antigo download direto. Autossuficiente: resolve o tema ao vivo
// (useTemaInterno) e recebe a marca (constante por tela). Herda a classe/estilo do botão de cada marca.

import { type CSSProperties, type ReactNode, useState } from 'react'
import { useTemaInterno } from './use-tema-interno'
import { CadernosDownloadDialog } from './cadernos-download-dialog'
import type { Brand } from './interna-tokens'

export function BaixarCadernoBtn({ simuladoId, titulo, brand, className, style, children, ariaLabel = 'Baixar caderno' }: {
  simuladoId: string
  titulo?: string
  brand: Brand
  className?: string
  style?: CSSProperties
  children: ReactNode
  ariaLabel?: string
}) {
  const [aberto, setAberto] = useState(false)
  const theme = useTemaInterno('claro')
  return (
    <>
      <button type="button" className={className} style={{ fontFamily: 'inherit', cursor: 'pointer', ...style }} onClick={() => setAberto(true)} title={ariaLabel} aria-label={ariaLabel}>
        {children}
      </button>
      {aberto && <CadernosDownloadDialog simuladoId={simuladoId} titulo={titulo} brand={brand} theme={theme} onClose={() => setAberto(false)} />}
    </>
  )
}
