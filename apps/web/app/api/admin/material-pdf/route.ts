import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Upload do "Gabarito Comentado" (PDF importado) do caderno via FormData (multipart) — NÃO
 * por server action com base64. Motivo: um PDF de ~8 MB vira ~11 MB em base64, e mandar isso
 * como argumento de server action estoura/instabiliza o transporte ("Falha ao ler o arquivo").
 * Aqui o arquivo é enviado direto (streaming), validado e salvo em config.material.
 */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('questoes:update'))) {
    return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  }

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ ok: false, error: 'Envio inválido.' }, { status: 400 }) }
  const file = form.get('file')
  const cadernoId = String(form.get('cadernoId') ?? '')
  const bancoId = String(form.get('bancoId') ?? '')
  if (!(file instanceof File) || !cadernoId) return NextResponse.json({ ok: false, error: 'Dados incompletos.' }, { status: 400 })
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'PDF muito grande (máx. ~8 MB).' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  if (!buf.length) return NextResponse.json({ ok: false, error: 'Arquivo vazio.' }, { status: 400 })
  // Validação server-side por magic bytes: PDF começa com "%PDF".
  if (buf.subarray(0, 4).toString('latin1') !== '%PDF') return NextResponse.json({ ok: false, error: 'O arquivo não é um PDF válido.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: cad } = await svc.from('simulado_cadernos_designer').select('config').eq('id', cadernoId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!cad) return NextResponse.json({ ok: false, error: 'Caderno não encontrado.' }, { status: 404 })

  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 10)
  const path = `materiais/${access.tenantId}/${cadernoId}-${hash}.pdf`
  try { await svc.storage.createBucket('pdfs', { public: true }) } catch { /* já existe */ }
  let { error: upErr } = await svc.storage.from('pdfs').upload(path, buf, { contentType: 'application/pdf', upsert: true })
  if (upErr && /bucket.*not.*found/i.test(upErr.message)) {
    await svc.storage.createBucket('pdfs', { public: true }).catch(() => {})
    ;({ error: upErr } = await svc.storage.from('pdfs').upload(path, buf, { contentType: 'application/pdf', upsert: true }))
  }
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
  const url = svc.storage.from('pdfs').getPublicUrl(path).data.publicUrl as string

  const nome = ((file.name || 'Material completo').replace(/\.pdf$/i, '').trim()) || 'Material completo'
  const config = (cad.config ?? {}) as Record<string, unknown>
  const material = { fonte: 'pdf', pdfUrl: url, pdfNome: nome }
  const { error } = await svc.from('simulado_cadernos_designer').update({ config: { ...config, material } }).eq('id', cadernoId).eq('tenant_id', access.tenantId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cadernos_designer', entidadeId: cadernoId, depois: { material_pdf: nome } })
  if (bancoId) revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return NextResponse.json({ ok: true, url, nome })
}
