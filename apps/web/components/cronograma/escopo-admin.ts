import type { CSSProperties } from 'react'

/**
 * Tokens Revisão (--brand, --surface, --line…) apontados para os tokens shadcn do PAINEL ADMIN.
 * A grade/resumo são escritos só com tokens Revisão; na prévia do admin (variante="admin") este mapa é
 * aplicado no próprio componente, então ele herda a marca/claro/escuro do admin sem wrapper externo.
 */
export const ESCOPO_ADMIN = {
  '--brand': 'var(--primary)',
  '--btnText': 'var(--primary-foreground)',
  '--surface': 'var(--card)',
  '--surface2': 'var(--muted)',
  '--line': 'var(--border)',
  '--ink': 'var(--foreground)',
  '--sub': 'var(--muted-foreground)',
  '--chip': 'color-mix(in srgb, var(--primary) 12%, transparent)',
  '--gold': 'var(--accent)',
  '--goldInk': 'var(--accent-foreground)',
} as CSSProperties

export type VarianteCronograma = 'aluno' | 'admin'
