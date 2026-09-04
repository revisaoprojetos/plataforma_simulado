import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarDiffAluno } from '@/lib/leitura/acesso'

// GET /api/leitura/alteracoes?doc=<id>[&de=<versao>] — "o que mudou" entre versões publicadas.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const doc = request.nextUrl.searchParams.get('doc')
  if (!doc) return NextResponse.json({ message: 'doc ausente.' }, { status: 400 })
  const de = Number(request.nextUrl.searchParams.get('de')) || undefined
  const r = await carregarDiffAluno(doc, sessao.estudanteId, sessao.tenantId, de)
  if (!r.ok) return NextResponse.json({ message: r.error ?? 'Falhou.' }, { status: 403 })
  return NextResponse.json({ diff: r.diff, de: r.de, para: r.para })
}
