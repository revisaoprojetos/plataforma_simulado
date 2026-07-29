import { NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

const comoLogo = (v: unknown) => (typeof v === 'string' && /^(https?:|data:image)/.test(v) ? v : null)

// GET /api/aluno/minhas-plataformas — plataformas ATIVAS onde o e-mail do aluno logado é estudante.
// A sessão do aluno é POR-TENANT (JWT/CHIPS, não compartilhada entre subdomínios), então "trocar"
// = navegar pro subdomínio da outra plataforma e RE-IDENTIFICAR (/aluno/entrar).
// Match de e-mail por `.ilike` para espelhar exatamente o que o identify (embed/identify) faz —
// assim listamos só plataformas onde o identify de fato reconheceria este aluno.
export async function GET() {
  const sessao = await getSessaoAluno()
  if (!sessao?.email) return NextResponse.json({ plataformas: [] })
  const email = sessao.email.trim().toLowerCase()

  const svc = createAdminClient()
  const ests = await fetchAll<{ tenant_id: string }>(() =>
    svc.from('simulado_estudantes').select('tenant_id').ilike('email', email).eq('deletado', false).order('tenant_id'))
  const tenantIds = [...new Set((ests ?? []).map((e) => e.tenant_id).filter(Boolean))]
  if (!tenantIds.length) return NextResponse.json({ plataformas: [] })

  const { data: tenants } = await svc
    .from('simulado_tenants')
    .select('id, nome, slug, dominio, tema')
    .in('id', tenantIds)
    .eq('ativo', true)
    .order('nome')

  const plataformas = (tenants ?? []).map((t: any) => ({
    id: t.id,
    nome: (t.tema as any)?.nome_site || t.nome,
    slug: t.slug,
    dominio: t.dominio ?? null,
    logo: comoLogo((t.tema as any)?.logo_dark_url) ?? comoLogo((t.tema as any)?.logo_url),
    cor: (t.tema as any)?.cor_primaria ?? (t.tema as any)?.cores?.primaria ?? null,
    atual: t.id === sessao.tenantId,
  }))

  return NextResponse.json({ plataformas })
}
