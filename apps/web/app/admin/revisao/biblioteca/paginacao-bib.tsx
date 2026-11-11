'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const paginas = (a: number, t: number): (number | '…')[] => {
  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1)
  const o: (number | '…')[] = [1]; const x = Math.max(2, a - 1), y = Math.min(t - 1, a + 1)
  if (x > 2) o.push('…'); for (let i = x; i <= y; i++) o.push(i); if (y < t - 1) o.push('…'); o.push(t); return o
}

/** Rodapé de paginação da Biblioteca (intervalo, "Por página" e botões) — usado pelas tabelas de documentos e pelo banco de questões. */
export function PaginacaoBib({ total, page, pp, opcoesPP, selecionados, carregando, onPage, onPP, rotuloVazio = 'Nenhum registro' }: {
  total: number; page: number; pp: number; opcoesPP: number[]; selecionados: number; carregando: boolean
  onPage: (p: number) => void; onPP: (n: number) => void; rotuloVazio?: string
}) {
  const totalPag = Math.max(1, Math.ceil(total / pp))
  const ini = total === 0 ? 0 : (page - 1) * pp + 1, fim = Math.min(page * pp, total)
  return (
    <div className="mt-3 flex min-h-12 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{total === 0 ? rotuloVazio : `${ini.toLocaleString('pt-BR')}–${fim.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}{selecionados > 0 && ` · ${selecionados} selecionado(s) (a seleção continua ao trocar de página)`}</span>
      <label className="flex items-center gap-1.5">Por página
        <select className="h-8 rounded-lg border bg-background px-2 text-xs" value={pp} onChange={(e) => onPP(Number(e.target.value))}>{opcoesPP.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <nav className="flex items-center gap-1" aria-label="Paginação">
        <Button variant="outline" size="icon-sm" disabled={page <= 1 || carregando} onClick={() => onPage(1)} aria-label="Primeira página"><ChevronsLeft /></Button>
        <Button variant="outline" size="icon-sm" disabled={page <= 1 || carregando} onClick={() => onPage(page - 1)} aria-label="Página anterior"><ChevronLeft /></Button>
        {paginas(page, totalPag).map((p, i) => p === '…' ? <span key={`e${i}`} className="px-1">…</span> : (
          <Button key={p} variant={p === page ? 'default' : 'outline'} size="icon-sm" disabled={carregando} onClick={() => onPage(p)} aria-label={`Página ${p}`} aria-current={p === page ? 'page' : undefined}>{p}</Button>))}
        <Button variant="outline" size="icon-sm" disabled={page >= totalPag || carregando} onClick={() => onPage(page + 1)} aria-label="Próxima página"><ChevronRight /></Button>
        <Button variant="outline" size="icon-sm" disabled={page >= totalPag || carregando} onClick={() => onPage(totalPag)} aria-label="Última página"><ChevronsRight /></Button>
      </nav>
    </div>
  )
}
