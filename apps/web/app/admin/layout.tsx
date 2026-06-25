import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminHeader } from '@/components/admin/header'
import { SidebarProvider } from '@/components/ui/sidebar'

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
      .from('lgpd_consentimentos')
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AdminHeader userName={userName} userEmail={userEmail} />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
