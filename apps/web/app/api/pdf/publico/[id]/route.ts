import { NextRequest, NextResponse } from 'next/server'
import { urlDoJobPdf } from '@/lib/storage/pdf-acesso'
import { createAdminClient } from '@/lib/supabase/server'
import { sessaoNoTenantDoRequisitante } from '@/lib/simulado/sessao-guard'

// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

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
    .select('id, tenant_id, referencia, status, arquivo_path, arquivo_url, erro')
    .eq('id', id)
    .maybeSingle()

  if (!job || job.referencia !== sessao) {
    return NextResponse.json({ message: 'Job não encontrado.' }, { status: 404 })
  }
  // IDOR: a sessão precisa ser do requisitante (dono, com cookie; tenant do host, no embed) e do tenant do job.
  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('id, tenant_id, estudante_id')
    .eq('id', sessao)
    .maybeSingle()
  if (!sess || (job.tenant_id && sess.tenant_id !== job.tenant_id) || !(await sessaoNoTenantDoRequisitante(sess))) {
    return NextResponse.json({ message: 'Job não encontrado.' }, { status: 404 })
  }
  return NextResponse.json({ id: job.id, status: job.status, url: urlDoJobPdf(job), erro: job.erro })
}
