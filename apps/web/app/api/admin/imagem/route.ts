import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getStorage } from '@/lib/storage'
import { BUCKET_IMAGENS } from '@/lib/storage/bucket-imagens'

// Upload de IMAGEM do admin (capas, banners, logos, favicon, imagens de vitrine/novidades…) a partir do
// COMPUTADOR — usado pelo <CampoImagem> (components/admin/campo-imagem.tsx). Antes esses campos só
// aceitavam URL. Multipart (sem base64 em server action). Salva em {BUCKET_IMAGENS}/assets/<sha1>.<ext>
// (dedupe por conteúdo, mesmo esquema do hospedarBase64) no provider configurado (Supabase ou S3) e
// devolve a URL pública.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024
const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/avif': 'avif',
}

export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.length > 0)) {
    return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  }

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ ok: false, error: 'Envio inválido.' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Nenhum arquivo enviado.' }, { status: 400 })
  const tipo = (file.type || '').toLowerCase()
  const ext = EXT[tipo]
  if (!ext) return NextResponse.json({ ok: false, error: 'Formato não suportado. Use PNG, JPG, WEBP, GIF, SVG ou ICO.' }, { status: 415 })
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'Imagem acima de 8 MB. Reduza o tamanho e tente de novo.' }, { status: 413 })

  const buf = Buffer.from(await file.arrayBuffer())
  const nome = `${createHash('sha1').update(buf).digest('hex').slice(0, 24)}.${ext}`
  const path = `assets/${nome}`
  try {
    const st = getStorage()
    if (!(await st.exists(BUCKET_IMAGENS, path))) {
      await st.upload({ bucket: BUCKET_IMAGENS, path, data: buf, contentType: tipo === 'image/jpg' ? 'image/jpeg' : tipo, upsert: true, publico: true, cacheControl: '31536000' })
    }
    // Catálogo central de arquivos (best-effort, idempotente por path).
    try {
      const svc = createAdminClient()
      const { data: existe } = await svc.from('simulado_arquivos').select('id').eq('tenant_id', access.tenantId).eq('bucket', BUCKET_IMAGENS).eq('path', path).limit(1)
      if (!existe?.length) {
        await svc.from('simulado_arquivos').insert({
          tenant_id: access.tenantId, nome: file.name || nome, tipo_mime: tipo, tamanho_bytes: buf.length,
          provider: st.name, bucket: BUCKET_IMAGENS, path, publico: true, criado_por: access.userId ?? null,
        })
      }
    } catch { /* catálogo é secundário */ }
    const url = st.getPublicUrl(BUCKET_IMAGENS, path)
    if (!url) throw new Error('sem URL pública')
    return NextResponse.json({ ok: true, url })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Não foi possível salvar a imagem agora. Tente de novo.' }, { status: 500 })
  }
}
