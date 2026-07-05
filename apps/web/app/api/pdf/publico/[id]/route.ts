import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/** GET /api/pdf/publico/[id]?sessao=... — status do job iniciado pelo aluno.
 *  Autorizado pela sessão: só devolve se o job foi criado para essa sessão (referencia). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = req.nextUrl.searchParams.get('sessao')
  if (!sessao) return NextResponse.json({ message: 'sessao obrigatória.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: job } = await svc
    .from('simulado_pdf_jobs')
    .select('id, referencia, status, arquivo_url, erro')
    .eq('id', id)
    .maybeSingle()

  if (!job || job.referencia !== sessao) {
    return NextResponse.json({ message: 'Job não encontrado.' }, { status: 404 })
  }
  return NextResponse.json({ id: job.id, status: job.status, url: job.arquivo_url, erro: job.erro })
}
