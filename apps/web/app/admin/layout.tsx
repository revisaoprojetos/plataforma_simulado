import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminHeader } from '@/components/admin/header'
import { SidebarProvider } from '@/components/ui/sidebar'
import { CanProvider } from '@/components/auth/can-provider'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getTenantTheme } from '@/lib/tenant-theme'
import { SplashSistema } from '@/components/admin/splash-sistema'

const CURRENT_POLICY_VERSION = '1.0'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check LGPD consent — gracefully skip if table doesn't exist yet
  try {
    const serviceClient = await createServiceClient()
    const { data: consentimento, error } = await serviceClient
      .from('simulado_lgpd_consentimentos')
      .select('id')
      .eq('user_id', user.id)
      .eq('versao_politica', CURRENT_POLICY_VERSION)
      .single()

    // Only redirect if table exists AND user hasn't consented (error code PGRST116 = no rows found)
    if (!error && !consentimento) {
      redirect('/lgpd/consentimento?redirectTo=/admin')
    }
    if (error && error.code !== 'PGRST116' && !error.message.includes('does not exist')) {
      redirect('/lgpd/consentimento?redirectTo=/admin')
    }
  } catch {
    // Table doesn't exist yet — allow access
  }

  const userName = user.user_metadata?.full_name || user.email || 'Usuário'
  const userEmail = user.email || ''

  // Resolve permissões do usuário no tenant atual (para esconder UI por papel).
  const access = await getCurrentAccess()

  // Config da tela de imersão (mostrada uma vez ao acessar o sistema).
  const { tema, tenantNome } = await getTenantTheme()
  const ti = (tema ?? {}) as any

  return (
    <CanProvider isAdmin={access.isAdmin} permissions={access.permissions}>
      <SplashSistema
        estilo={ti.splash_estilo ?? 'spinner'}
        logo={ti.splash_logo ?? ti.logo_url ?? null}
        nome={ti.nome_site ?? tenantNome ?? 'Plataforma'}
        mensagem={ti.splash_mensagem ?? 'Carregando o sistema…'}
      />
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <AdminSidebar logo={ti.logo_url ?? null} nome={ti.nome_site ?? tenantNome ?? 'Plataforma'} logoBg={ti.logo_png_bg ?? '#ffffff'} logoEstilo={ti.logo_estilo ?? 'arredondado'} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AdminHeader userName={userName} userEmail={userEmail} />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </CanProvider>
  )
}
