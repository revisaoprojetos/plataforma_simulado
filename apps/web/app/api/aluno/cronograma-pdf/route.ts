import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { assinarRenderToken } from '@/lib/pdf/render-token'
import { enfileirarPdfCaderno } from '@/lib/queue/pdf-queue'
import { registrarDownloadCronograma } from '@/app/aluno/(portal)/cronograma/download-actions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Base interna que o GOTENBERG usa para buscar a página. Não é a URL pública: dentro do
 * compose, o Gotenberg fala com o serviço `web` pela rede do Docker.
 */
const WEB_INTERNAL = process.env.WEB_INTERNAL_URL ?? 'http://localhost:3000'

/** Quanto esperamos o Redis aceitar o job antes de considerar a fila fora do ar. */
const LIMITE_FILA_MS = 4000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/aluno/cronograma-pdf — enfileira o PDF do cronograma do aluno.
 *
 * Reusa a esteira que a plataforma já tem: web enfileira → worker chama o Gotenberg
 * (Chromium, fora do app) → PDF vai para o bucket `pdfs` → a UI acompanha pelo jobId.
 *
 * Rota PRÓPRIA do aluno, e não a `/api/pdf/gerar`: aquela exige sessão do Supabase Auth
 * (`getCurrentAccess`), que é do admin. O aluno tem o cookie próprio do portal.
 *
 * Devolve { jobId } — e o corpo diz explicitamente quando a fila não está configurada, para
 * a tela poder cair na impressão do navegador em vez de só falhar.
 */
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Sua sessão expirou.' }, { status: 401 })

  let emissaoId = ''
  try {
    emissaoId = String(((await request.json()) as { emissaoId?: string }).emissaoId ?? '')
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }
  if (!UUID_RE.test(emissaoId)) {
    return NextResponse.json({ message: 'Cronograma não encontrado.' }, { status: 400 })
  }

  // A emissão tem de ser DESTE aluno. É o que autoriza assinar o token depois — o token
  // abre a página sem cookie, então a checagem tem de acontecer aqui e não lá.
  const svc = createAdminClient()
  const { data: emissao } = await svc
    .from('simulado_cronograma_emissoes')
    .select('id, titulo, cronograma_nome')
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
    .maybeSingle()
  if (!emissao) return NextResponse.json({ message: 'Cronograma não encontrado.' }, { status: 404 })

  const e = emissao as { titulo: string | null; cronograma_nome: string }
  const titulo = e.titulo || e.cronograma_nome

  if (!process.env.PDF_RENDER_SECRET) {
    // Sem o segredo, o token nunca valeria e o Gotenberg receberia a página de login.
    // Melhor dizer isso do que enfileirar um job que já nasce condenado.
    return NextResponse.json(
      { message: 'Geração de PDF não configurada neste ambiente.', semFila: true },
      { status: 503 },
    )
  }

  const { data: job, error: erroJob } = await svc
    .from('simulado_pdf_jobs')
    .insert({
      tenant_id: sessao.tenantId,
      tipo: 'cronograma',
      referencia: emissaoId,
      titulo,
      status: 'pendente',
      criado_por: sessao.estudanteId,
    })
    .select('id')
    .single()
  if (erroJob || !job) {
    return NextResponse.json({ message: erroJob?.message ?? 'Não foi possível criar o job.' }, { status: 500 })
  }

  const jobId = (job as { id: string }).id
  const token = assinarRenderToken({ t: sessao.tenantId, r: 'cronograma', id: emissaoId })
  const url = `${WEB_INTERNAL}/imprimir/cronograma/${emissaoId}?pdftoken=${encodeURIComponent(token)}&embed=1`

  /* Com Redis fora do ar, `queue.add()` NÃO rejeita: o ioredis é configurado com
     `maxRetriesPerRequest: null` e fica tentando reconectar para sempre — a requisição
     penduraria e o botão giraria até o teto de espera do cliente. O limite abaixo transforma
     "indisponível" numa resposta rápida, que é o que deixa a tela cair na impressão do
     navegador na hora em vez de fazer o aluno esperar por nada. */
  try {
    await Promise.race([
      enfileirarPdfCaderno({ jobId, url, tenantId: sessao.tenantId }),
      new Promise((_, rejeitar) =>
        setTimeout(() => rejeitar(new Error('fila não respondeu a tempo')), LIMITE_FILA_MS),
      ),
    ])
  } catch (err) {
    const msg = (err as Error).message ?? 'fila indisponível'
    await svc.from('simulado_pdf_jobs').update({ status: 'erro', erro: msg }).eq('id', jobId)
    return NextResponse.json({ message: 'A fila de PDF não está disponível agora.', semFila: true }, { status: 503 })
  }

  // Registro do download no momento do PEDIDO — é aqui que o aluno decidiu levar o arquivo.
  await registrarDownloadCronograma(emissaoId, 'pdf')

  return NextResponse.json({ jobId, titulo })
}
