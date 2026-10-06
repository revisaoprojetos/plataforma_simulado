'use client'

// Switch por marca da área "Simulados realizados" (spec 03 §4). Cada marca tem sua PRÓPRIA composição
// (não é um layout com troca de cores). DATA-DRIVEN: com `data` → dados reais (links funcionais);
// sem `data` (preview) → mock. Nenhuma ação é botão inerte — tudo que "vai a algum lugar" é <a>/<Link>.

import type { Brand, InternaTheme } from '../interna-tokens'
import type { RealizadosData } from './data'
import { realizadosMock } from './mock'
import { RealizadosRevisao } from './realizados-revisao'
import { RealizadosVnd } from './realizados-vnd'
import { RealizadosMeq } from './realizados-meq'

export function PlatformRealizados({ brand, theme, data }: { brand: Brand; theme: InternaTheme; data?: RealizadosData; tab?: string; preview?: boolean }) {
  const d = data ?? realizadosMock() // sem data (preview) → mock; com data (produção) → real
  if (brand === 'vnd') return <RealizadosVnd theme={theme} data={d} />
  if (brand === 'meq') return <RealizadosMeq theme={theme} data={d} />
  return <RealizadosRevisao theme={theme} data={d} />
}
