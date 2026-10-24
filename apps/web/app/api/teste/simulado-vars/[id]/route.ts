import { NextResponse } from 'next/server'
import { carregarQuestoesSimulado, slugVar } from '@/lib/teste/simulado-dados'

// Variáveis REAIS de um simulado (disciplinas + pilares presentes, já com slug) pro plugin montar os
// chips de "Variáveis deste simulado" na aba de variáveis do OnlyOffice.
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*' }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await carregarQuestoesSimulado(id)
  if (r.erro) return NextResponse.json({ erro: r.erro, disciplinas: [], pilares: [] }, { headers: CORS })
  const disciplinas = (r.disciplinas || []).map((d) => ({ nome: d.nome, slug: slugVar(d.nome), total: d.total }))
  const pilaresPresentes = [...new Set((r.questoes || []).flatMap((q) => (q.pilares?.length ? q.pilares : [q.pilar])).filter(Boolean))]
  const pilares = pilaresPresentes.map((p) => ({ nome: p, slug: slugVar(p) }))
  return NextResponse.json({ disciplinas, pilares }, { headers: CORS })
}
