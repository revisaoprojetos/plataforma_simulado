import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { listarMinhasEmissoes } from '@/app/aluno/(portal)/cronograma/emissoes-actions'

// POST /api/aluno/cronograma/minhas — lista paginada (busca no banco) das emissões do aluno, ativas ou arquivadas.
// Rota de API (não server action) por causa do domínio custom / iframe Curseduca. Escopo por sessão dentro de listarMinhasEmissoes.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, error: 'Sua sessão expirou.' }, { status: 401 })
  let b: { busca?: string; pagina?: number; porPagina?: number; arquivadas?: boolean } = {}
  try { b = await req.json() } catch { /* corpo vazio = defaults */ }
  const r = await listarMinhasEmissoes({
    busca: String(b.busca ?? '').slice(0, 80),
    pagina: Number(b.pagina) || 0,
    porPagina: Number(b.porPagina) || 20,
    arquivadas: !!b.arquivadas,
  })
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
