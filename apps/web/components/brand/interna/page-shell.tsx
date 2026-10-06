'use client'

// Casca de PÁGINA interna no visual novo (header + fundo/tokens da marca), reaproveitando o CORPO
// funcional existente como children. Usada para ligar rápido ao design novo áreas que são features
// inteiras e interativas (Cronograma builder, Lei Seca lista, Jurisprudência) sem reescrever a lógica.

import type { ReactNode } from 'react'
import { internaTokensStyle, INTERNA_FONT, type Brand, type InternaTheme } from './interna-tokens'
import { useTemaInterno } from './use-tema-interno'

export function InternaPageShell({
  brand,
  theme: themeProp,
  titulo,
  subtitulo,
  icone,
  children,
}: {
  brand: Brand
  theme: InternaTheme
  titulo: string
  subtitulo?: string | null
  icone?: ReactNode
  children: ReactNode
}) {
  const theme = useTemaInterno(themeProp)
  return (
    <div style={{ ...internaTokensStyle(brand, theme), minHeight: '100%', padding: 24, fontFamily: INTERNA_FONT[brand] }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            {icone ? <span style={{ display: 'inline-flex', color: 'var(--brand)' }}>{icone}</span> : null}
            {titulo}
          </h1>
          {subtitulo ? <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--muted)' }}>{subtitulo}</p> : null}
        </div>
        {children}
      </div>
    </div>
  )
}

/** Raiz interna SEM cabeçalho — para telas que já trazem a própria manchete (PlatformLeiSeca,
 *  PlatformJuris). Só injeta tokens da marca + fundo full-bleed + container centralizado. */
export function InternaPageRoot({
  brand,
  theme: themeProp,
  children,
}: {
  brand: Brand
  theme: InternaTheme
  children: ReactNode
}) {
  const theme = useTemaInterno(themeProp)
  return (
    <div style={{ ...internaTokensStyle(brand, theme), minHeight: '100%', padding: 24, fontFamily: INTERNA_FONT[brand] }}>
      {children}
    </div>
  )
}
