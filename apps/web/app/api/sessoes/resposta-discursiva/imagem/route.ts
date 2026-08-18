import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStorage, uploadArquivo, validateFile, PRESETS } from '@/lib/storage'

// Upload das FOTOS da resposta discursiva (o aluno envia imagem em vez de digitar).
// Multipart (FormData). Espelha o guard de /api/sessoes/resposta-discursiva: confia no
// sessao_id (UUID) + status != finalizada — mesmo modelo do auto-save discursivo atual.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'discursivas'
const MAX_PAGINAS = 10
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

type Cliente = ReturnType<typeof createAdminClient>
interface Pagina { juncaoId: string; arquivoId: string; ordem: number; nome: string | null; url: string }

async function carregarSessao(svc: Cliente, sessaoId: string) {
  const { data } = await svc.from('simulado_sessoes_prova')
    .select('id, tenant_id, estudante_id, status').eq('id', sessaoId).maybeSingle()
  return data as { id: string; tenant_id: string; estudante_id: string; status: string } | null
}

/** Acha a resposta (sem criar). */
async function acharResposta(svc: Cliente, sessaoId: string, questaoId: string) {
  const { data } = await svc.from('simulado_respostas_discursivas')
    .select('id').eq('sessao_id', sessaoId).eq('questao_id', questaoId).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** Garante a linha da resposta (pendente) e devolve o id. */
async function garantirResposta(svc: Cliente, sessao: { id: string; tenant_id: string; estudante_id: string }, questaoId: string) {
  const { data, error } = await svc.from('simulado_respostas_discursivas')
    .upsert({
      tenant_id: sessao.tenant_id, sessao_id: sessao.id, questao_id: questaoId,
      estudante_id: sessao.estudante_id, status: 'pendente', atualizado_em: new Date().toISOString(),
    }, { onConflict: 'sessao_id,questao_id' })
    .select('id').single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

/** Páginas (arquivos) da resposta, na ordem, já com URL assinada. */
async function listarPaginas(svc: Cliente, respostaId: string): Promise<Pagina[]> {
  const { data: js } = await svc.from('simulado_resposta_arquivos')
    .select('id, arquivo_id, ordem').eq('resposta_id', respostaId).order('ordem', { ascending: true })
  if (!js?.length) return []
  const ids = (js as any[]).map((j) => j.arquivo_id)
  const { data: arqs } = await svc.from('simulado_arquivos').select('id, bucket, path, nome').in('id', ids)
  const arqMap = new Map((arqs ?? []).map((a: any) => [a.id, a]))
  const storage = getStorage()
  const out: Pagina[] = []
  for (const j of js as any[]) {
    const a = arqMap.get(j.arquivo_id)
    if (!a) continue
    let url = ''
    try { url = await storage.getSignedUrl(a.bucket, a.path, 3600) } catch { /* arquivo sumiu do storage */ }
    out.push({ juncaoId: j.id, arquivoId: a.id, ordem: j.ordem, nome: a.nome, url })
  }
  return out
}

// GET ?sessao_id&questao_id → lista as páginas já enviadas (com URL assinada).
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const sessaoId = sp.get('sessao_id'), questaoId = sp.get('questao_id')
  if (!sessaoId || !questaoId) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })
  const svc = createAdminClient()
  const sessao = await carregarSessao(svc, sessaoId)
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  const respostaId = await acharResposta(svc, sessaoId, questaoId)
  const paginas = respostaId ? await listarPaginas(svc, respostaId) : []
  return NextResponse.json({ paginas })
}

