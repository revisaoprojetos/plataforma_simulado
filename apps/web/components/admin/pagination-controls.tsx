'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationControlsProps {
  page: number
  totalPages: number
  /** Se definido, mostra o seletor de itens por página (valor atual). */
  perPage?: number
  perPageOptions?: number[]
}

export function PaginationControls({ page, totalPages, perPage, perPageOptions = [10, 12, 15, 20] }: PaginationControlsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`${pathname}?${params.toString()}`)
  }
  function mudarPorPagina(n: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('pp', String(n))
    params.set('page', '1') // muda o tamanho → volta pra 1ª página (evita cair além do fim)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Sem paginação e sem seletor → nada a mostrar.
  if (totalPages <= 1 && perPage == null) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
        {perPage != null && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Por página:</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1 rounded-lg border bg-card px-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-popup-open:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                {perPage} <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[4.5rem]">
                {perPageOptions.map((n) => (
                  <DropdownMenuItem key={n} onClick={() => mudarPorPagina(n)} className={cn('justify-between', n === perPage && 'font-semibold text-primary')}>
                    {n} {n === perPage && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {totalPages > 1 && (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => goToPage(1)} disabled={page <= 1}>
          <ChevronsLeft className="h-4 w-4" /> Início
        </Button>
        <Button variant="outline" size="sm" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Button>
        <Button variant="outline" size="sm" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
          Próxima <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => goToPage(totalPages)} disabled={page >= totalPages}>
          Final <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
      )}
    </div>
  )
}
