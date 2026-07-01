import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'

export const runtime = 'nodejs'

/** GET /api/pdf/jobs/[id] — status do job de PDF (para polling da UI). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  }

  const svc = createAdminClient()
  const { data: job } = await svc
    .from('simulado_pdf_jobs')
    .select('id, tenant_id, tipo, titulo, status, arquivo_url, erro, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (!job || job.tenant_id !== access.tenantId) {
    return NextResponse.json({ message: 'Job não encontrado.' }, { status: 404 })
  }

  return NextResponse.json({
    id: job.id,
    tipo: job.tipo,
    titulo: job.titulo,
    status: job.status,
    url: job.arquivo_url,
    erro: job.erro,
  })
}
