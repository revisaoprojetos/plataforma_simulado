import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/aluno/cronograma-pdf/[jobId] — status do PDF, para a tela acompanhar.
 *
 * Existe separada de `/api/pdf/jobs/[id]` porque aquela autentica por sessão do Supabase Auth
 * (admin). Aqui a credencial é o cookie do portal do aluno.
 *
 * O escopo é duplo: o job tem de ser do tenant DA SESSÃO e ter sido criado por este aluno.
 * Só o tenant deixaria um aluno acompanhar (e pegar a URL do) PDF de outro.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Sua sessão expirou.' }, { status: 401 })

  const svc = createAdminClient()
  const { data: job } = await svc
    .from('simulado_pdf_jobs')
    .select('id, tenant_id, criado_por, tipo, titulo, status, arquivo_url, erro')
    .eq('id', jobId)
    .maybeSingle()

  const j = job as
    | { tenant_id: string; criado_por: string | null; tipo: string; titulo: string | null; status: string; arquivo_url: string | null; erro: string | null }
    | null
  if (!j || j.tenant_id !== sessao.tenantId || j.criado_por !== sessao.estudanteId) {
    return NextResponse.json({ message: 'Job não encontrado.' }, { status: 404 })
  }

  return NextResponse.json({
    status: j.status,
    url: j.arquivo_url,
    titulo: j.titulo,
    erro: j.erro,
  })
}
