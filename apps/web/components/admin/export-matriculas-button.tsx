'use client'

import { ExportButton } from '@/components/admin/export-button'
import { exportarMatriculas } from '@/app/admin/export-actions'
import type { ColunaExport } from '@/lib/exportar'

type Row = Awaited<ReturnType<typeof exportarMatriculas>>[number]

const COLS: ColunaExport<Row>[] = [
  { titulo: 'Estudante', valor: (r) => r.estudante, largura: 32 },
  { titulo: 'E-mail', valor: (r) => r.email, largura: 30 },
  { titulo: 'Simulado', valor: (r) => r.simulado, largura: 36 },
  { titulo: 'Acesso', valor: (r) => r.acesso },
  { titulo: 'Criado em', valor: (r) => r.criado_em },
]

export function ExportMatriculasButton({ filtros }: { filtros: Parameters<typeof exportarMatriculas>[0] }) {
  return <ExportButton fetchRows={() => exportarMatriculas(filtros)} colunas={COLS} nomeBase="matriculas" titulo="Matrículas" />
}
