import { NextResponse } from 'next/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'

// Sincroniza o "último simulado selecionado" entre o plugin do OnlyOffice (aba de variáveis) e o Laboratório
// da prévia: o plugin SALVA (POST) ao selecionar; o Lab LÊ (GET) ao abrir e já carrega o mesmo simulado.
// Guardado em simulado_tenants.tema.lab_ultimo_sim (jsonb, sem migração). Resolve tenant por host (igual às
// outras rotas do plugin). CORS liberado porque o plugin roda dentro do iframe do OnlyOffice.
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' }

export function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

export async function GET() {
  try {
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return NextResponse.json({ sim: null }, { headers: CORS })
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
    const u = (data as any)?.tema?.lab_ultimo_sim
    return NextResponse.json({ sim: u?.id ? { id: String(u.id), titulo: String(u.titulo || '') } : null }, { headers: CORS })
  } catch (e) {
    return NextResponse.json({ sim: null, erro: String((e as any)?.message || e) }, { headers: CORS })
  }
}

export async function POST(req: Request) {
  try {
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return NextResponse.json({ ok: false }, { headers: CORS })
    const body = await req.json().catch(() => ({}))
    const id = body?.id ? String(body.id) : ''
    const titulo = body?.titulo ? String(body.titulo).slice(0, 300) : ''
    const svc = createAdminClient()
    // valida que o simulado é do tenant (evita gravar lixo por CORS aberto)
    if (id) { const { data: s } = await svc.from('simulado_simulados').select('id').eq('id', id).eq('tenant_id', tenantId).maybeSingle(); if (!s) return NextResponse.json({ ok: false }, { headers: CORS }) }
    const { data } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
    const tema = { ...(((data as any)?.tema as Record<string, unknown>) ?? {}), lab_ultimo_sim: id ? { id, titulo } : null }
    await svc.from('simulado_tenants').update({ tema }).eq('id', tenantId)
    return NextResponse.json({ ok: true }, { headers: CORS })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String((e as any)?.message || e) }, { headers: CORS })
  }
}
