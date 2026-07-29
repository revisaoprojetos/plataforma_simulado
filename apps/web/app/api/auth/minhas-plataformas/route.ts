import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/permissions'

const comoLogo = (v: unknown) => (typeof v === 'string' && /^(https?:|data:image)/.test(v) ? v : null)

// GET /api/auth/minhas-plataformas — plataformas que o ADMIN logado pode acessar
// (para o seletor "Trocar de plataforma"). Super-admin global vê todas as ativas.
// Com o cookie compartilhado (Fase 0), trocar = navegar pro subdomínio já autenticado.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ plataformas: [] })

  const svc = createAdminClient()

  // Quais tenants? Super-admin = todos os ativos; senão, os do próprio tenant_acessos.
  let tenantIds: string[] | null = null
  if (!(await isSuperAdmin())) {
    const { data: aces } = await svc
      .from('simulado_tenant_acessos')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('ativo', true)
    tenantIds = [...new Set((aces ?? []).map((a: any) => a.tenant_id).filter(Boolean))]
    if (!tenantIds.length) return NextResponse.json({ plataformas: [] })
  }

  let q = svc.from('simulado_tenants').select('id, nome, slug, dominio, tema').eq('ativo', true).order('nome')
  if (tenantIds) q = q.in('id', tenantIds)
  const { data: tenants } = await q

  const plataformas = (tenants ?? []).map((t: any) => ({
    id: t.id,
    nome: (t.tema as any)?.nome_site || t.nome,
    slug: t.slug,
    dominio: t.dominio ?? null,
    logo: comoLogo((t.tema as any)?.logo_dark_url) ?? comoLogo((t.tema as any)?.logo_url),
    cor: (t.tema as any)?.cor_primaria ?? (t.tema as any)?.cores?.primaria ?? null,
  }))

  return NextResponse.json({ plataformas })
}
