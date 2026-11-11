import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { salvarNota } from '@/app/aluno/(portal)/cronograma/notas-actions'

// POST /api/aluno/cronograma/nota — grava/apaga a anotação do aluno numa meta (texto vazio apaga).
// Rota de API (não server action): server actions são rejeitadas em domínio custom / iframe Curseduca.
// A checagem de dono da emissão fica dentro de salvarNota.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 })
  let b: { emissaoId?: string; metaId?: string; texto?: string; data?: string | null; titulo?: string | null }
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 }) }
  if (!b.emissaoId || !b.metaId) return NextResponse.json({ ok: false, error: 'Dados obrigatórios ausentes.' }, { status: 400 })
  const r = await salvarNota(b.emissaoId, b.metaId, String(b.texto ?? ''), { data: b.data, titulo: b.titulo })
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
