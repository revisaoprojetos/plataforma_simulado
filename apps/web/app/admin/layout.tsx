import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SidebarEdgeToggle } from '@/components/ui/sidebar-collapse'
import { CanProvider } from '@/components/auth/can-provider'
import { getCurrentAccess, isSuperAdmin, accessCan } from '@/lib/auth/permissions'
import { getTenantTheme } from '@/lib/tenant-theme'
import { resolverLoginConfig } from '@/lib/login-config'
import { SplashSistema } from '@/components/admin/splash-sistema'
import { TourProvider } from '@/components/admin/tour-guiado'
import { NavProgress } from '@/components/admin/nav-progress'
import { AvisoSemAcesso } from '@/components/admin/aviso-sem-acesso'
import { Suspense } from 'react'

const CURRENT_POLICY_VERSION = '1.0'

// Gate de ROTA por permissão (defesa em profundidade, além de esconder do menu): cada área do
// /admin exige a permissão de "ver". Cargos de acesso total (isAdmin) ignoram. O prefixo mais
// específico primeiro. Áreas sem entrada (ex.: /admin dashboard, /admin/ajuda) são livres.
const AREA_PERM: { prefix: string; perm: string }[] = [
  { prefix: '/admin/simulados', perm: 'simulados:view' },
  { prefix: '/admin/questoes', perm: 'questoes:view' },
  { prefix: '/admin/banco-questoes', perm: 'questoes:view' },
  { prefix: '/admin/cadernos', perm: 'questoes:view' },
  { prefix: '/admin/correcao', perm: 'questoes:view' },
  { prefix: '/admin/comentarios', perm: 'questoes:view' },
  { prefix: '/admin/feedbacks', perm: 'questoes:view' },
  { prefix: '/admin/lixeira', perm: 'questoes:view' },
  { prefix: '/admin/estudantes', perm: 'estudantes:view' },
  { prefix: '/admin/lgpd', perm: 'estudantes:view' },
  { prefix: '/admin/grupos', perm: 'grupos:view' },
  { prefix: '/admin/matriculas', perm: 'matriculas:view' },
  { prefix: '/admin/integracoes', perm: 'integracoes:view' },
  { prefix: '/admin/conexoes', perm: 'integracoes:view' },
  { prefix: '/admin/relatorios', perm: 'relatorios:view' },
  { prefix: '/admin/auditoria', perm: 'auditoria:view' },
  { prefix: '/admin/administradores', perm: 'rbac:view' },
  { prefix: '/admin/api-keys', perm: 'api_keys:manage' },
  { prefix: '/admin/configuracoes', perm: 'configuracoes:view' },
  { prefix: '/admin/sistema', perm: 'configuracoes:view' },
]

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
  // Super-admin GLOBAL (acima das plataformas) — ortogonal ao papel por-tenant.
  const superAdmin = await isSuperAdmin()

  // Gate de papel (defesa em profundidade): só a EQUIPE entra no /admin. Um usuário
  // autenticado sem papel de staff (ou papel "estudante") é mandado para a área do aluno —
  // impede que qualquer conta logada alcance server actions do admin. As actions também checam.
  // Exceção: super-admin global entra mesmo sem papel no tenant atual.
  if (access.tenantId && (!access.role || access.role === 'estudante') && !superAdmin) {
    redirect('/aluno')
  }

  // Config da tela de imersão (mostrada uma vez ao acessar o sistema).
  const { tema, tenantNome } = await getTenantTheme()
  const ti = (tema ?? {}) as any

  // Visibilidade "Só super-admin": a plataforma está reservada a super-admins globais (p/ teste).
  // Mesmo quem tem papel de admin no tenant NÃO entra — só o super-admin global. Bloqueio real
  // (defesa em profundidade), além de a plataforma não aparecer no seletor para não-super.
  if (ti.somente_super === true && !superAdmin) {
    redirect('/login')
  }

  // Gate de ROTA por permissão: cargos SEM acesso total que abrem (ou digitam a URL de) uma área
  // bloqueada na matriz são mandados de volta ao painel. Casa com o menu, que já esconde a área.
  if (!access.isAdmin) {
    const pathname = (await headers()).get('x-pathname') ?? ''
    const area = AREA_PERM.find((a) => pathname === a.prefix || pathname.startsWith(a.prefix + '/'))
    if (area && !accessCan(access, area.perm)) {
      redirect('/admin?erro=sem-acesso')
    }
  }

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
          <AdminSidebar logo={ti.logo_url ?? null} nome={ti.nome_site ?? tenantNome ?? 'Plataforma'} subtitulo={ti.subtitulo_site ?? null} logoBg={ti.logo_png_bg ?? '#ffffff'} logoEstilo={ti.logo_estilo ?? 'arredondado'} logoFiltro={ti.logo_filtro_sistema ?? ti.logo_filtro ?? 'none'} isSuperAdmin={superAdmin} userName={userName} userEmail={userEmail} loginConfig={resolverLoginConfig(ti.login)} />
          <TourProvider>
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
              <SidebarEdgeToggle mode="offcanvas" />
              <Suspense fallback={null}><NavProgress /></Suspense>
              <Suspense fallback={null}><AvisoSemAcesso /></Suspense>
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
