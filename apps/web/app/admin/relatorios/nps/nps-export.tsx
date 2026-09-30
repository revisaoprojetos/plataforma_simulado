'use client'

import { BotaoExportar } from '@/components/admin/relatorios/viz'

/** Export (CSV + Excel) do relatório de NPS — resumo + comentários. */
export function NpsExport({
  resumo, comentarios,
}: {
  resumo: { nps: number | null; media: number | null; total: number; promotores: number; neutros: number; detratores: number }
  comentarios: { nps: number; comentario: string | null; simuladoTitulo: string; criado_em: string }[]
}) {
  const linhas = (): (string | number | null)[][] => [
    ['NPS — Satisfação do aluno'],
    ['NPS', resumo.nps, 'Média', resumo.media != null ? resumo.media.toFixed(1).replace('.', ',') : '—', 'Total de avaliações', resumo.total],
    ['Promotores (9–10)', resumo.promotores, 'Neutros (7–8)', resumo.neutros, 'Detratores (0–6)', resumo.detratores],
    [],
    ['Comentários recentes'], ['Nota', 'Comentário', 'Simulado', 'Quando'],
    ...comentarios.map((c) => [c.nps, c.comentario ?? '', c.simuladoTitulo, c.criado_em]),
  ]
  return <BotaoExportar nome="nps_satisfacao" linhas={linhas} />
}
