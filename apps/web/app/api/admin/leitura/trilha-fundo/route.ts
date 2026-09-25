import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'

/**
 * Upload da IMAGEM DE FUNDO da trilha personalizada (construtor "Editar trilha" do módulo).
 * Limite maior que o de símbolos (fundos são imagens grandes, ex.: montanha 1500×3000). Valida
 * mime/tamanho server-side, sobe no bucket público `imagens` e devolve a URL pública.
 */
export async function POST(req: NextRequest) {
  if (!(await checkPermission('leitura:update')) && !(await checkPermission('gamificacao:manage'))) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Tenant não resolvido.' }, { status: 400 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo ausente.' }, { status: 400 })
  if (!/^image\/(png|jpe?g|webp|avif|gif)$/.test(file.type)) return NextResponse.json({ error: 'Formato inválido (use PNG, JPG, WEBP, AVIF ou GIF).' }, { status: 400 })
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'Imagem muito grande (máx. 8MB).' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const svc = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${tenantId}/trilha-fundo/${Date.now()}.${ext}`
  const bucket = 'imagens'
  let up = await svc.storage.from(bucket).upload(path, buf, { contentType: file.type, upsert: true, cacheControl: '31536000' })
  if (up.error && /bucket.*not.*found/i.test(up.error.message)) {
    await svc.storage.createBucket(bucket, { public: true }).catch(() => {})
    up = await svc.storage.from(bucket).upload(path, buf, { contentType: file.type, upsert: true, cacheControl: '31536000' })
  }
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })
  const { data } = svc.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