// POST (multipart): file(s) + sessao_id + questao_id → envia as fotos, devolve as páginas.
export async function POST(request: NextRequest) {
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ message: 'Envio inválido.' }, { status: 400 }) }
  const sessaoId = String(form.get('sessao_id') ?? '')
  const questaoId = String(form.get('questao_id') ?? '')
  if (!sessaoId || !questaoId) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })
  const arquivos = form.getAll('file').filter((f): f is File => f instanceof File)
  if (!arquivos.length) return NextResponse.json({ message: 'Nenhum arquivo.' }, { status: 400 })

  const svc = createAdminClient()
  const sessao = await carregarSessao(svc, sessaoId)
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  if (sessao.status === 'finalizada') return NextResponse.json({ message: 'Sessão finalizada.' }, { status: 409 })

  const respostaId = await garantirResposta(svc, sessao, questaoId)

  // Ordem inicial = após a última página existente; teto de páginas por questão.
  const { data: jaJs } = await svc.from('simulado_resposta_arquivos').select('ordem').eq('resposta_id', respostaId)
  let ordem = Math.max(-1, ...((jaJs ?? []).map((j: any) => Number(j.ordem) || 0)))
  const jaCount = (jaJs ?? []).length

  const erros: string[] = []
  let enviadas = 0
  for (const file of arquivos) {
    if (jaCount + enviadas >= MAX_PAGINAS) { erros.push(`Limite de ${MAX_PAGINAS} páginas por questão.`); break }
    const buf = new Uint8Array(await file.arrayBuffer())
    const v = validateFile(buf, file.type || 'application/octet-stream', PRESETS.imagem)
    if (!v.ok) { erros.push(`${file.name}: ${v.error}`); continue }
    const mime = v.mimeDetectado ?? file.type
    const ext = EXT[mime] ?? 'jpg'
    const up = await uploadArquivo({
      tenantId: sessao.tenant_id, bucket: BUCKET,
      path: `discursivas/${sessao.tenant_id}/${respostaId}/${crypto.randomUUID()}.${ext}`,
      data: buf, contentType: mime, nome: file.name || `pagina.${ext}`,
      publico: false, criadoPor: sessao.estudante_id,
    })
    if (!up.ok || !up.arquivoId) { erros.push(`${file.name}: ${up.error ?? 'falha no upload'}`); continue }
    const { error: eJ } = await svc.from('simulado_resposta_arquivos')
      .insert({ tenant_id: sessao.tenant_id, resposta_id: respostaId, arquivo_id: up.arquivoId, ordem: ++ordem })
    if (eJ) { erros.push(`${file.name}: ${eJ.message}`); continue }
    enviadas++
  }

  await svc.from('simulado_respostas_discursivas').update({ atualizado_em: new Date().toISOString() }).eq('id', respostaId)
  const paginas = await listarPaginas(svc, respostaId)
  return NextResponse.json({ ok: true, enviadas, erros, paginas }, { status: erros.length && !enviadas ? 422 : 200 })
}

// DELETE (json): { sessao_id, questao_id, juncao_id } → remove uma página.
export async function DELETE(request: NextRequest) {
  let body: { sessao_id?: string; questao_id?: string; juncao_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Inválido.' }, { status: 400 }) }
  const { sessao_id: sessaoId, questao_id: questaoId, juncao_id: juncaoId } = body
  if (!sessaoId || !questaoId || !juncaoId) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })

  const svc = createAdminClient()
  const sessao = await carregarSessao(svc, sessaoId)
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  if (sessao.status === 'finalizada') return NextResponse.json({ message: 'Sessão finalizada.' }, { status: 409 })
  const respostaId = await acharResposta(svc, sessaoId, questaoId)
  if (!respostaId) return NextResponse.json({ ok: true, paginas: [] })

  const { data: j } = await svc.from('simulado_resposta_arquivos')
    .select('id, arquivo_id').eq('id', juncaoId).eq('resposta_id', respostaId).maybeSingle()
  if (j) {
    const { data: a } = await svc.from('simulado_arquivos').select('bucket, path').eq('id', (j as any).arquivo_id).maybeSingle()
    if (a) { try { await getStorage().remove((a as any).bucket, (a as any).path) } catch { /* já sumiu */ } }
    await svc.from('simulado_resposta_arquivos').delete().eq('id', juncaoId)
    await svc.from('simulado_arquivos').delete().eq('id', (j as any).arquivo_id)
  }
  const paginas = await listarPaginas(svc, respostaId)
  return NextResponse.json({ ok: true, paginas })
}
