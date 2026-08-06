import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantTheme } from '@/lib/tenant-theme'
import { normalizarManutencao, emManutencaoAgora } from '@/lib/sistema/manutencao'
import { Suspense } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SidebarEdgeToggle } from '@/components/ui/sidebar-collapse'
import { AlunoSidebar } from '@/components/aluno/aluno-sidebar'
import { resolverLoginConfig } from '@/lib/login-config'
import { NavProgress } from '@/components/admin/nav-progress'
import { TelaManutencao } from '@/components/aluno/tela-manutencao'
import { MonitorManutencao } from '@/components/aluno/monitor-manutencao'

export default async function AlunoPortalLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const { css, tema, tenantNome } = await getTenantTheme()
  const t = (tema ?? {}) as any

  // Contagens leves para os números da sidebar (tolerante a falhas). "Meus Simulados" =
  // simulados distintos já finalizados; "Favoritos" = questões favoritadas.
  const counts: Record<string, number> = {}
  try {
    const svc = await createServiceClient()
    const [{ data: fin }, { count: favs }] = await Promise.all([
      svc.from('simulado_sessoes_prova').select('simulado_id').eq('estudante_id', sessao.estudanteId).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false),
      svc.from('simulado_favoritos').select('id', { count: 'exact', head: true }).eq('estudante_id', sessao.estudanteId),
    ])
    const meus = new Set((fin ?? []).map((r: any) => r.simulado_id)).size
    if (meus > 0) counts['/aluno/simulados'] = meus
    if ((favs ?? 0) > 0) counts['/aluno/favoritos'] = favs ?? 0
  } catch { /* contagens são opcionais */ }

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
          <AlunoSidebar logo={t.logo_url ?? null} nome={t.nome_site ?? tenantNome ?? 'Área do Aluno'} subtitulo={t.subtitulo_site ?? 'Área do aluno'} logoBg={t.logo_png_bg ?? '#ffffff'} logoEstilo={t.logo_estilo ?? 'arredondado'} logoFiltro={t.logo_filtro_sistema ?? t.logo_filtro ?? 'none'} usuarioNome={sessao.nome} usuarioEmail={sessao.email} counts={counts} loginConfig={resolverLoginConfig(t.login)} />
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <SidebarEdgeToggle />
            <Suspense fallback={null}><NavProgress /></Suspense>
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  )
}
