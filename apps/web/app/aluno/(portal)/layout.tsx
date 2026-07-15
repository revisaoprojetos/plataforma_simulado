import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getTenantTheme } from '@/lib/tenant-theme'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AlunoSidebar } from '@/components/aluno/aluno-sidebar'
import { AlunoTopbar } from '@/components/aluno/aluno-topbar'

export default async function AlunoPortalLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const { css, tema, tenantNome } = await getTenantTheme()
  const t = (tema ?? {}) as any

  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <AlunoSidebar logo={t.logo_url ?? null} nome={t.nome_site ?? tenantNome ?? 'Área do Aluno'} subtitulo={t.subtitulo_site ?? 'Área do aluno'} logoBg={t.logo_png_bg ?? '#ffffff'} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AlunoTopbar nome={sessao.nome} email={sessao.email} />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </>
  )
}
