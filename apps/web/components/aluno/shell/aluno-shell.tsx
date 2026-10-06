'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SHELL DA ÁREA DO ALUNO POR MARCA (Fase 3 do redesign).
// ─────────────────────────────────────────────────────────────────────────────
//
// Switch único por `brand`:
//   - 'revisao' → renderiza EXATAMENTE o shell atual (sidebar + mobile-nav + wrappers
//     de hoje). Nada muda visualmente para o tenant Revisão (produção).
//   - 'vnd'     → <ShellVND /> (apps/web/components/aluno/shell/shell-vnd.tsx, outro agente).
//   - 'meq'     → <ShellMEQ /> (apps/web/components/aluno/shell/shell-meq.tsx, outro agente).
//
// O caminho 'revisao' recebe, além do CONTRATO (AlunoShellProps), o payload
// `revisao` com as props cruas que a AlunoSidebar/AlunoMobileNav já consumiam — o
// JSX foi MOVIDO do layout.tsx para cá sem alteração de comportamento.

import { Suspense } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SidebarEdgeToggle } from '@/components/ui/sidebar-collapse'
import { AlunoSidebar, type ProgressoAluno } from '@/components/aluno/aluno-sidebar'
import { AlunoMobileNav } from '@/components/aluno/aluno-mobile-nav'
import { NavProgress } from '@/components/admin/nav-progress'
import { AreaEmManutencao } from '@/components/admin/area-em-manutencao'
import { cn } from '@/lib/utils'
import type { LoginConfig } from '@/lib/login-config'
import type { SidebarRotulosAluno } from '@/lib/sidebar-rotulos'
import type { AreaManutencao } from '@/lib/sistema/manutencao-areas'
import { ShellVND } from '@/components/aluno/shell/shell-vnd'
import { ShellMEQ } from '@/components/aluno/shell/shell-meq'
import type { AlunoShellProps } from '@/components/aluno/shell/types'

/**
 * Dados crus que o shell da REVISÃO (shell atual) precisa além do contrato. São
 * exatamente as props que a `AlunoSidebar`/`AlunoMobileNav` já recebiam no layout.
 * VND/MEQ NÃO usam este payload — leem só o `AlunoShellProps`.
 */
export interface RevisaoShellData {
  logo: string | null
  nome: string
  subtitulo: string | null
  logoBg: string
  logoEstilo: string
  logoFiltro: string
  usuarioNome: string
  usuarioEmail?: string | null
  avatar: string | null
  avatarCor: string | null
  counts: Record<string, number>
  simuladosPersonalizados: number
  loginConfig: LoginConfig
  progresso: ProgressoAluno | null
  gamAtivo: boolean
  hrefsOcultos: string[]
  pendenciasLeitura: number
  rotulos?: SidebarRotulosAluno
  navMode: 'tabs' | 'menu'
  /** Área do aluno em manutenção p/ este aluno (bloqueia o conteúdo); null = liberado. */
  areaBloqueada: AreaManutencao | null
}

type Props = AlunoShellProps & { revisao?: RevisaoShellData }

export function AlunoShell(props: Props) {
  const { brand, children } = props

  if (brand === 'vnd') return <ShellVND {...props}>{children}</ShellVND>
  if (brand === 'meq') return <ShellMEQ {...props}>{children}</ShellMEQ>

  // ── REVISÃO: shell atual, idêntico ao de produção ──
  const r = props.revisao
  // Guarda defensiva: se o payload da revisão não vier (não deve acontecer), só renderiza o conteúdo.
  if (!r) return <>{children}</>

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AlunoSidebar
          logo={r.logo}
          nome={r.nome}
          subtitulo={r.subtitulo}
          logoBg={r.logoBg}
          logoEstilo={r.logoEstilo}
          logoFiltro={r.logoFiltro}
          usuarioNome={r.usuarioNome}
          usuarioEmail={r.usuarioEmail ?? null}
          avatar={r.avatar}
          avatarCor={r.avatarCor}
          counts={r.counts}
          simuladosPersonalizados={r.simuladosPersonalizados}
          loginConfig={r.loginConfig}
          progresso={r.progresso}
          gamAtivo={r.gamAtivo}
          hrefsOcultos={r.hrefsOcultos}
          pendenciasLeitura={r.pendenciasLeitura}
          rotulos={r.rotulos}
        />
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Toggle de recolher a sidebar: só no desktop (no mobile vale o chrome abaixo). */}
          <SidebarEdgeToggle hideOnMobile />
          <Suspense fallback={null}><NavProgress /></Suspense>
          {/* Folga no mobile conforme o modo: 'menu' → app bar no topo (pt); 'tabs' → barra embaixo (pb). */}
          <main className={cn('flex-1 overflow-y-auto p-4 md:p-6', r.navMode === 'menu' ? 'pt-[4.5rem] md:pt-6' : 'pb-24 md:pb-6')}>
            {r.areaBloqueada ? <AreaEmManutencao area={r.areaBloqueada} /> : children}
          </main>
        </div>
      </div>
      {/* Chrome de navegação mobile (barra inferior OU app bar+drawer), definido no console. */}
      <AlunoMobileNav
        navMode={r.navMode}
        loginConfig={r.loginConfig}
        logo={r.logo}
        nome={r.nome}
        subtitulo={r.subtitulo}
        logoBg={r.logoBg}
        logoEstilo={r.logoEstilo}
        logoFiltro={r.logoFiltro}
        usuarioNome={r.usuarioNome}
        avatar={r.avatar}
        avatarCor={r.avatarCor}
        counts={r.counts}
        hrefsOcultos={r.hrefsOcultos}
      />
    </SidebarProvider>
  )
}
