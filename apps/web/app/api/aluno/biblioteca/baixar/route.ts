import { registrarDownload } from '@/lib/conteudo/politica-download'
import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { liberacaoDoc } from '@/lib/cronograma/adaptativo/liberacao'
import { prepararDownloadAluno } from '@/lib/conteudo/leitor'
import { capaEPaginaDoDocumento } from '@/lib/conteudo/capa-pagina-server'
import {
  CONTENT_TYPE_POR_EXT, contentDispositionAnexo, decidirDownload, detectarTipoCapa, hostInternoProibido,
  montarPdfComCapa, sanitizarNomeArquivo,
} from '@/lib/conteudo/baixar-pura'
import { rateLimit } from '@/lib/rate-limit'

// GET /api/aluno/biblioteca/baixar?doc=<uuid>[&meta=<id>][&produto=<uuid>]
// Baixa o DOCUMENTO da meta do cronograma com o NOME do documento. Se o documento (ou a pasta em modo lote) tem CAPA
// cadastrada na Biblioteca, entrega um PDF com a capa como 1ª folha (páginas antes da "página inicial" saem, sem duplicar);
// sem capa, entrega o original sem alteração. Gate = o mesmo do download da Biblioteca (publicado, pasta+doc com herança,
// permissão baixar, liberação do cronograma). Sem URL assinada exposta: o servidor busca e devolve os bytes.
// `meta` é só informativo (o acesso é decidido pelo documento). Rota de API (não server action).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_DOC = 120 * 1024 * 1024 // PDF/DOCX original
const MAX_CAPA = 12 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'private, no-store' } })

/** fetch com teto de tamanho e timeout. `redirect` manual: cada salto é revalidado quando `validar` é passado. */
async function buscar(url: string, max: number, ms: number, validar?: (u: URL) => boolean): Promise<Uint8Array | null> {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), ms)
  try {
    let atual = url
    for (let salto = 0; salto < 4; salto++) {
      if (validar && !validar(new URL(atual))) return null
      const r = await fetch(atual, { signal: ctrl.signal, redirect: validar ? 'manual' : 'follow', cache: 'no-store' })
      if (validar && r.status >= 300 && r.status < 400) { const loc = r.headers.get('location'); if (!loc) return null; atual = new URL(loc, atual).toString(); continue }
      if (!r.ok || !r.body) return null
      const cl = Number(r.headers.get('content-length') || 0)
      if (cl && cl > max) return null
      const partes: Uint8Array[] = []; let total = 0
      const rd = r.body.getReader()
      for (;;) {
        const { done, value } = await rd.read()
        if (done) break
        total += value.byteLength
        if (total > max) { try { await rd.cancel() } catch {} return null }
        partes.push(value)
      }
      const out = new Uint8Array(total); let o = 0
      for (const p of partes) { out.set(p, o); o += p.byteLength }
      return out
    }
    return null
  } catch { return null } finally { clearTimeout(to) }
}

