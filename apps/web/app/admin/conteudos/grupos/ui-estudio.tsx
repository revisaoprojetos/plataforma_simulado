'use client'

// Peças visuais compartilhadas das áreas Grupos e Ofertas do Estúdio (porte do designer:
// pílulas de filtro, checkbox 18px, paginação, botão primário em gradiente). Mesmo padrão de Produtos.

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export const GRAD_PRIMARY = { background: 'linear-gradient(180deg,color-mix(in oklab,var(--primary) 85%,white),var(--primary))' }
export const BTN_TOP = 'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[11px] border bg-card px-3.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60'
export const BTN_PRIMARY = 'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[11px] px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)] disabled:opacity-60'
export const BTN_ICON = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted'
export const INPUT = 'h-11 w-full rounded-[13px] border bg-card px-3.5 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60'
export const LABEL_CAPS = 'text-[11px] font-extrabold uppercase tracking-[.16em] text-muted-foreground'

export function Check18({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick}
      className={cn('inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-[1.5px] text-primary-foreground', on ? 'border-primary bg-primary' : 'bg-card')}>
      {on && <Check className="h-3 w-3" />}
    </button>
  )
}

export function Seta({ ativo, dir }: { ativo: boolean; dir: 'asc' | 'desc' }) {
  return ativo ? <span className="text-primary">{dir === 'asc' ? '▲' : '▼'}</span> : <span className="opacity-35">↕</span>
}

export function PgBtn({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-[9px] border bg-card px-2 text-[12.5px] font-bold text-foreground disabled:opacity-50">{children}</button>
  )
}

export function FiltroPill({ label, valorAtual, opcoes, onPick, todos = 'Todos' }: {
  label: string; valorAtual: string | null; opcoes: { value: string; label: string }[]; onPick: (v: string | null) => void; todos?: string
}) {
  const ativo = valorAtual != null && valorAtual !== ''
  const texto = ativo ? (opcoes.find((o) => o.value === valorAtual)?.label ?? label) : label
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold outline-none transition-colors',
        ativo ? 'border-primary bg-primary/10 text-primary' : 'border-dashed bg-card text-foreground hover:bg-muted')}>
        {texto}<ChevronDown className="h-[13px] w-[13px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] min-w-[200px] overflow-auto">
        <DropdownMenuItem onClick={() => onPick(null)} className={cn(!ativo && 'font-semibold text-primary')}>{todos}</DropdownMenuItem>
        {opcoes.length > 0 && <DropdownMenuSeparator />}
        {opcoes.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onPick(o.value)} className={cn(o.value === valorAtual && 'font-semibold text-primary')}>{o.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Pílula ligada à querystring (filtra no servidor: a page lê o param). */
export function FiltroPillUrl({ label, param, opcoes }: { label: string; param: string; opcoes: { value: string; label: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  return (
    <FiltroPill label={label} valorAtual={sp.get(param)} opcoes={opcoes}
      onPick={(v) => {
        const p = new URLSearchParams(sp.toString())
        if (v) p.set(param, v); else p.delete(param)
        p.delete('page')
        router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
      }} />
  )
}

const PP = [5, 10, 25, 50]

export function Paginacao({ page, perPage, total, onPage, onPerPage }: {
  page: number; perPage: number; total: number; onPage: (n: number) => void; onPerPage: (n: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const inicio = total === 0 ? 0 : (page - 1) * perPage + 1
  const fim = Math.min(total, page * perPage)
  const ir = (n: number) => onPage(Math.min(Math.max(1, n), totalPages))
  const paginas: (number | '…')[] = (() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const s = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages))
    const o = [...s].sort((a, b) => a - b); const r: (number | '…')[] = []
    o.forEach((n, i) => { if (i && n - o[i - 1] > 1) r.push('…'); r.push(n) }); return r
  })()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] text-muted-foreground">
        Mostrando <b className="text-foreground">{inicio}–{fim}</b> de <b className="text-foreground">{total.toLocaleString('pt-BR')}</b> · {totalPages} {totalPages === 1 ? 'página' : 'páginas'}
      </span>
      <span className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 items-center gap-2 rounded-[9px] border bg-card pl-3 pr-2.5 text-[12.5px] font-bold text-foreground outline-none">
          {perPage} por página<ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-[150px]">
          {PP.map((n) => (
            <DropdownMenuItem key={n} onClick={() => onPerPage(n)} className={cn(n === perPage && 'font-semibold text-primary')}>{n} por página</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <PgBtn label="Primeira página" disabled={page <= 1} onClick={() => ir(1)}><ChevronsLeft className="h-3.5 w-3.5" /></PgBtn>
      <PgBtn label="Página anterior" disabled={page <= 1} onClick={() => ir(page - 1)}><ChevronLeft className="h-3.5 w-3.5" /></PgBtn>
      {paginas.map((n, i) => n === '…'
        ? <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
        : <button key={n} type="button" onClick={() => ir(n)} aria-current={n === page ? 'page' : undefined}
            className={cn('h-8 min-w-8 rounded-[9px] text-[12.5px]', n === page ? 'bg-primary font-extrabold text-primary-foreground' : 'border bg-card font-bold text-foreground')}>{n}</button>)}
      <PgBtn label="Próxima página" disabled={page >= totalPages} onClick={() => ir(page + 1)}><ChevronRight className="h-3.5 w-3.5" /></PgBtn>
      <PgBtn label="Última página" disabled={page >= totalPages} onClick={() => ir(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></PgBtn>
    </div>
  )
}

/** Baixa um CSV (UTF-8 com BOM, separador `;`) gerado no cliente. */
export function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => { const s = String(v ?? '').replace(/"/g, '""'); return /[";\n\r]/.test(s) ? `"${s}"` : s }
  const csv = '﻿' + [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nomeArquivo
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Copia texto para a área de transferência com toast (sucesso/erro). */
export async function copiarTexto(texto: string, okMsg: string) {
  const { toast } = await import('sonner')
  try { await navigator.clipboard.writeText(texto); toast.success(okMsg) } catch { toast.error('Não foi possível copiar.') }
}
