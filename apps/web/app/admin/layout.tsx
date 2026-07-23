import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminHeader } from '@/components/admin/header'
import { SidebarProvider } from '@/components/ui/sidebar'
import { CanProvider } from '@/components/auth/can-provider'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getTenantTheme } from '@/lib/tenant-theme'
import { SplashSistema } from '@/components/admin/splash-sistema'
import { TourProvider } from '@/components/admin/tour-guiado'
import { NavProgress } from '@/components/admin/nav-progress'
import { Suspense } from 'react'

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

  // Gate de papel (defesa em profundidade): só a EQUIPE entra no /admin. Um usuário
  // autenticado sem papel de staff (ou papel "estudante") é mandado para a área do aluno —
  // impede que qualquer conta logada alcance server actions do admin. As actions também checam.
  if (access.tenantId && (!access.role || access.role === 'estudante')) {
    redirect('/aluno')
  }

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
          <AdminSidebar logo={ti.logo_url ?? null} nome={ti.nome_site ?? tenantNome ?? 'Plataforma'} subtitulo={ti.subtitulo_site ?? null} logoBg={ti.logo_png_bg ?? '#ffffff'} logoEstilo={ti.logo_estilo ?? 'arredondado'} logoFiltro={ti.logo_filtro ?? 'none'} />
          <TourProvider>
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
              <AdminHeader userName={userName} userEmail={userEmail} />
              <Suspense fallback={null}><NavProgress /></Suspense>
              <main className="flex-1 overflow-y-auto p-6">
                {children}
              </main>
            </div>
          </TourProvider>
        </div>
      </SidebarProvider>
    </CanProvider>
  )
}
