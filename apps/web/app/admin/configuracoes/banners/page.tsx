import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { BannersManager, type Banner } from '@/components/admin/banners-manager'
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Megaphone className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banners &amp; Pop-ups</h1>
          <p className="text-muted-foreground">Avisos que aparecem no portal do aluno. Banner = faixa no topo; Pop-up = janela exibida uma vez.</p>
        </div>
      </div>
      <BannersManager banners={banners} />
    </div>
  )
}