/** Capa (http/https público ou caminho do próprio app) → bytes de PNG/JPG/PDF. Outros formatos: tenta converter p/ PNG (sharp), senão null. */
async function carregarCapa(capaUrl: string, origem: string): Promise<{ tipo: 'png' | 'jpg' | 'pdf'; bytes: Uint8Array } | null> {
  let alvo: string
  if (capaUrl.startsWith('//')) return null
  if (capaUrl.startsWith('/')) alvo = origem + capaUrl
  else if (/^https?:\/\//i.test(capaUrl)) alvo = capaUrl
  else return null
  const proprio = new URL(origem).host
  const bytes = await buscar(alvo, MAX_CAPA, 15000, (u) => (u.protocol === 'https:' || u.protocol === 'http:') && (u.host === proprio || !hostInternoProibido(u.hostname)))
  if (!bytes) return null
  const tipo = detectarTipoCapa(bytes)
  if (tipo) return { tipo, bytes }
  try { // webp/gif/avif… → PNG (sharp, se disponível no servidor)
    const sharp = (await import('sharp' as string)).default
    const png = await sharp(Buffer.from(bytes)).png().toBuffer()
    return { tipo: 'png', bytes: new Uint8Array(png) }
  } catch { return null }
}

/** Envelope: NUNCA deixa estourar exceção (o cliente receberia 500 em HTML) e registra no servidor o que aconteceu (sem dados sensíveis). */
export async function GET(request: NextRequest) {
  const t0 = Date.now()
  const doc = (request.nextUrl.searchParams.get('doc') ?? '').slice(0, 8)
  try {
    const r = await baixar(request)
    console.log(`[baixar] doc=${doc}… status=${r.status} ${Date.now() - t0}ms`)
    return r
  } catch (e) {
    console.error(`[baixar] ERRO doc=${doc}… ${Date.now() - t0}ms`, (e as Error)?.message)
    return json(500, 'Não foi possível preparar o download agora. Tente novamente em instantes.')
  }
}

async function baixar(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoAluno()
  if (!sessao) return json(401, 'Faça login novamente para baixar.')
  const rl = rateLimit(`bib-baixar:${sessao.estudanteId}`, 12, 60_000)
  if (!rl.ok) return NextResponse.json({ ok: false, message: 'Muitos downloads seguidos. Aguarde um instante e tente de novo.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter), 'Cache-Control': 'private, no-store' } })
  const sp = request.nextUrl.searchParams
  const doc = sp.get('doc') ?? ''
  if (!UUID.test(doc)) return json(400, 'Documento inválido.')
  const produto = sp.get('produto')
  const produtoId = produto && UUID.test(produto) ? produto : null

  const metaParam = sp.get('meta')
  const metaId = metaParam && /^[\w:.\-]{1,120}$/.test(metaParam) ? metaParam : null
  const svc = createAdminClient()
  const lib = await liberacaoDoc(svc, sessao.tenantId, sessao.estudanteId, doc)
  if (lib.bloqueado) {
    await registrarDownload(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, documentoId: doc, origem: 'cronograma', metaId, produtoId, resultado: 'bloqueado', motivo: 'nao_liberado' })
    const quando = lib.liberaEm ? ` Ele será liberado em ${lib.liberaEm.split('-').reverse().join('/')}.` : ''
    return json(403, `Este material ainda não foi liberado no seu cronograma.${quando}`)
  }
  const prep = await prepararDownloadAluno(doc, sessao.estudanteId, { produtoId, origem: 'cronograma', metaId })
  if (!prep.ok) {
    if (prep.erro === 'tipo') return json(409, 'Este material não pode ser baixado (só PDF e documentos de texto). Abra-o no leitor.')
    if (prep.erro === 'inexistente') return json(404, 'Este material não está mais disponível.')
    if (prep.erro === 'indisponivel') return json(503, 'O arquivo deste material não está disponível agora. Tente novamente em instantes.')
    if (prep.erro === 'politica' || prep.erro === 'documento') return json(403, 'O download deste material está desativado. Abra-o no leitor da plataforma.')
    return json(403, 'Você não tem permissão para baixar este material.')
  }

  const { capaUrl, paginaInicial } = await capaEPaginaDoDocumento(svc, sessao.tenantId, doc)
  const dec = decidirDownload(prep.tipoOrigem, capaUrl, paginaInicial)

  const entregar = (bytes: Uint8Array, ext: 'pdf' | 'docx') => {
    const nome = sanitizarNomeArquivo(prep.titulo, ext)
    return new Response(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPE_POR_EXT[ext],
        'Content-Disposition': contentDispositionAnexo(nome),
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // Sem capa: o original, sem alteração.
  const original = async () => buscar(prep.urlOriginal, MAX_DOC, 40000)
  if (!dec.comCapa) {
    const b = await original()
    return b ? entregar(b, prep.tipoOrigem) : json(503, 'Não foi possível obter o arquivo agora. Tente novamente em instantes.')
  }

  // Com capa: PDF-base (o próprio PDF, ou o DOCX convertido) + capa na frente. Qualquer falha na capa degrada para o original.
  try {
    const urlPdf = await prep.urlPdf()
    const base = urlPdf ? await buscar(urlPdf, MAX_DOC, 40000) : null
    const capa = base ? await carregarCapa(capaUrl as string, request.nextUrl.origin) : null
    if (base && capa) {
      const pdf = await montarPdfComCapa(base, capa, { descartarAntes: dec.descartarAntes, titulo: prep.titulo })
      return entregar(pdf, 'pdf')
    }
    console.warn(`[baixar] capa não aplicada doc=${doc.slice(0, 8)}… base=${base ? 'ok' : 'falhou'} capa=${capa ? 'ok' : 'falhou'} → entrega o original`)
  } catch (e) { console.error('[baixar] falha ao montar PDF com capa', doc, (e as Error)?.message) }
  const b = await original()
  return b ? entregar(b, prep.tipoOrigem) : json(503, 'Não foi possível obter o arquivo agora. Tente novamente em instantes.')
}
