import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/permissions'

const comoLogo = (v: unknown) => (typeof v === 'string' && /^(https?:|data:image)/.test(v) ? v : null)

// GET /api/auth/minhas-plataformas — plataformas que o ADMIN logado pode acessar
// (para o seletor "Trocar de plataforma"). Super-admin global vê todas as ativas.
// Com o cookie compartilhado (Fase 0), trocar = navegar pro subdomínio já autenticado.
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ plataformas: [] })

  const svc = createAdminClient()

  // Quais tenants? Super-admin = todos os ativos; senão, os do próprio tenant_acessos.
  const superAdmin = await isSuperAdmin()
  let tenantIds: string[] | null = null
  if (!superAdmin) {
    const { data: aces } = await svc
      .from('simulado_tenant_acessos')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('ativo', true)
    tenantIds = [...new Set((aces ?? []).map((a: any) => a.tenant_id).filter(Boolean))]
    if (!tenantIds.length) return NextResponse.json({ plataformas: [] })
  }

  let q = svc.from('simulado_tenants').select('id, nome, slug, dominio, tema, ativo').order('nome')
  if (tenantIds) q = q.in('id', tenantIds)
  const { data: todas } = await q

  // Visibilidade (filtro em JS — robusto e barato; o nº de plataformas é pequeno):
  //   - "Todos" (ativo): qualquer admin.
  //   - "Só admin" (tema.somente_admin): admins da plataforma (o recorte por tenant já está
  //      no `tenantIds` para não-super) e super-admins.
  //   - "Só super-admin" (tema.somente_super): APENAS super-admin global.
  //   - "Oculta": ninguém.
  const tenants = (todas ?? []).filter((t: any) => {
    if (t.ativo === true) return true
    const tema = (t.tema as any) ?? {}
    if (tema.somente_super === true) return superAdmin
    if (tema.somente_admin === true) return true
    return false
  })

  const plataformas = (tenants ?? []).map((t: any) => ({
    id: t.id,
    nome: (t.tema as any)?.nome_site || t.nome,
    slug: t.slug,
    dominio: t.dominio ?? null,
    logo: comoLogo((t.tema as any)?.logo_selecao_url) ?? comoLogo((t.tema as any)?.logo_dark_url) ?? comoLogo((t.tema as any)?.logo_url),
    estilo: (t.tema as any)?.logo_selecao_estilo ?? 'redonda',
    semFundo: !!(t.tema as any)?.logo_selecao_sem_fundo,
    cor: (t.tema as any)?.cor_primaria ?? (t.tema as any)?.cores?.primaria ?? null,
    teste: !t.ativo, // só-admin (não pública) — a UI pode marcar como "teste"
  }))

  return NextResponse.json({ plataformas, superAdmin })
}
