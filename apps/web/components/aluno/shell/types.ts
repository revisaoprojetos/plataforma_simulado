// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO COMPARTILHADO do shell da área do aluno por MARCA (Fase 3 do redesign).
// ─────────────────────────────────────────────────────────────────────────────
//
// Consumido por 3 agentes/arquivos:
//   - aluno-shell.tsx   (este agente) — faz o SWITCH por marca.
//   - shell-vnd.tsx     (outro agente) — shell da marca VND.
//   - shell-meq.tsx     (outro agente) — shell da marca MEQ.
//
// NÃO altere o shape sem alinhar com os outros dois shells: os campos abaixo são a
// única superfície de dados que o layout do servidor entrega ao shell.

import type React from 'react'

/** Marca visual do tenant (resolvida de `tema.aparencia_auth.brand`; default 'revisao'). */
export type AlunoBrand = 'revisao' | 'vnd' | 'meq'

/**
 * Item de navegação canônico (spec 03 §2.1). `label` = rótulo longo (sidebar),
 * `short` = rótulo curto (barra mobile), `icon` = nome do ícone lucide (kebab/pascal
 * conforme o shell resolver), `badge` = texto opcional (ex.: contagem), `ativo` =
 * item da rota atual.
 */
export interface AlunoNavItem {
  href: string
  label: string
  short: string
  icon: string
  badge?: string
  ativo?: boolean
}

/** Dados do usuário/gamificação exibidos no shell (perfil + progresso). */
export interface AlunoShellUsuario {
  primeiroNome: string
  iniciais: string
  nivel: number
  xpTotal: number
  tituloNivel?: string
  liga?: string | null
  posicaoLiga?: number | null
  avatarUrl?: string | null
  avatarCor?: string | null
  /** Gamificação ligada p/ este aluno (config do tenant). false → esconde XP/nível/liga no chrome. */
  gamAtivo?: boolean
}

/** Props do shell: a marca, o nav, o usuário, o pathname e o conteúdo da página. */
export interface AlunoShellProps {
  brand: AlunoBrand
  nav: AlunoNavItem[]
  usuario: AlunoShellUsuario
  pathname?: string
  /** Logo do tenant (`tema.logo_url`) para o chrome do shell (ex.: topo do rail no MEQ). Opcional. */
  logoUrl?: string | null
  children: React.ReactNode
}
