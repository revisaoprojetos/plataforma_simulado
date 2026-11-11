import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { salvarPreferencias } from '@/app/aluno/(portal)/cronograma/preferencias-actions'
import { normalizarPreferencias } from '@/lib/cronograma/preferencias'

// POST /api/aluno/cronograma/preferencias — estado de leitura do aluno na emissão (semanas fechadas, números ocultos).
// Rota de API (não server action) por causa do domínio custom / iframe Curseduca. Dono validado em salvarPreferencias.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, error: 'Sua sessão expirou.' }, { status: 401 })
  let b: { emissaoId?: string; prefs?: unknown }
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 }) }
  if (!b.emissaoId) return NextResponse.json({ ok: false, error: 'Cronograma ausente.' }, { status: 400 })
  const r = await salvarPreferencias(b.emissaoId, normalizarPreferencias(b.prefs))
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
