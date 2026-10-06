// Dados REAIS do Recomendado (diagnóstico por matéria + stats). O bloco de questão (resolver) usa o
// componente novo QCore, alimentado por um ARRAY de `QuestaoAluno` (dados), não mais ReactNode.

import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'

export interface RecoDiag { id: string; nome: string; ac: number; tot: number; pct: number; prioridade: 'alta' | 'media' | 'ok' }

// Mapa de calor matéria × banca (MEQ, spec 03 §5). `bancas` = colunas na ordem exibida (top por volume);
// cada linha traz `cols` (pct por banca, null = "—" sem questões) + `geral` (acerto geral da matéria).
export interface RecoHeatRow { id: string; materia: string; cols: (number | null)[]; geral: number }
export interface RecoHeat { bancas: string[]; linhas: RecoHeatRow[]; totalRespondidas: number }

export interface RecoData {
  stats: { materias: number; acertoMedio: number; paraReforcar: number; questoesHoje: number }
  diagnostico: RecoDiag[]
  insight: { materia: string; pct: number; ac: number; tot: number } | null
  /** MEQ: heatmap real matéria × banca. Sem isto, o MEQ cai num heatmap só com coluna Geral. */
  heatmap?: RecoHeat
}
