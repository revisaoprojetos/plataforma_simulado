import { NextRequest, NextResponse } from 'next/server'
import {
  acaoGrade, aplicarRecalculoBase, contarAudienciaTrilhas, excluirTrilha, linhasGradeExportar, previaRecalculoBase,
  salvarCelula, salvarSegmentosTrilha, salvarTrilha,
} from '@/app/admin/revisao/cronograma/liberacao-aulas/actions-trilhas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Mutações/consultas das abas Cronogramas e Regras da Liberação de aulas (JSON { op, produtoId, ...args }).
// Rota de API (e não server action direta) por causa dos domínios custom. Cada operação já faz checkPermission + auditoria.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as any
  if (!b || typeof b.op !== 'string') return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 })
  const p = String(b.produtoId ?? '')
  try {
    switch (b.op) {
      case 'salvarTrilha': return NextResponse.json(await salvarTrilha(p, b.entrada))
      case 'excluirTrilha': return NextResponse.json(await excluirTrilha(p, String(b.trilhaId)))
      case 'salvarSegmentosTrilha': return NextResponse.json(await salvarSegmentosTrilha(p, String(b.trilhaId), Array.isArray(b.segmentoIds) ? b.segmentoIds.map(String) : []))
      case 'salvarCelula': return NextResponse.json(await salvarCelula(p, b.entrada))
      case 'acaoGrade': return NextResponse.json(await acaoGrade(p, Array.isArray(b.aulaIds) ? b.aulaIds.map(String) : [], b.acao))
      case 'exportarGrade': return NextResponse.json(await linhasGradeExportar(p, b.filtros ?? {}))
      case 'previaRecalculo': return NextResponse.json(await previaRecalculoBase(p))
      case 'aplicarRecalculo': return NextResponse.json(await aplicarRecalculoBase(p, 'manual'))
      case 'contarAudiencia': return NextResponse.json(await contarAudienciaTrilhas(p, b.forcar === true))
      default: return NextResponse.json({ ok: false, error: 'Operação desconhecida.' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Falha ao processar a operação.' }, { status: 500 })
  }
}
