import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/permissions'
import { SuperChrome } from '@/components/super/super-chrome'

export const dynamic = 'force-dynamic'

// Neutraliza os tokens de marca DENTRO do console (.super-scope), para que os componentes
// reaproveitados (Card, botões, tabelas) apareçam neutros — independentemente do tenant
// resolvido pelo host. Assim o console fica visualmente ISOLADO de qualquer plataforma.
const NEUTRO = `
.super-scope{
  --background:oklch(1 0 0);--foreground:oklch(0.205 0 0);
  --card:oklch(1 0 0);--card-foreground:oklch(0.205 0 0);
  --popover:oklch(1 0 0);--popover-foreground:oklch(0.205 0 0);
  --primary:oklch(0.24 0.02 265);--primary-foreground:oklch(0.98 0 0);
  --secondary:oklch(0.968 0.003 265);--secondary-foreground:oklch(0.28 0.02 265);
  --muted:oklch(0.968 0.003 265);--muted-foreground:oklch(0.55 0.02 265);
  --accent:oklch(0.968 0.006 265);--accent-foreground:oklch(0.28 0.02 265);
  --border:oklch(0.922 0.004 265);--input:oklch(0.922 0.004 265);--ring:oklch(0.24 0.02 265);
  --brand-primary:oklch(0.24 0.02 265);--brand-secondary:oklch(0.55 0.02 265);--brand-accent:oklch(0.24 0.02 265);
  --content-title:oklch(0.205 0 0);
}
.dark .super-scope{
  --background:oklch(0.185 0.005 265);--foreground:oklch(0.98 0 0);
  --card:oklch(0.22 0.006 265);--card-foreground:oklch(0.98 0 0);
  --popover:oklch(0.22 0.006 265);--popover-foreground:oklch(0.98 0 0);
  --primary:oklch(0.9 0.01 265);--primary-foreground:oklch(0.22 0.01 265);
  --secondary:oklch(0.28 0.01 265);--secondary-foreground:oklch(0.98 0 0);
  --muted:oklch(0.28 0.01 265);--muted-foreground:oklch(0.7 0.02 265);
  --accent:oklch(0.32 0.01 265);--accent-foreground:oklch(0.96 0 0);
  --border:oklch(1 0 0 / 12%);--input:oklch(1 0 0 / 15%);--ring:oklch(0.7 0.02 265);
  --brand-primary:oklch(0.9 0.01 265);--brand-secondary:oklch(0.7 0.02 265);--brand-accent:oklch(0.9 0.01 265);
  --content-title:oklch(0.98 0 0);
}
`.trim()

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Área EXCLUSIVA do super-admin GLOBAL — fora de qualquer tenant. Ninguém mais entra.
  if (!(await isSuperAdmin())) redirect('/login')

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: NEUTRO }} />
      <div className="super-scope">
        <SuperChrome userEmail={user.email || ''}>{children}</SuperChrome>
      </div>
    </>
  )
}
