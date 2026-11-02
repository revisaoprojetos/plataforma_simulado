'use client'

/**
 * Primitivos do bloco Materiais do Estúdio (Aulas / Arquivos / Biblioteca), no MODELO do Produtos:
 * <FiltroPill> (pílula que filtra no servidor via querystring), painel lateral (aside + seções),
 * botões do topo, badges semânticos e helpers de data BRT. A tabela é SEMPRE o <DataTable> único.
 * Cores via token; pt-BR; nunca ícone Sparkles.
 */

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { navProgressStart } from '@/lib/nav-progress'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export const GRAD_PRIMARY = { background: 'linear-gradient(180deg,color-mix(in oklab,var(--primary) 85%,white),var(--primary))' }
export const BTN_TOP = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border bg-card px-3.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted'
export const BTN_ICON_TOP = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted'
export const BTN_ACAO = 'flex h-[38px] items-center justify-center gap-2 rounded-[11px] border px-3 text-center text-[12.5px] font-bold leading-tight text-foreground hover:bg-muted disabled:opacity-60'
export const BTN_PRIMARIO = 'inline-flex h-9 w-full items-center justify-center gap-2 rounded-[11px] px-3.5 text-[13px] font-extrabold text-primary-foreground'

/** Querystring: troca/limpa 1 chave e volta à página 1 (a page filtra no servidor). */
export function useFiltroUrl() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const setFiltro = React.useCallback((chave: string, v: string | null) => {
    const p = new URLSearchParams(searchParams.toString())
    if (v) p.set(chave, v); else p.delete(chave)
    p.delete('page')
    navProgressStart()
    router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
  }, [router, pathname, searchParams])
  return { searchParams, setFiltro }
}

/** Dispara o download do XLSX da rota de export com a querystring atual (filtros/busca/ordem). */
export function baixarExport(rota: string, searchParams: URLSearchParams, extra?: Record<string, string>) {
  const p = new URLSearchParams(searchParams.toString())
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v)
  const a = document.createElement('a')
  a.href = `${rota}${p.toString() ? `?${p}` : ''}`
  document.body.appendChild(a); a.click(); a.remove()
  toast.message('Gerando a planilha…')
}

export type OpcaoPill = { value: string; label: string }

/** Pílula de filtro (dropdown) — idêntica à do Produtos. */
export function FiltroPill({ label, valorAtual, opcoes, onPick }: {
  label: string; valorAtual: string | null; opcoes: OpcaoPill[]; onPick: (v: string | null) => void
}) {
  const ativo = valorAtual != null
  const texto = ativo ? (opcoes.find((o) => o.value === valorAtual)?.label ?? label) : label
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold outline-none transition-colors',
        ativo ? 'border-primary bg-primary/10 text-primary' : 'border-dashed bg-card text-foreground hover:bg-muted')}>
        {texto}<ChevronDown className="h-[13px] w-[13px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] min-w-[200px] overflow-auto">
        <DropdownMenuItem onClick={() => onPick(null)} className={cn(!ativo && 'font-semibold text-primary')}>Todos</DropdownMenuItem>
        {opcoes.length > 0 && <DropdownMenuSeparator />}
        {opcoes.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onPick(o.value)} className={cn(o.value === valorAtual && 'font-semibold text-primary')}>{o.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Painel lateral ──────────────────────────────────────────────────────────────────────────────
export function PainelLateral({ children }: { children: React.ReactNode }) {
  return <aside className="flex flex-col gap-4 rounded-[20px] border bg-card p-5 xl:sticky xl:top-4">{children}</aside>
}
export function PainelVazio({ texto }: { texto: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{texto}</div>
}
export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <b className="text-[11px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">{titulo}</b>
      {children}
    </div>
  )
}
export function LinhaRegistro({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-t py-2 text-[13px]"><span className="text-muted-foreground">{rotulo}</span><b className="min-w-0 text-right text-foreground [overflow-wrap:anywhere]">{valor}</b></div>
}
export function CardNumero({ valor, rotulo }: { valor: React.ReactNode; rotulo: string }) {
  return (
    <div className="flex flex-col gap-[3px] rounded-[18px] border bg-card px-[18px] py-4">
      <b className="text-[26px] font-extrabold leading-tight tracking-[-0.04em] text-foreground">{valor}</b>
      <span className="text-[12.5px] font-bold text-foreground">{rotulo}</span>
    </div>
  )
}

// ── Badges / datas ──────────────────────────────────────────────────────────────────────────────
export function BadgeMaterial({ tem }: { tem: boolean }) {
  return tem ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Com material</span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Sem material</span>
  )
}

/** Data/hora empilhada em BRT (dd/mm/aaaa em cima, hh:mm embaixo). */
export function DataEmpilhada({ iso }: { iso: string | null | undefined }) {
  const s = formatBrt(iso)
  if (!s) return <span className="text-muted-foreground">—</span>
  const [d, h] = s.split(' ')
  return (
    <div className="min-w-0">
      <span className="block text-[12.5px] text-foreground">{d}</span>
      {h && <span className="text-[11.5px] text-muted-foreground">{h}</span>}
    </div>
  )
}

/** Só a data (dd/mm/aaaa) em BRT. */
export function dataCurtaBrt(iso: string | null | undefined): string {
  const s = formatBrt(iso)
  return s ? s.split(' ')[0] : '—'
}
