import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { alternarCheckMeta } from '@/app/aluno/(portal)/cronograma/checks-actions'

// POST /api/aluno/cronograma/check — marca/desmarca uma meta concluída (novo cronograma, design novo).
// Rota de API (não server action) por causa do landmine de domínio custom [[server-actions-rejeitadas]].
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, message: 'Não autenticado.' }, { status: 401 })
  let body: { emissaoId?: string; metaId?: string; marcar?: boolean; data?: string; titulo?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 }) }
  const { emissaoId, metaId } = body
  if (!emissaoId || !metaId) return NextResponse.json({ ok: false, message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  const r = await alternarCheckMeta(emissaoId, metaId, !!body.marcar, { data: body.data, titulo: body.titulo })
  if (!r.ok) return NextResponse.json({ ok: false, message: r.error ?? 'Falha ao marcar.' }, { status: 500 })
  return NextResponse.json({ ok: true, marcadaEm: r.marcadaEm ?? null })
}
