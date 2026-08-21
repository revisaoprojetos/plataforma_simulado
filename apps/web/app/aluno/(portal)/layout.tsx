import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantTheme } from '@/lib/tenant-theme'
import { normalizarManutencao, emManutencaoAgora } from '@/lib/sistema/manutencao'
import { Suspense } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SidebarEdgeToggle } from '@/components/ui/sidebar-collapse'
import { AlunoSidebar } from '@/components/aluno/aluno-sidebar'
import { AlunoMobileNav } from '@/components/aluno/aluno-mobile-nav'
import { GuiaTourRunner } from '@/components/aluno/guia-tour-runner'
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
  if (!sessao) {
    // Sessão ausente/expirada: manda pro login preservando a PÁGINA de origem COM query (ex.: link
    // direto de uma pasta de simulados) — o proxy expõe o caminho+query em `x-full-path`.
    const h = await headers()
    const path = h.get('x-full-path') || h.get('x-pathname') || ''
    const rt = /^\/(aluno|simulado)(\/|$|\?)/.test(path) ? path : ''
    redirect(rt ? `/aluno/entrar?redirectTo=${encodeURIComponent(rt)}` : '/aluno/entrar')
  }

  // Tudo que o layout precisa roda em PARALELO (esta função executa a CADA navegação do portal):
  // tema + contagens da sidebar + progresso de gamificação + personalização. Antes eram 4
  // round-trips em série; agora 1 cliente reutilizado e um único Promise.all.
  const svc = await createServiceClient()
  const [themeData, contadores, gamData, persData] = await Promise.all([
    getTenantTheme(),
    // Contagens da sidebar: "Meus Simulados" = oficiais distintos finalizados (badge da esquerda) +
    // personalizados criados (badge da direita, "X | Y"); "Favoritos".
    (async (): Promise<{ counts: Record<string, number>; personalizados: number }> => {
      try {
        const [{ data: fin }, { count: favs }, { data: pers }] = await Promise.all([
          svc.from('simulado_sessoes_prova').select('simulado_id').eq('estudante_id', sessao.estudanteId).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false),
          svc.from('simulado_favoritos').select('id', { count: 'exact', head: true }).eq('estudante_id', sessao.estudanteId),
          svc.from('simulado_simulados').select('id').eq('owner_estudante_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId).eq('deletado', false),
        ])
        const personalIds = new Set((pers ?? []).map((r: any) => r.id))
        const finIds = new Set((fin ?? []).map((r: any) => r.simulado_id))
        // Plataforma = simulados OFICIAIS distintos finalizados (exclui os pessoais do aluno).
        const plataforma = [...finIds].filter((id) => !personalIds.has(id)).length
        const c: Record<string, number> = {}
        if (plataforma > 0) c['/aluno/simulados'] = plataforma
        if ((favs ?? 0) > 0) c['/aluno/favoritos'] = favs ?? 0
        return { counts: c, personalizados: personalIds.size }
      } catch { return { counts: {}, personalizados: 0 } }
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
  const { counts, personalizados: simuladosPersonalizados } = contadores
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
      {/* Tour guiado da Capi (acionado pelo "Iniciar passo a passo" na Ajuda) — global p/ sobreviver à navegação. */}
      <GuiaTourRunner gamAtivo={gamAtivo} />
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <AlunoSidebar logo={t.logo_url ?? null} nome={t.nome_site ?? tenantNome ?? 'Área do Aluno'} subtitulo={t.subtitulo_site ?? 'Área do aluno'} logoBg={t.logo_png_bg ?? '#ffffff'} logoEstilo={t.logo_estilo ?? 'arredondado'} logoFiltro={t.logo_filtro_sistema ?? t.logo_filtro ?? 'none'} usuarioNome={sessao.nome} usuarioEmail={sessao.email} avatar={avatarUsuario} avatarCor={avatarCorUsuario} counts={counts} simuladosPersonalizados={simuladosPersonalizados} loginConfig={resolverLoginConfig(t.login)} progresso={progresso} gamAtivo={gamAtivo} />
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
