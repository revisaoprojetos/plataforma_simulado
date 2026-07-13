import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { assinarRenderToken } from '@/lib/pdf/render-token'
import { enfileirarPdfCaderno } from '@/lib/queue/pdf-queue'
import { registrarRelatorioEvento } from '@/lib/relatorio-eventos'
import { dispararWebhook } from '@/lib/webhooks/dispatch'
import { dadosProgressao } from '@/lib/webhooks/payload'

export const runtime = 'nodejs'

// Base interna que o Gotenberg usa p/ buscar a página. Em produção (docker) é
// http://web:3000; em dev pode ser host.docker.internal:3000.
const WEB_INTERNAL = process.env.WEB_INTERNAL_URL ?? 'http://localhost:3000'

type Body =
  | { tipo: 'caderno'; cadernoId: string; mod?: string; todos?: boolean; aluno?: string; sessao?: string; gabarito?: boolean; titulo?: string }
  | { tipo: 'resultado'; sessaoToken: string; titulo?: string }
  | { tipo: 'ranking'; simuladoId: string; ate?: number; titulo?: string }
  | { tipo: 'relatorio'; sub: 'simulado' | 'disciplina' | 'estudante' | 'grafico'; ref: string; titulo?: string }

/**
 * POST /api/pdf/gerar — enfileira a geração de um PDF no worker (Gotenberg).
 * Retorna { jobId } para a UI acompanhar em /api/pdf/jobs/[id].
 */
