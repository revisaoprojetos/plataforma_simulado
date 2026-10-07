import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { getTenantTheme } from '@/lib/tenant-theme'
import { normalizarManutencao, emManutencaoAgora } from '@/lib/sistema/manutencao'
import { normalizarMapaAreas, normalizarLiberados, areaAlunoBloqueadaDoPath, hrefsBloqueadosAluno, AREAS_MANUTENCAO_ALUNO } from '@/lib/sistema/manutencao-areas'
import { resolverSidebarRotulos } from '@/lib/sidebar-rotulos'
import { GuiaTourRunner } from '@/components/aluno/guia-tour-runner'
import { resolverLoginConfig } from '@/lib/login-config'
import { TelaManutencao } from '@/components/aluno/tela-manutencao'
import { MonitorManutencao } from '@/components/aluno/monitor-manutencao'
import { getGamConfig, gamAtivaParaAluno } from '@/lib/gamificacao'
import { resumoGamificacao } from '@/lib/gamificacao/leitura'
import { LEITURA_ATIVA, JURISPRUDENCIA_ATIVA, OCULTAR_CRONOGRAMA } from '@/lib/flags'
import { totalPendenciasLeitura } from '@/lib/leitura/trilha'
import { lerPersonalizacaoEstudante } from '@/lib/aluno/personalizacao'
import { FontScaleInit } from '@/components/font-scale-init'
import type { ProgressoAluno } from '@/components/aluno/aluno-sidebar'
import { getCurrentTenant } from '@/lib/tenant'
import { lerAparenciaAuth } from '@/lib/brand/aparencia-auth'
import { brandTokensCss, TEMAS_POR_MARCA } from '@/lib/brand/brand-tokens'
import { AlunoShell } from '@/components/aluno/shell/aluno-shell'
import { ShellRevisaoNova } from '@/components/aluno/shell/shell-revisao-nova'
import { AreaEmManutencao } from '@/components/admin/area-em-manutencao'
import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import type { AlunoBrand, AlunoNavItem, AlunoShellUsuario } from '@/components/aluno/shell/types'

/** Iniciais a partir do nome (1ª letra do 1º e do último termo). Fallback do avatar. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'A'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/**
 * Escopa um bloco de CSS de tokens (`:root {…}` / `.dark {…}` / `.theme-azul {…}`)
 * sob `.app[data-brand]`, para os tokens do redesign (`--bg`, `--surface`, `--muted`…)
 * NÃO vazarem para fora do shell nem colidirem com o `--muted` do tenant-theme.
 */
