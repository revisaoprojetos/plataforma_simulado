'use client'

import { ExportButton } from '@/components/admin/export-button'
import { exportarQuestoes } from '@/app/admin/export-actions'
import type { ColunaExport } from '@/lib/exportar'

type Row = Awaited<ReturnType<typeof exportarQuestoes>>[number]

const COLS: ColunaExport<Row>[] = [
  { titulo: 'Código', valor: (r) => r.codigo },
  { titulo: 'Enunciado', valor: (r) => r.enunciado, largura: 60 },
  { titulo: 'Disciplina', valor: (r) => r.disciplina },
  { titulo: 'Banca', valor: (r) => r.banca },
  { titulo: 'Dificuldade', valor: (r) => r.dificuldade },
  { titulo: 'Tipo', valor: (r) => r.tipo },
  { titulo: 'Status', valor: (r) => r.status },
  { titulo: 'Ano', valor: (r) => r.ano },
]

export function ExportQuestoesButton({ filtros }: { filtros: Parameters<typeof exportarQuestoes>[0] }) {
  return <ExportButton fetchRows={() => exportarQuestoes(filtros)} colunas={COLS} nomeBase="questoes" titulo="Questões" />
}
