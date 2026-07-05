import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { assinarRenderToken } from '@/lib/pdf/render-token'
import { enfileirarPdfCaderno } from '@/lib/queue/pdf-queue'

export const runtime = 'nodejs'

// Base interna que o Gotenberg usa p/ buscar a página (mesma do endpoint admin).
const WEB_INTERNAL = process.env.WEB_INTERNAL_URL ?? 'http://localhost:3000'

// Geração de PDF iniciada pelo PRÓPRIO ALUNO, autorizada pelo id da sessão
// (mesmo modelo de /imprimir/resultado). Sempre no servidor (worker + Gotenberg).
type Body = { sessaoToken: string; tipo: 'caderno' | 'resultado'; mod?: string; cadernoId?: string; gabarito?: boolean; titulo?: string }

export async function POST(request: NextRequest) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }
  if (!body.sessaoToken) return NextResponse.json({ message: 'sessaoToken obrigatório.' }, { status: 400 })

  const svc = createAdminClient()

  // A sessão é a credencial: existe? de qual tenant/estudante?
  const { data: sessao } = await svc
    .from('simulado_sessoes_prova')
    .select('id, tenant_id, estudante_id')
    .eq('id', body.sessaoToken)
    .maybeSingle()
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  const tenantId = sessao.tenant_id as string

  let url: string
  let titulo: string

  if (body.tipo === 'caderno') {
    if (!body.cadernoId) return NextResponse.json({ message: 'cadernoId obrigatório.' }, { status: 400 })
    // Confere que o caderno é do mesmo tenant da sessão.
    const { data: cad } = await svc
      .from('simulado_cadernos_designer')
      .select('id, nome')
      .eq('id', body.cadernoId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!cad) return NextResponse.json({ message: 'Caderno não encontrado.' }, { status: 404 })

    const token = assinarRenderToken({ t: tenantId, r: 'caderno', id: body.cadernoId })
    const qs = new URLSearchParams()
    if (body.mod) qs.set('mod', body.mod)
    qs.set('sessao', body.sessaoToken)
    if (sessao.estudante_id) qs.set('aluno', String(sessao.estudante_id))
    if (body.gabarito) qs.set('gabarito', '1')
    qs.set('pdftoken', token)
    url = `${WEB_INTERNAL}/imprimir/caderno/${body.cadernoId}?${qs.toString()}`
    titulo = body.titulo ?? `Caderno: ${cad.nome}`
  } else if (body.tipo === 'resultado') {
    url = `${WEB_INTERNAL}/imprimir/resultado/${body.sessaoToken}`
    titulo = body.titulo ?? 'Resultado do simulado'
  } else {
    return NextResponse.json({ message: 'tipo inválido.' }, { status: 400 })
  }

  // Job autorizado pela sessão: referencia = sessaoToken (o status confere por ela).
  const { data: job, error } = await svc
    .from('simulado_pdf_jobs')
    .insert({ tenant_id: tenantId, tipo: body.tipo, referencia: body.sessaoToken, titulo, status: 'pendente', criado_por: null })
    .select('id')
    .single()
  if (error || !job) {
    return NextResponse.json({ message: 'Falha ao registrar o job.', detalhe: error?.message }, { status: 500 })
  }

  try {
    await enfileirarPdfCaderno({ jobId: job.id, url, tenantId })
  } catch (e) {
    await svc.from('simulado_pdf_jobs').update({ status: 'erro', erro: 'Fila indisponível (Redis).' }).eq('id', job.id)
    return NextResponse.json({ message: 'Fila indisponível. O worker/Redis está no ar?', detalhe: (e as Error).message }, { status: 503 })
  }

  return NextResponse.json({ jobId: job.id, status: 'pendente' })
}
