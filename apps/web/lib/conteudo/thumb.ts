import 'server-only'
import { SignJWT } from 'jose'
import { createAdminClient } from '@/lib/supabase/server'
import { uploadArquivo } from '@/lib/storage'
import { resolverBucketConteudo, urlAssinadaOriginal } from './ingestao'

// Miniatura FIEL do card: converte o .docx na imagem PNG da 1ª página via ConvertService do OnlyOffice
// (o mesmo Document Server do editor). Assim o card mostra o documento com blocos/cores reais — igual
// aos Modelos de Caderno — em vez de texto puro. Server-only.
//
// O app chama o Document Server servidor-a-servidor: no localhost (app no host) o próprio
// NEXT_PUBLIC_ONLYOFFICE_URL (localhost:8082) resolve; em produção (app no docker) use
// ONLYOFFICE_INTERNAL_URL (ex.: http://onlyoffice ou http://host.docker.internal:8082).
function internalUrl(): string {
  return process.env.ONLYOFFICE_INTERNAL_URL || process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082'
}

export async function gerarThumbDocx(url: string, key: string, fileType = 'docx'): Promise<Buffer | null> {
  const payload: Record<string, any> = {
    async: false,
    filetype: fileType,
    outputtype: 'png',
    key: key.replace(/[^a-z0-9_-]/gi, '').slice(0, 60),
    title: `thumb.${fileType}`,
    url,
    // 1ª página, proporção mantida (aspect:1) e ALTA RESOLUÇÃO (sem width/height sai ~77px → borrado).
    thumbnail: { first: true, aspect: 1, width: 1000, height: 1414 },
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  const segredo = process.env.ONLYOFFICE_JWT_SECRET
  if (segredo) {
    const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(segredo))
    payload.token = token
    headers.Authorization = `Bearer ${token}`
  }
  try {
    // Timeout curto: se o OnlyOffice estiver fora do ar, falha rápido (não trava a geração da capa).
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 4000)
    let resp: Response
    try { resp = await fetch(`${internalUrl()}/ConvertService.ashx`, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal }) }
    finally { clearTimeout(to) }
    if (!resp.ok) return null
    const j: any = await resp.json().catch(() => null)
    if (!j || j.error || !j.fileUrl) return null
    const img = await fetch(j.fileUrl)
    if (!img.ok) return null
    return Buffer.from(await img.arrayBuffer())
  } catch { return null }
}

// _r1k = marca da resolução (1000px): trocar a resolução muda a chave e força regeneração.
function thumbPath(tenantId: string, versaoId: string, hash: string) {
  return `conteudo-thumbs/${tenantId}/${versaoId}_${String(hash || '').slice(0, 8)}_r1k.png`
}

/** Resolve a versão atual/mais nova do documento (.docx), gera a thumb FIEL via OnlyOffice e guarda no
 *  storage (cache por versão/hash). Reutilizável pela leitura (card) E pela pré-geração (publicar/editar).
 *  `forcar` pula a verificação de cache (usado logo após uma edição). Best-effort → null em qualquer falha. */
export async function gerarThumbDocumento(tenantId: string, documentoId: string, opts?: { forcar?: boolean; latest?: boolean }): Promise<string | null> {
  try {
    const svc = createAdminClient()
    const { data: doc } = await svc.from('simulado_conteudo_documentos')
      .select('tipo_origem, versao_atual_id').eq('tenant_id', tenantId).eq('id', documentoId).eq('deletado', false).maybeSingle()
    if (!doc || (doc as any).tipo_origem !== 'docx') return null
    const campos = 'id, arquivo_key, hash_arquivo'
    let ver: any = null
    // `latest`: ignora versao_atual_id e usa a última por numero (o template EDITADO vive num rascunho mais
    // novo que a versão publicada/importada). Default: versao_atual_id → fallback na mais nova.
    if (!opts?.latest && (doc as any).versao_atual_id) ver = (await svc.from('simulado_conteudo_versoes').select(campos).eq('tenant_id', tenantId).eq('id', (doc as any).versao_atual_id).maybeSingle()).data
    if (!ver) ver = (await svc.from('simulado_conteudo_versoes').select(campos).eq('tenant_id', tenantId).eq('documento_id', documentoId).order('numero', { ascending: false }).limit(1).maybeSingle()).data
    if (!ver?.arquivo_key) return null
    const path = thumbPath(tenantId, ver.id, ver.hash_arquivo)
    // Cache: a thumb já existe no storage? `urlAssinadaOriginal` só devolve URL se o OBJETO EXISTE
    // (createSignedUrl erra em "Object not found"). Não usar HEAD aqui: a URL assinada do Supabase não
    // responde bem a HEAD → o cache falhava sempre e REGERAVA toda vez (lento).
    if (!opts?.forcar) {
      const cached = await urlAssinadaOriginal(path, 3600)
      if (cached) return cached
    }
    const src = await urlAssinadaOriginal(ver.arquivo_key, 600)
    if (!src) return null
    const png = await gerarThumbDocx(src, `thumb_${ver.id}_${String(ver.hash_arquivo || '').slice(0, 8)}`)
    if (!png) return null
    // Guarda no storage e devolve a URL ASSINADA (evita trafegar o PNG em base64 — centenas de KB — na
    // resposta da action; a próxima leitura também usa a URL cacheada). Só cai no data URL se o storage hesitar.
    try {
      await uploadArquivo({ tenantId, bucket: await resolverBucketConteudo(), path, data: png, contentType: 'image/png', nome: 'thumb.png', publico: false, criadoPor: null })
      const url = await urlAssinadaOriginal(path, 3600)
      if (url) return url
    } catch { /* cache best-effort → cai no data URL abaixo */ }
    return `data:image/png;base64,${png.toString('base64')}`
  } catch { return null }
}

