'use client'

// Área "Recomendado / Para você" (spec 03 §5), agora DATA-DRIVEN. As stats e o diagnóstico por matéria
// vêm de `data` (RecoData) — em produção, do diagnóstico real do aluno; sem `data`, cai no mock (preview).
// O bloco de questão é o QCore novo (design 04), alimentado pelo ARRAY `questoes: QuestaoAluno[]` — o
// "Caderno de reforço" mostra UMA por vez com chips de matéria que FILTRAM. Cada marca tem composição
// própria (Rev insight+diagnóstico; VND mapa; MEQ heatmap) e embute esse caderno.

import type { Brand, InternaTheme } from '../interna-tokens'
import type { RecoData } from './data'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { recoMock, recoQuestoesMock } from './mock'
import { RecomendadoRevisao } from './recomendado-revisao'
import { RecomendadoVnd } from './recomendado-vnd'
import { RecomendadoMeq } from './recomendado-meq'

export function PlatformRecomendado({ brand, theme, data, questoes }: { brand: Brand; theme: InternaTheme; data?: RecoData; questoes?: QuestaoAluno[]; tab?: string; preview?: boolean }) {
  const d = data ?? recoMock()
  const q = questoes ?? recoQuestoesMock()
  if (brand === 'vnd') return <RecomendadoVnd theme={theme} data={d} questoes={q} />
  if (brand === 'meq') return <RecomendadoMeq theme={theme} data={d} questoes={q} />
  return <RecomendadoRevisao theme={theme} data={d} questoes={q} />
}
