import { NextResponse } from 'next/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { exigirAcessoOO } from '@/lib/seguranca/guarda-onlyoffice'
import { createAdminClient } from '@/lib/supabase/server'

// Sincroniza o "último simulado selecionado" entre o plugin do OnlyOffice (aba de variáveis) e o Laboratório
// da prévia: o plugin SALVA (POST) ao selecionar; o Lab LÊ (GET) ao abrir e já carrega o mesmo simulado.
// Guardado em simulado_tenants.tema.lab_ultimo_sim (jsonb, sem migração). Resolve tenant por host (igual às
// outras rotas do plugin). Same-origin (sem CORS): exige access_token do plugin ou sessão admin.
export const dynamic = 'force-dynamic'
const CORS = {}


export async function GET(req: Request) {
  { const n = await exigirAcessoOO(req, { escopo: 'ler' }); if (n) return n }
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
  { const n = await exigirAcessoOO(req, { escopo: 'ler' }); if (n) return n }
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
