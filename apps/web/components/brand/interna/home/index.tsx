'use client'

// HOME do aluno (spec 03 §3) — switch por marca. Cada marca tem seu arquivo próprio
// (Revisão/VND/MEQ): carrossel hero, saudação/nível, continuar, sequência/meta, missões,
// recentes, desempenho, pastas, outros. Consome `HomeData` (contrato espelhando os dados reais).

import type { HomeScreenProps } from './types'
import { HomeRevisao } from './revisao/home'
import { HomeVnd } from './vnd/home'
import { HomeMeq } from './meq/home'

export function PlatformHome({ brand, theme, data, preview }: HomeScreenProps) {
  if (brand === 'vnd') return <HomeVnd theme={theme} data={data} preview={preview} />
  if (brand === 'meq') return <HomeMeq theme={theme} data={data} preview={preview} />
  return <HomeRevisao theme={theme} data={data} preview={preview} />
}
