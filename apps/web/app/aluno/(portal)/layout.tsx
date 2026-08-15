import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantTheme } from '@/lib/tenant-theme'
import { normalizarManutencao, emManutencaoAgora } from '@/lib/sistema/manutencao'
import { Suspense } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SidebarEdgeToggle } from '@/components/ui/sidebar-collapse'
import { AlunoSidebar } from '@/components/aluno/aluno-sidebar'
import { AlunoMobileNav } from '@/components/aluno/aluno-mobile-nav'
import { cn } from '@/lib/utils'
import { resolverLoginConfig } from '@/lib/login-config'
import { NavProgress } from '@/components/admin/nav-progress'
import { TelaManutencao } from '@/components/aluno/tela-manutencao'
import { MonitorManutencao } from '@/components/aluno/monitor-manutencao'
import { getGamConfig } from '@/lib/gamificacao'
import { resumoGamificacao } from '@/lib/gamificacao/leitura'
import { lerPersonalizacaoEstudante } from '@/lib/aluno/personalizacao'
import type { ProgressoAluno } from '@/components/aluno/aluno-sidebar'

export default async function AlunoPortalLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  // Tudo que o layout precisa roda em PARALELO (esta função executa a CADA navegação do portal):
  // tema + contagens da sidebar + progresso de gamificação + personalização. Antes eram 4
  // round-trips em série; agora 1 cliente reutilizado e um único Promise.all.
  const svc = await createServiceClient()
  const [themeData, counts, gamData, persData] = await Promise.all([
    getTenantTheme(),
    // Contagens da sidebar ("Meus Simulados" = simulados distintos finalizados; "Favoritos").
    (async (): Promise<Record<string, number>> => {
      try {
        const [{ data: fin }, { count: favs }] = await Promise.all([
          svc.from('simulado_sessoes_prova').select('simulado_id').eq('estudante_id', sessao.estudanteId).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false),
          svc.from('simulado_favoritos').select('id', { count: 'exact', head: true }).eq('estudante_id', sessao.estudanteId),
        ])
        const c: Record<string, number> = {}
        const meus = new Set((fin ?? []).map((r: any) => r.simulado_id)).size
        if (meus > 0) c['/aluno/simulados'] = meus
        if ((favs ?? 0) > 0) c['/aluno/favoritos'] = favs ?? 0
        return c
      } catch { return {} }
    })(),
    // Progresso de gamificação + gate de Trilha/Ligas — só quando ativa.
    (async (): Promise<{ progresso: ProgressoAluno | null; gamAtivo: boolean }> => {
      try {
        const cfg = await getGamConfig(svc, sessao.tenantId)
        if (!cfg?.ativo) return { progresso: null, gamAtivo: false }
        const r = await resumoGamificacao(svc, sessao.tenantId, sessao.estudanteId, cfg)
        return { progresso: r ? { streak: r.streakAtual, xpTotal: r.xpTotal, nivel: r.progresso.nivel, liga: r.liga.nome, ligaCor: r.liga.cor } : null, gamAtivo: true }
      } catch { return { progresso: null, gamAtivo: false } }
    })(),
    // Personalização (avatar + cor) — tolerante se a migração ainda não rodou.
    (async (): Promise<{ avatar: string | null; avatarCor: string | null }> => {
      try { const p = await lerPersonalizacaoEstudante(svc, sessao.estudanteId); return { avatar: p.avatar, avatarCor: p.avatarCor } }
      catch { return { avatar: null, avatarCor: null } }
    })(),
  ])

  const { css, tema, tenantNome } = themeData
  const t = (tema ?? {}) as any
  // Layout de navegação MOBILE, escolhido no console (Aparência → Mobile): 'tabs' | 'menu'.
  const navMode: 'tabs' | 'menu' = t.mobile_nav === 'menu' ? 'menu' : 'tabs'
  const { progresso, gamAtivo } = gamData
  const avatarUsuario = persData.avatar
  const avatarCorUsuario = persData.avatarCor

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
          <AlunoSidebar logo={t.logo_url ?? null} nome={t.nome_site ?? tenantNome ?? 'Área do Aluno'} subtitulo={t.subtitulo_site ?? 'Área do aluno'} logoBg={t.logo_png_bg ?? '#ffffff'} logoEstilo={t.logo_estilo ?? 'arredondado'} logoFiltro={t.logo_filtro_sistema ?? t.logo_filtro ?? 'none'} usuarioNome={sessao.nome} usuarioEmail={sessao.email} avatar={avatarUsuario} avatarCor={avatarCorUsuario} counts={counts} loginConfig={resolverLoginConfig(t.login)} progresso={progresso} gamAtivo={gamAtivo} />
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Toggle de recolher a sidebar: só no desktop (no mobile vale o chrome abaixo). */}
            <SidebarEdgeToggle hideOnMobile />
            <Suspense fallback={null}><NavProgress /></Suspense>
            {/* Folga no mobile conforme o modo: 'menu' → app bar no topo (pt); 'tabs' → barra embaixo (pb). */}
            <main className={cn('flex-1 overflow-y-auto p-4 md:p-6', navMode === 'menu' ? 'pt-[4.5rem] md:pt-6' : 'pb-24 md:pb-6')}>
              {children}
            </main>
          </div>
        </div>
        {/* Chrome de navegação mobile (barra inferior OU app bar+drawer), definido no console. */}
        <AlunoMobileNav
          navMode={navMode}
          logo={t.logo_url ?? null}
          nome={t.nome_site ?? tenantNome ?? 'Área do Aluno'}
          subtitulo={t.subtitulo_site ?? 'Área do aluno'}
          logoBg={t.logo_png_bg ?? '#ffffff'}
          logoEstilo={t.logo_estilo ?? 'arredondado'}
          logoFiltro={t.logo_filtro_sistema ?? t.logo_filtro ?? 'none'}
          usuarioNome={sessao.nome}
          avatar={avatarUsuario}
          avatarCor={avatarCorUsuario}
          counts={counts}
        />
      </SidebarProvider>
    </>
  )
}
