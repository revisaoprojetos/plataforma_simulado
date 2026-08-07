import 'server-only'
import { createHash } from 'crypto'
import { BUCKET_IMAGENS } from '@/lib/storage/bucket-imagens'

/** Registra metadados no catálogo central `simulado_arquivos` (best-effort, idempotente por path). */
async function registrarArquivo(svc: any, meta: { tenantId: string; nome: string; tipo: string; bucket: string; path: string; tamanho: number; criadoPor?: string | null }) {
  try {
    const { data: existe } = await svc.from('simulado_arquivos').select('id').eq('tenant_id', meta.tenantId).eq('bucket', meta.bucket).eq('path', meta.path).limit(1)
    if (existe?.length) return
    await svc.from('simulado_arquivos').insert({
      tenant_id: meta.tenantId, nome: meta.nome, tipo_mime: meta.tipo, tamanho_bytes: meta.tamanho,
      provider: 'supabase', bucket: meta.bucket, path: meta.path, publico: true, criado_por: meta.criadoPor ?? null,
    })
  } catch { /* catálogo é secundário — nunca bloqueia o upload */ }
}

/**
 * Se `valor` for um data URL base64 de imagem, faz upload para `{BUCKET_IMAGENS}/assets/` (dedupe por
 * hash de conteúdo — sobe 1× por imagem) e devolve a URL pública. Se já for URL/caminho (ou não for
 * base64), devolve inalterado. Best-effort: em qualquer falha de storage, MANTÉM o valor original (não
 * quebra o save). Usado nos saves que antes gravavam base64 gigante direto na linha do banco (banners/tema).
 *
 * Passe `opts.tenantId` para também registrar o arquivo no catálogo `simulado_arquivos` (rastreio central).
 */
export async function hospedarBase64(valor: string | null | undefined, svc: any, opts?: { tenantId?: string | null; criadoPor?: string | null }): Promise<string | null> {
  const v = (valor ?? '').trim()
  if (!v) return null
  if (!v.startsWith('data:image')) return v // já é URL/caminho → nada a fazer
  const m = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i.exec(v)
  if (!m) return v
  const tipo = m[1].toLowerCase()
  const ext = tipo === 'jpeg' ? 'jpg' : tipo
  const buf = Buffer.from(m[2], 'base64')
  const nome = `${createHash('sha1').update(buf).digest('hex').slice(0, 24)}.${ext}`
  const path = `assets/${nome}`
  try {
    const { data: lista } = await svc.storage.from(BUCKET_IMAGENS).list('assets', { search: nome, limit: 1 })
    if (!lista?.some((f: any) => f.name === nome)) {
      await svc.storage.from(BUCKET_IMAGENS).upload(path, buf, { contentType: `image/${tipo}`, upsert: true })
    }
    if (opts?.tenantId) await registrarArquivo(svc, { tenantId: opts.tenantId, nome, tipo: `image/${tipo}`, bucket: BUCKET_IMAGENS, path, tamanho: buf.length, criadoPor: opts.criadoPor })
    return (svc.storage.from(BUCKET_IMAGENS).getPublicUrl(path).data.publicUrl as string) || v
  } catch {
    return v // storage indisponível → mantém base64 (não bloqueia o save)
  }
}

/**
 * Percorre um objeto (ex.: `tema` jsonb) e troca TODA string base64 de imagem por URL hospedada,
 * mutando in-place. Usado antes de gravar o tema (logo, login, fundos) para não inflar a linha do
 * tenant com data URLs enormes. Best-effort por campo (mantém base64 se o upload falhar).
 */
export async function hospedarBase64NoObjeto(obj: any, svc: any): Promise<void> {
  if (!obj || typeof obj !== 'object') return
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (typeof v === 'string' && v.startsWith('data:image')) { const u = await hospedarBase64(v, svc); if (u) obj[k] = u }
    else if (v && typeof v === 'object') await hospedarBase64NoObjeto(v, svc)
  }
}
