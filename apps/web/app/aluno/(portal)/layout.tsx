import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getTenantTheme } from '@/lib/tenant-theme'
import { normalizarManutencao, emManutencaoAgora } from '@/lib/sistema/manutencao'
import { Suspense } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AlunoSidebar } from '@/components/aluno/aluno-sidebar'
import { AlunoTopbar } from '@/components/aluno/aluno-topbar'
import { NavProgress } from '@/components/admin/nav-progress'
import { TelaManutencao } from '@/components/aluno/tela-manutencao'
import { MonitorManutencao } from '@/components/aluno/monitor-manutencao'

export default async function AlunoPortalLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const { css, tema, tenantNome } = await getTenantTheme()
  const t = (tema ?? {}) as any

  // Manutenção da plataforma: bloqueia o PORTAL (não o runner do simulado, que é outro layout).
  const manut = normalizarManutencao(t.manutencao_sistema)
  if (emManutencaoAgora(manut)) {
    return (
      <>
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
        <TelaManutencao titulo={manut.titulo} mensagem={manut.mensagem} fim={manut.fim} />
      </>
    )
  }

  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <MonitorManutencao inicial={{ inicio: manut.inicio, avisos: manut.avisos }} />
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <AlunoSidebar logo={t.logo_url ?? null} nome={t.nome_site ?? tenantNome ?? 'Área do Aluno'} subtitulo={t.subtitulo_site ?? 'Área do aluno'} logoBg={t.logo_png_bg ?? '#ffffff'} />
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <AlunoTopbar nome={sessao.nome} email={sessao.email} />
            <Suspense fallback={null}><NavProgress /></Suspense>
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </>
  )
}
