import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { normalizarTermoTag } from '@/lib/leitura/biblioteca-tags'
import { SELOS, SELOS_APELIDO } from '@/lib/leitura/selos'
import { salvarItem, excluirItem, uploadImagemBib } from '@/app/admin/leitura/biblioteca/actions'

// Cria / edita / exclui uma ETIQUETA (tag com imagem) da Biblioteca do tenant a partir do plugin "Selos" do
// OnlyOffice. Chamada pela PÁGINA do editor (1ª parte, com a sessão do admin) — o plugin fala com a página por
// postMessage; o iframe do plugin não carrega cookies. As ações reusam as da Biblioteca (guard leitura:view).
// O código `<...>` é o slug da tag; o sanitizador casa por nome OU slug (sem acento/caixa).
export const dynamic = 'force-dynamic'

const slugDe = (codigo: string) => normalizarTermoTag(codigo.replace(/^</, '').replace(/>$/, '')).replace(/\s+/g, '-')

export async function POST(request: Request) {
  const a = await getCurrentAccess()
  if (!a.tenantId) return NextResponse.json({ ok: false, error: 'Sem sessão.' }, { status: 401 })
  let b: any
  try { b = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 }) }
  const op = String(b?.op || '')

  if (op === 'excluir') {
    if (!b?.id) return NextResponse.json({ ok: false, error: 'Etiqueta não informada.' })
    return NextResponse.json(await excluirItem(String(b.id)))
  }
  if (op !== 'criar' && op !== 'editar') return NextResponse.json({ ok: false, error: 'Operação inválida.' }, { status: 400 })

  const nome = String(b.nome || '').trim().slice(0, 80)
  const slug = slugDe(String(b.codigo || '').trim())
  if (!nome) return NextResponse.json({ ok: false, error: 'Informe o nome da etiqueta.' })
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug)) return NextResponse.json({ ok: false, error: 'Código inválido: use letras, números e hífen (ex.: entendimento).' })
  if (SELOS[slug] || SELOS_APELIDO[slug]) return NextResponse.json({ ok: false, error: `O código <${slug}> já é de um selo padrão.` })

  // colisão com outra tag do tenant (por slug ou nome normalizado)
  const svc = createAdminClient() as any
  const { data: tags } = await svc.from('simulado_biblioteca_itens').select('id, nome, slug, html').eq('tenant_id', a.tenantId).eq('tipo', 'tag').eq('deletado', false)
  const outras = (tags ?? []).filter((t: any) => t.id !== b.id)
  if (outras.some((t: any) => normalizarTermoTag(t.slug || '') === normalizarTermoTag(slug) || normalizarTermoTag(t.nome || '') === normalizarTermoTag(slug)))
    return NextResponse.json({ ok: false, error: `Já existe uma etiqueta com o código <${slug}>.` })

  let url: string | null = null
  if (typeof b.imagem === 'string' && b.imagem.startsWith('data:image')) {
    const up = await uploadImagemBib(b.imagem)
    if (!up.ok || !up.url) return NextResponse.json({ ok: false, error: up.error || 'Falha ao subir a imagem.' })
    url = up.url
  } else if (op === 'editar') {
    const atual = (tags ?? []).find((t: any) => t.id === b.id)
    url = /<img\b[^>]*\bsrc="([^"]+)"/i.exec(atual?.html || '')?.[1] ?? null // sem imagem nova: mantém a atual
  }
  if (!url) return NextResponse.json({ ok: false, error: 'Envie a imagem da etiqueta.' })

  const html = `<img src="${url}" alt="${nome.replace(/"/g, '')}" class="sl-img" />`
  return NextResponse.json(await salvarItem('tag', { id: op === 'editar' ? String(b.id) : undefined, nome, slug, html, descricao: 'Etiqueta criada pelo plugin Selos' }))
}
