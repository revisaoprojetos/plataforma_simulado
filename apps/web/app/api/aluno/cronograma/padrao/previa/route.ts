import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { gerarCronograma } from '@/app/aluno/(portal)/cronograma/actions'
import { corpoPadraoSchema } from '@/lib/cronograma/padrao-schema'

// POST /api/aluno/cronograma/padrao/previa — monta a grade do cronograma PADRÃO SEM gravar nada
// (salvar=false). Rota de API (não server action: rejeitadas em domínio custom / iframe Curseduca).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 })
  const parsed = corpoPadraoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 })
  const b = parsed.data
  const r = await gerarCronograma(b.cronogramaId, b.opcoes, { nome: b.nome, paleta: b.paleta, semDatas: b.semDatas }, false)
  return NextResponse.json(r, { status: r.ok ? 200 : r.semAcesso ? 403 : 422 })
}