export async function POST(request: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  }
  if (!access.isAdmin && !accessCan(access, 'questoes:view')) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  const svc = createAdminClient()
  let url: string
  let referencia: string
  let titulo: string

  if (body.tipo === 'caderno') {
    if (!body.cadernoId) return NextResponse.json({ message: 'cadernoId obrigatório.' }, { status: 400 })

    // Confere que o caderno é do tenant do usuário.
    const { data: cad } = await svc
      .from('simulado_cadernos_designer')
      .select('id, nome')
      .eq('id', body.cadernoId)
      .eq('tenant_id', access.tenantId)
      .maybeSingle()
    if (!cad) return NextResponse.json({ message: 'Caderno não encontrado.' }, { status: 404 })

    // Token curto que autoriza o Gotenberg (sem cookie) a renderizar este caderno.
    const token = assinarRenderToken({ t: access.tenantId, r: 'caderno', id: body.cadernoId })
    const qs = new URLSearchParams()
    if (body.mod) qs.set('mod', body.mod)
    if (body.todos) qs.set('todos', '1')
    if (body.aluno) qs.set('aluno', body.aluno)
    if (body.sessao) qs.set('sessao', body.sessao)
    if (body.gabarito) qs.set('gabarito', '1')
    qs.set('pdftoken', token)

    url = `${WEB_INTERNAL}/imprimir/caderno/${body.cadernoId}?${qs.toString()}`
    referencia = body.cadernoId
    titulo = body.titulo ?? `Caderno: ${cad.nome}${body.todos ? ' (todos os alunos)' : ''}`
  } else if (body.tipo === 'resultado') {
    if (!body.sessaoToken) return NextResponse.json({ message: 'sessaoToken obrigatório.' }, { status: 400 })

    // /imprimir/resultado autoriza pelo próprio id da sessão — sem token.
    // Confere que a sessão é do tenant.
    const { data: sessao } = await svc
      .from('simulado_sessoes_prova')
      .select('id, tenant_id, simulado_id, estudante_id')
      .eq('id', body.sessaoToken)
      .maybeSingle()
    if (!sessao || sessao.tenant_id !== access.tenantId) {
      return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
    }

    // Engajamento: baixar o PDF do resultado conta como download do relatório do aluno.
    await registrarRelatorioEvento(svc, {
      tenantId: access.tenantId, simuladoId: sessao.simulado_id, estudanteId: sessao.estudante_id, sessaoId: sessao.id, tipo: 'baixou',
    })
    await dispararWebhook(access.tenantId, 'estudante.baixou_relatorio', await dadosProgressao(svc, sessao as any))

    url = `${WEB_INTERNAL}/imprimir/resultado/${body.sessaoToken}`
    referencia = body.sessaoToken
    titulo = body.titulo ?? 'Resultado do simulado'
  } else if (body.tipo === 'ranking') {
    if (!body.simuladoId) return NextResponse.json({ message: 'simuladoId obrigatório.' }, { status: 400 })

    // Confere que o simulado é do tenant do usuário.
    const { data: sim } = await svc
      .from('simulado_simulados')
      .select('id, titulo')
      .eq('id', body.simuladoId)
      .eq('tenant_id', access.tenantId)
      .maybeSingle()
    if (!sim) return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })

    const token = assinarRenderToken({ t: access.tenantId, r: 'ranking', id: body.simuladoId })
    const qs = new URLSearchParams()
    if (body.ate) qs.set('ate', String(body.ate))
    qs.set('pdftoken', token)

    url = `${WEB_INTERNAL}/imprimir/ranking/${body.simuladoId}?${qs.toString()}`
    referencia = body.simuladoId
    titulo = body.titulo ?? `Ranking: ${sim.titulo ?? ''}`
  } else if (body.tipo === 'relatorio') {
    const subs = ['simulado', 'disciplina', 'estudante', 'grafico']
    if (!subs.includes(body.sub) || !body.ref) {
      return NextResponse.json({ message: 'sub/ref obrigatórios.' }, { status: 400 })
    }

    // Confere que o recurso é do tenant do usuário (grafico é escopado ao próprio tenant).
    let rotulo = 'Relatório'
    if (body.sub === 'simulado') {
      const { data } = await svc.from('simulado_simulados').select('titulo').eq('id', body.ref).eq('tenant_id', access.tenantId).maybeSingle()
      if (!data) return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })
      rotulo = `Relatório do simulado: ${data.titulo ?? ''}`
    } else if (body.sub === 'disciplina') {
      const { data } = await svc.from('simulado_disciplinas').select('nome').eq('id', body.ref).eq('tenant_id', access.tenantId).maybeSingle()
      if (!data) return NextResponse.json({ message: 'Disciplina não encontrada.' }, { status: 404 })
      rotulo = `Relatório da disciplina: ${data.nome ?? ''}`
    } else if (body.sub === 'estudante') {
      const { data } = await svc.from('simulado_estudantes').select('nome').eq('id', body.ref).eq('tenant_id', access.tenantId).maybeSingle()
      if (!data) return NextResponse.json({ message: 'Estudante não encontrado.' }, { status: 404 })
      rotulo = `Relatório do estudante: ${data.nome ?? ''}`
    } else {
      // grafico: ref precisa ser o próprio tenant.
      if (body.ref !== access.tenantId) return NextResponse.json({ message: 'Referência inválida.' }, { status: 400 })
      rotulo = 'Relatório gráfico (visão geral)'
    }

    const token = assinarRenderToken({ t: access.tenantId, r: `rel-${body.sub}`, id: body.ref })
    url = `${WEB_INTERNAL}/imprimir/relatorio/${body.sub}/${body.ref}?pdftoken=${encodeURIComponent(token)}`
    referencia = body.ref
    titulo = body.titulo ?? rotulo
  } else {
    return NextResponse.json({ message: 'tipo inválido.' }, { status: 400 })
  }

  // Cria o registro do job (status pendente).
  const { data: job, error } = await svc
    .from('simulado_pdf_jobs')
    .insert({
      tenant_id: access.tenantId,
      tipo: body.tipo,
      referencia,
      titulo,
      status: 'pendente',
      criado_por: access.userId,
    })
    .select('id')
    .single()

  if (error || !job) {
    return NextResponse.json({ message: 'Falha ao registrar o job.', detalhe: error?.message }, { status: 500 })
  }

  try {
    await enfileirarPdfCaderno({ jobId: job.id, url, tenantId: access.tenantId })
  } catch (e) {
    await svc.from('simulado_pdf_jobs').update({ status: 'erro', erro: 'Fila indisponível (Redis).' }).eq('id', job.id)
    return NextResponse.json({ message: 'Fila indisponível. O worker/Redis está no ar?', detalhe: (e as Error).message }, { status: 503 })
  }

  return NextResponse.json({ jobId: job.id, status: 'pendente' })
}
