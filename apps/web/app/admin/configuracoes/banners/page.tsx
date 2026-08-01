import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { BannersManager, type Banner } from '@/components/admin/banners-manager'
import { dedupePorLabel } from '@/lib/banner-destinos'
import { Megaphone } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function BannersPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('configuracoes:manage')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Banners &amp; Pop-ups</h1>
        <SemPermissao>Você não tem permissão para gerenciar banners.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'
  let banners: Banner[] = []
  try {
    const { data } = await svc.from('simulado_banners').select('id, tipo, titulo, mensagem, imagem_url, link, cor, ativo, ordem').eq('tenant_id', tid).order('ordem', { ascending: true }).order('criado_em', { ascending: false })
    banners = (data ?? []) as Banner[]
  } catch { /* tabela ainda não migrada */ }

  // Flag do painel de desempenho nos banners de simulado (default OFF).
  const { data: tRow } = await svc.from('simulado_tenants').select('tema').eq('id', tid).maybeSingle()
  const desempenhoAtivo = (tRow?.tema as any)?.banners_desempenho === true
  const destaques = ((tRow?.tema as any)?.banner_destaques ?? {}) as Record<string, { ativo?: boolean; texto?: string }>

  // Destinos rápidos para linkar/escolher no banner: pastas + simulados publicados. Tolerante ao schema.
  const [pastasDest, simsDest] = await Promise.all([
    svc.from('simulado_pastas').select('id, nome, folder_area').eq('tenant_id', tid).eq('is_folder', true).eq('deletado', false).order('nome', { ascending: true }).then((r: any) => (r.data ?? []).filter((f: any) => f.folder_area !== 'caderno'), () => []),
    svc.from('simulado_simulados').select('id, titulo, embed_token').eq('tenant_id', tid).eq('deletado', false).eq('status', 'publicado').order('created_at', { ascending: false }).limit(60).then((r: any) => r.data ?? [], () => []),
  ])
  const destinosBanner = dedupePorLabel([
    ...(pastasDest as any[]).map((f) => ({ label: f.nome as string, href: `/aluno/simulado?pasta=${f.id}`, grupo: 'Pastas' })),
    ...(simsDest as any[]).filter((s) => s.embed_token).map((s) => ({ label: s.titulo as string, href: `/simulado/${s.embed_token}`, grupo: 'Simulados' })),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Megaphone className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banners &amp; Pop-ups</h1>
          <p className="text-muted-foreground">Avisos que aparecem no portal do aluno. Banner = faixa no topo; Pop-up = janela exibida uma vez.</p>
        </div>
      </div>
      <BannersManager banners={banners} destinos={destinosBanner} desempenhoAtivo={desempenhoAtivo} destaques={destaques} />
    </div>
  )
}
