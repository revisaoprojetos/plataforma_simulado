'use client'

// RESULTADO INTERNO (spec 05 §2) — switch por marca. Cada marca tem composição PRÓPRIA
// (não "skin"): header, ordem de blocos e tabelas diferentes, com TODOS os blocos do mockup.
// DADOS: `data` (produção) tem os campos reais + blocos sem fonte derivados por `deriveSamples`;
// sem `data` (preview) → mock completo. A Avaliação (NPS/estrelas/report) entra pelo SLOT `avaliacao`
// (componente real); sem slot, o formulário de EXEMPLO do mockup. `tab`/`preview` aceitos.

import type { Brand, InternaTheme } from '../interna-tokens'
import type { ResultadoInternoData } from './data'
import { deriveSamples, resultadoMock } from './mock'
import { ResultadoMeq } from './resultado-meq'
import { ResultadoRevisao } from './resultado-revisao'
import { ResultadoVnd } from './resultado-vnd'

export function PlatformResultadoInterno({
  brand,
  theme,
  data,
  sessaoId,
}: {
  brand: Brand
  theme: InternaTheme
  data?: ResultadoInternoData
  /** Sessão (melhor tentativa) p/ a aba Avaliação enviar NPS/report aos endpoints reais. */
  sessaoId?: string | null
  tab?: string
  preview?: boolean
}) {
  // sem data (preview) → mock completo; com data (produção) → real, com blocos sem fonte
  // real preenchidos por valores de EXEMPLO derivados (fidelidade visual do mockup).
  const d = data ? deriveSamples(brand, data) : resultadoMock(brand)
  if (brand === 'vnd') return <ResultadoVnd theme={theme} data={d} sessaoId={sessaoId} />
  if (brand === 'meq') return <ResultadoMeq theme={theme} data={d} sessaoId={sessaoId} />
  return <ResultadoRevisao theme={theme} data={d} sessaoId={sessaoId} />
}