// ── PDF da versão (documento INTEIRO) via OnlyOffice ConvertService — para a prévia grande, carregada
// progressivamente pelo visualizador de PDF nativo do navegador. Cacheado por versão/hash no storage. ──
export async function converterDocxParaPdf(url: string, key: string, fileType = 'docx'): Promise<Buffer | null> {
  const payload: Record<string, any> = {
    async: false, filetype: fileType, outputtype: 'pdf',
    key: key.replace(/[^a-z0-9_-]/gi, '').slice(0, 60), title: `doc.${fileType}`, url,
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  const segredo = process.env.ONLYOFFICE_JWT_SECRET
  if (segredo) {
    const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(segredo))
    payload.token = token
    headers.Authorization = `Bearer ${token}`
  }
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 45000) // conversão de PDF pode demorar mais
    let resp: Response
    try { resp = await fetch(`${internalUrl()}/ConvertService.ashx`, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal }) }
    finally { clearTimeout(to) }
    if (!resp.ok) return null
    const j: any = await resp.json().catch(() => null)
    if (!j || j.error || !j.fileUrl) return null
    const f = await fetch(j.fileUrl)
    if (!f.ok) return null
    return Buffer.from(await f.arrayBuffer())
  } catch { return null }
}

function pdfPath(tenantId: string, versaoId: string, hash: string) {
  return `conteudo-pdfs/${tenantId}/${versaoId}_${String(hash || '').slice(0, 8)}.pdf`
}


/** PDF (doc inteiro) da versão atual/mais nova. Se já é PDF, devolve o original. Cacheado. null = falhou. */
export async function gerarPdfDocumento(tenantId: string, documentoId: string): Promise<string | null> {
  try {
    const svc = createAdminClient()
    const { data: doc } = await svc.from('simulado_conteudo_documentos')
      .select('tipo_origem, versao_atual_id').eq('tenant_id', tenantId).eq('id', documentoId).eq('deletado', false).maybeSingle()
    if (!doc) return null
    const campos = 'id, arquivo_key, hash_arquivo'
    let ver: any = null
    if ((doc as any).versao_atual_id) ver = (await svc.from('simulado_conteudo_versoes').select(campos).eq('tenant_id', tenantId).eq('id', (doc as any).versao_atual_id).maybeSingle()).data
    if (!ver) ver = (await svc.from('simulado_conteudo_versoes').select(campos).eq('tenant_id', tenantId).eq('documento_id', documentoId).order('numero', { ascending: false }).limit(1).maybeSingle()).data
    if (!ver?.arquivo_key) return null
    if ((doc as any).tipo_origem === 'pdf') return await urlAssinadaOriginal(ver.arquivo_key, 3600) // já é PDF
    if ((doc as any).tipo_origem !== 'docx') return null
    const path = pdfPath(tenantId, ver.id, ver.hash_arquivo)
    const cached = await urlAssinadaOriginal(path, 3600)
    if (cached) return cached
    const src = await urlAssinadaOriginal(ver.arquivo_key, 600)
    if (!src) return null
    const pdf = await converterDocxParaPdf(src, `pdf_${ver.id}_${String(ver.hash_arquivo || '').slice(0, 8)}`)
    if (!pdf) return null
    try {
      await uploadArquivo({ tenantId, bucket: await resolverBucketConteudo(), path, data: pdf, contentType: 'application/pdf', nome: 'doc.pdf', publico: false, criadoPor: null })
      const url = await urlAssinadaOriginal(path, 3600)
      if (url) return url
    } catch { /* cache best-effort */ }
    return null
  } catch { return null }
}