function escoparEmApp(css: string): string {
  return css
    .replace(/^:root\s*\{/m, '.app:root, .app {')
    .replace(/^\.dark\s*\{/m, '.app.dark, .dark .app {')
    .replace(/^\.theme-azul\s*\{/m, '.app.theme-azul, .theme-azul .app {')
}

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
  const svc = createAdminClient()
  const [themeData, contadores, gamData, persData, pendLeitura] = await Promise.all([
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
    // Devolve também `tituloNivel` e `liga` (derivados do MESMO resumo, sem query extra) p/ o usuário do shell.
    (async (): Promise<{ progresso: ProgressoAluno | null; gamAtivo: boolean; tituloNivel: string | null; liga: string | null }> => {
      try {
        const cfg = await getGamConfig(svc, sessao.tenantId)
        if (!(await gamAtivaParaAluno(svc, sessao.tenantId, sessao.estudanteId, cfg))) return { progresso: null, gamAtivo: false, tituloNivel: null, liga: null }
        const r = await resumoGamificacao(svc, sessao.tenantId, sessao.estudanteId, cfg!)
        return {
          progresso: r ? { streak: r.streakAtual, xpTotal: r.xpTotal, nivel: r.progresso.nivel, liga: r.liga.nome, ligaCor: r.liga.cor } : null,
          gamAtivo: true,
          tituloNivel: r?.progresso.titulo ?? null,
          liga: r?.liga.nome ?? null,
        }
      } catch { return { progresso: null, gamAtivo: false, tituloNivel: null, liga: null } }
    })(),
    // Personalização (avatar + cor) — tolerante se a migração ainda não rodou.
    (async (): Promise<{ avatar: string | null; avatarCor: string | null }> => {
      try { const p = await lerPersonalizacaoEstudante(svc, sessao.estudanteId); return { avatar: p.avatar, avatarCor: p.avatarCor } }
      catch { return { avatar: null, avatarCor: null } }
    })(),
    // Pendências do LegProc (selo na sidebar) — só quando a Leitura está ativa; tolerante.
    (async (): Promise<number> => (LEITURA_ATIVA ? totalPendenciasLeitura(sessao.estudanteId, sessao.tenantId) : 0))(),
  ])

  const { css, tema, tenantNome } = themeData
  const { counts, personalizados: simuladosPersonalizados } = contadores
  const t = (tema ?? {}) as any
  const rotulosAluno = resolverSidebarRotulos(t.sidebar_rotulos).aluno
  // Layout de navegação MOBILE, escolhido no console (Aparência → Mobile): 'tabs' | 'menu'.
  const navMode: 'tabs' | 'menu' = t.mobile_nav === 'menu' ? 'menu' : 'tabs'
  const { progresso, gamAtivo } = gamData
  const avatarUsuario = persData.avatar
  const avatarCorUsuario = persData.avatarCor

  // ── MARCA do tenant (Fase 3): lida de `tema.aparencia_auth.brand`; ausente/indef → 'revisao'. ──
  // getCurrentTenant é memoizado por request (o getTenantTheme já o chamou), então sem round-trip extra.
  const tenant = await getCurrentTenant()
  const aparencia = lerAparenciaAuth(tema, { slug: tenant?.slug, nome: tenant?.nome ?? tenantNome })
  const brand: AlunoBrand = aparencia.brand

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

  // Manutenção POR ÁREA do ALUNO: some do menu e bloqueia a rota — exceto os alunos no allowlist.
  const alunoAtivos = normalizarMapaAreas(t.manutencao_aluno, AREAS_MANUTENCAO_ALUNO)
  const alunoLiberados = normalizarLiberados(t.manutencao_aluno_liberados, AREAS_MANUTENCAO_ALUNO)
  const hManut = await headers()
  const pathAtual = (hManut.get('x-full-path') || hManut.get('x-pathname') || '').split('?')[0]
  const areaAlunoBloqueada = areaAlunoBloqueadaDoPath(pathAtual, alunoAtivos, alunoLiberados, sessao.estudanteId)
  const hrefsOcultosAluno = hrefsBloqueadosAluno(alunoAtivos, alunoLiberados, sessao.estudanteId)

  // ── Nav canônico de 8 itens (spec 03 §2.1), p/ os shells VND/MEQ consumirem via contrato. ──
  // O shell da Revisão continua usando AlunoSidebar/AlunoMobileNav (nav próprio) — este objeto é
  // inofensivo p/ ela. Mesmos gates de visibilidade da sidebar (flags/gamAtivo/cronograma/manutenção).
  const navCanonico: AlunoNavItem[] = (
    [
      { href: '/aluno', label: 'Início', short: 'Início', icon: 'Home', exact: true },
      { href: '/aluno/simulados', label: 'Simulados Realizados', short: 'Realizados', icon: 'ClipboardList' },
      { href: '/aluno/leitura', label: 'Desafio de Lei Seca', short: 'Lei Seca', icon: 'Library', gate: LEITURA_ATIVA },
      { href: '/aluno/jurisprudencia', label: 'Desafio de Jurisprudência', short: 'Juris', icon: 'Gavel', gate: JURISPRUDENCIA_ATIVA },
      { href: '/aluno/cronograma', label: 'Cronograma', short: 'Cronograma', icon: 'CalendarDays', gate: !OCULTAR_CRONOGRAMA },
      { href: '/aluno/recomendado', label: 'Recomendado', short: 'Recomendado', icon: 'Lightbulb' },
      { href: '/aluno/questoes', label: 'Banco de Questões', short: 'Questões', icon: 'BookOpen' },
      { href: '/aluno/ligas', label: 'Ligas', short: 'Ligas', icon: 'Trophy', gate: gamAtivo },
    ] as Array<AlunoNavItem & { exact?: boolean; gate?: boolean }>
  )
    .filter((n) => n.gate !== false && !hrefsOcultosAluno.includes(n.href))
    .map(({ exact, gate, ...n }) => {
      const c = counts[n.href]
      const ativo = exact ? pathAtual === n.href : pathAtual.startsWith(n.href)
      return { ...n, badge: c && c > 0 ? String(c) : undefined, ativo }
    })

  // ── Usuário do shell (perfil + gamificação) — derivado do que o layout já tem. ──
  const primeiroNome = (sessao.nome || 'Aluno').trim().split(/\s+/)[0] || 'Aluno'
  const usuarioShell: AlunoShellUsuario = {
    primeiroNome,
    iniciais: iniciaisDe(sessao.nome || 'Aluno'),
    nivel: progresso?.nivel ?? 1,
    xpTotal: progresso?.xpTotal ?? 0,
    streak: progresso?.streak ?? 0,
    tituloNivel: gamData.tituloNivel ?? undefined,
    liga: gamData.liga,
    posicaoLiga: null, // não computado neste layout; shells VND/MEQ toleram null
    avatarUrl: avatarUsuario,
    avatarCor: avatarCorUsuario,
    gamAtivo, // config do tenant p/ ESTE aluno — off esconde XP/nível/liga no chrome do shell
  }

  // ── Tokens de marca (VND/MEQ) escopados em `.app` — resolve a colisão `--muted`. ──
  // Revisão NÃO injeta brand-tokens: mantém o tema do tenant intacto (css do getTenantTheme).
  const brandCss = brand === 'revisao'
    ? ''
    : TEMAS_POR_MARCA[brand].map((th) => escoparEmApp(brandTokensCss(brand, th))).filter(Boolean).join('\n')

  const shellProps = {
    brand,
    nav: navCanonico,
    usuario: usuarioShell,
    pathname: pathAtual,
    logoUrl: t.logo_url ?? null,
    revisao: {
      logo: t.logo_url ?? null,
      nome: t.nome_site ?? tenantNome ?? 'Área do Aluno',
      subtitulo: t.subtitulo_site ?? 'Área do aluno',
      logoBg: t.logo_png_bg ?? '#ffffff',
      logoEstilo: t.logo_estilo ?? 'arredondado',
      logoFiltro: t.logo_filtro_sistema ?? t.logo_filtro ?? 'none',
      usuarioNome: sessao.nome,
      usuarioEmail: sessao.email,
      avatar: avatarUsuario,
      avatarCor: avatarCorUsuario,
      counts,
      simuladosPersonalizados,
      loginConfig: resolverLoginConfig(t.login),
      progresso,
      gamAtivo,
      hrefsOcultos: hrefsOcultosAluno,
      pendenciasLeitura: pendLeitura,
      rotulos: rotulosAluno,
      navMode,
      areaBloqueada: areaAlunoBloqueada || null,
    },
  }

  // ── NOVO SHELL INTERNO (opt-in): quando o console liga `internoAtivo` e a marca é Revisão, usa o
  // shell redesenhado (sidebar nova + top bar + down bar) com o conteúdo FULL-BLEED. Desligado → shell atual. ──
  if (aparencia.internoAtivo && brand === 'revisao') {
    const dark = await resolveTemaDark()
    return (
      <div className="app contents" data-brand="revisao">
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
        {/* O tenant injeta `main h1{color:var(--content-title)}` (p/ títulos das páginas legadas) — no
            redesign os h1 são títulos de BANNER que devem herdar a cor do contexto (branco no banner). */}
        <style dangerouslySetInnerHTML={{ __html: '.app h1{color:inherit}' }} />
        <FontScaleInit scope={`aluno:${sessao.email || 'aluno'}`} />
        <MonitorManutencao inicial={{ inicio: manut.inicio, avisos: manut.avisos }} />
        <GuiaTourRunner gamAtivo={gamAtivo} />
        <ShellRevisaoNova
          theme={dark ? 'escuro' : 'claro'}
          nav={navCanonico}
          usuario={usuarioShell}
          pathname={pathAtual}
          logo={t.logo_url ?? null}
          nome={t.nome_site ?? tenantNome ?? 'Área do Aluno'}
          subtitulo={t.subtitulo_site ?? null}
        >
          {areaAlunoBloqueada ? <AreaEmManutencao area={areaAlunoBloqueada} /> : children}
        </ShellRevisaoNova>
      </div>
    )
  }

  return (
    // `.app` + data-brand: escopa os brand-tokens do redesign (VND/MEQ) ao shell do aluno.
    <div className="app contents" data-brand={brand}>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {brandCss && <style dangerouslySetInnerHTML={{ __html: brandCss }} />}
      {/* No redesign (internoAtivo), os h1 são títulos de BANNER e devem herdar a cor do contexto —
          neutraliza o `main h1{color:var(--content-title)}` do tenant (que é p/ as páginas legadas). */}
      {aparencia.internoAtivo && <style dangerouslySetInnerHTML={{ __html: '.app h1{color:inherit}' }} />}
      {/* Anti-flash: aplica a escala de fonte salva (por aluno) antes do 1º paint. */}
      <FontScaleInit scope={`aluno:${sessao.email || 'aluno'}`} />
      <MonitorManutencao inicial={{ inicio: manut.inicio, avisos: manut.avisos }} />
      {/* Tour guiado da Capi (acionado pelo "Iniciar passo a passo" na Ajuda) — global p/ sobreviver à navegação. */}
      <GuiaTourRunner gamAtivo={gamAtivo} />
      {/* Manutenção por área do aluno: VND/MEQ (e Revisão legada) bloqueiam o CONTEÚDO da rota aqui —
          o shell da Revisão interno já trata no seu ramo; aqui cobrimos o caminho dos demais shells. */}
      <AlunoShell {...shellProps}>
        {areaAlunoBloqueada ? <AreaEmManutencao area={areaAlunoBloqueada} /> : children}
      </AlunoShell>
    </div>
  )
}
