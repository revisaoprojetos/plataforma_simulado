'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Peças visuais COMUNS às sub-abas de gestão (Unificar · Classificação · Etiquetas). Mesma estrutura do painel de pastas / Banco:
// coluna esquerda = card arredondado com título em caixa-alta pequena; coluna direita = card com a mesma altura
// (xl:h-[calc(100vh-9.5rem)]) e rolagem interna. Só tokens de cor do tema.

export const ALTURA_XL = 'xl:h-[calc(100vh-9.5rem)]'

/** Coluna esquerda (mesma casca do PastasPainel). */
export function Trilho({ titulo, acao, children, rodape, rotulo }: { titulo: string; acao?: ReactNode; children: ReactNode; rodape?: ReactNode; rotulo?: string }) {
  return (
    <aside className={cn('flex min-h-[320px] flex-col rounded-2xl border bg-card p-2 shadow-sm xl:sticky xl:top-3', ALTURA_XL)} aria-label={rotulo ?? titulo}>
      <div className="mb-1 flex items-center justify-between gap-2 px-2 pt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
        {acao}
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-1 pr-1 [scrollbar-gutter:stable]">{children}</div>
      {rodape && <div className="mt-1 border-t px-2 pt-2 text-xs text-muted-foreground">{rodape}</div>}
    </aside>
  )
}

/** Card principal à direita (mesma altura do trilho no xl). */
export function PainelCard({ titulo, acao, barra, children, rotulo }: { titulo: string; acao?: ReactNode; barra?: ReactNode; children: ReactNode; rotulo?: string }) {
  return (
    <section className={cn('flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card p-2 shadow-sm', ALTURA_XL)} aria-label={rotulo ?? titulo}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
        {acao && <div className="flex flex-wrap items-center gap-2">{acao}</div>}
      </div>
      {barra && <div className="flex flex-wrap items-center gap-2 border-b px-2 pb-2.5 pt-1.5">{barra}</div>}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

/** Item selecionável do trilho (mesmo visual dos nós da árvore). */
export function ItemTrilho({ ativo, onClick, onPointerEnter, children, n, destaque }: { ativo?: boolean; onClick: () => void; onPointerEnter?: () => void; children: ReactNode; n?: number | string; destaque?: boolean }) {
  return (
    <button type="button" onClick={onClick} onPointerEnter={onPointerEnter} aria-current={ativo}
      className={cn('flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium', ativo ? 'bg-primary/10 text-primary' : 'hover:bg-muted', destaque && !ativo && 'text-amber-700 dark:text-amber-400')}>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">{children}</span>
      {n !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{typeof n === 'number' ? n.toLocaleString('pt-BR') : n}</span>}
    </button>
  )
}

/** Abas de sublinhado (border-b-2) — padrão das abas do admin. */
export function AbasSublinhado<T extends string>({ abas, valor, onChange, rotulo, onHover }: { abas: { id: T; nome: string; n?: number }[]; valor: T; onChange: (v: T) => void; rotulo: string; onHover?: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label={rotulo}>
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={valor === a.id} onClick={() => onChange(a.id)} onPointerEnter={() => onHover?.(a.id)}
          className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors', valor === a.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {a.nome}{a.n !== undefined && a.n > 0 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">{a.n.toLocaleString('pt-BR')}</span>}
        </button>
      ))}
    </div>
  )
}

export function Carregando({ linhas = 8 }: { linhas?: number }) {
  return (
    <div className="animate-pulse space-y-2 p-3" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => <div key={i} className="h-9 rounded-lg bg-muted" style={{ width: `${96 - (i % 4) * 8}%` }} />)}
    </div>
  )
}
export function ErroTentar({ msg, onTentar }: { msg: string; onTentar: () => void }) {
  return (
    <div className="m-3 rounded-xl border p-4 text-center text-sm"><p className="mb-2 text-destructive">Não foi possível carregar ({msg}).</p><Button variant="outline" onClick={onTentar}>Tentar de novo</Button></div>
  )
}
export function Vazio({ children }: { children: ReactNode }) { return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{children}</p> }
export function Girando({ ligado }: { ligado: boolean }) { return ligado ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" /> : null }

export const campoBusca = 'h-9 w-full min-w-48 rounded-lg border bg-background pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40'
export const selectBarra = 'h-9 rounded-lg border bg-card px-2.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
export const thCls = 'whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground'
