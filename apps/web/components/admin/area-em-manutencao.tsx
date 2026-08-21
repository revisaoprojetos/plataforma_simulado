import Link from 'next/link'
import { Wrench, Settings } from 'lucide-react'
import type { AreaManutencao } from '@/lib/sistema/manutencao-areas'

/** Tela mostrada no lugar do conteúdo quando a área está em manutenção (bloqueio de rota). */
export function AreaEmManutencao({ area, podeGerenciar = false }: { area: AreaManutencao; podeGerenciar?: boolean }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Wrench className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-xl font-bold tracking-tight">{area.label} em manutenção</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta área está temporariamente indisponível enquanto passa por manutenção. Tente novamente mais tarde.
        </p>
        {podeGerenciar && (
          <Link
            href="/admin/sistema"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Settings className="h-4 w-4" /> Gerenciar manutenção
          </Link>
        )}
      </div>
    </div>
  )
}
