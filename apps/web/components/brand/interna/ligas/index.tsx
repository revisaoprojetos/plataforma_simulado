'use client'

// Switch por marca da área "Ligas" (spec 04 §4). Cada marca tem sua PRÓPRIA composição (não é um skin
// com troca de cores). DATA-DRIVEN: com `data` → dados reais; sem `data` (preview) → mock. A classificação
// completa é injetada via SLOT `ranking` (o componente funcional REAL que lista a liga); se ausente,
// um placeholder. Privacidade: pódio e vizinhos só com INICIAIS; nunca nome/foto/ID de terceiros.

import type { ReactNode } from 'react'
import type { Brand, InternaTheme } from '../interna-tokens'
import type { LigaData } from './data'
import { ligaMock } from './mock'
import { LigasRevisao } from './ligas-revisao'
import { LigasVnd } from './ligas-vnd'
import { LigasMeq } from './ligas-meq'

export function PlatformLigas({ brand, theme, data, ranking }: { brand: Brand; theme: InternaTheme; data?: LigaData; ranking?: ReactNode; tab?: string; preview?: boolean }) {
  const d = data ?? ligaMock()
  if (brand === 'vnd') return <LigasVnd theme={theme} data={d} ranking={ranking} />
  if (brand === 'meq') return <LigasMeq theme={theme} data={d} ranking={ranking} />
  return <LigasRevisao theme={theme} data={d} ranking={ranking} />
}
