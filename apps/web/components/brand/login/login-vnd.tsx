'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN — VND (spec 02 §1.3 / §2.4). 6 slugs = layout × SIMULA.
// ─────────────────────────────────────────────────────────────────────────────
//   vnd-login-centralizado(-simula)  → centralizado (fundo verde-escuro, V 980px)
//   vnd-login-vitrine(-simula)       → vitrine (2 colunas + anel conic + circuito)
//   vnd-login-dividido(-simula)      → dividido (painel verde 54% + form sem card)
// A diferença -simula liga/desliga o lockup "SIMULA" (sem → só a linha dourada).
// Temas: claro/escuro (azul ignorado). Nota §5.2: centralizado/vitrine têm fundo
// ESCURO mesmo no "claro"; dividido é claro com painel verde.
// Slug desconhecido → vnd-login-centralizado. Mockups: LoginVND4*/LoginV3*/LoginV5*.

import type { LoginVariantProps } from './types'
import { VndCentralizado } from './vnd/centralizado'
import { VndVitrine } from './vnd/vitrine'
import { VndDividido } from './vnd/dividido'

type Layout = 'centralizado' | 'vitrine' | 'dividido'

function parseSlug(style: string): { layout: Layout; simula: boolean } {
  const s = (style || '').toLowerCase()
  const simula = s.includes('simula')
  if (s.includes('vitrine')) return { layout: 'vitrine', simula }
  if (s.includes('dividido')) return { layout: 'dividido', simula }
  return { layout: 'centralizado', simula } // default / unknown
}

export function LoginVND({ style, ...props }: LoginVariantProps & { style: string }) {
  const { layout, simula } = parseSlug(style)
  if (layout === 'vitrine') return <VndVitrine {...props} simula={simula} />
  if (layout === 'dividido') return <VndDividido {...props} simula={simula} />
  return <VndCentralizado {...props} simula={simula} />
}
