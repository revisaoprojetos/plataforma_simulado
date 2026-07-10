import Link from 'next/link'
import { ArrowLeft, RefreshCw, KeyRound, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { listarGruposCurseduca, listarRegrasSync } from '../actions'
import { CurseducaSync } from '@/components/admin/curseduca-sync'

export const dynamic = 'force-dynamic'

export default async function CurseducaSyncPage() {
  const [g, r] = await Promise.all([listarGruposCurseduca(), listarRegrasSync()])

  return (
    <div className="animate-page w-full space-y-6">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
          <Link href="/admin/curseduca" className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'shrink-0')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"><RefreshCw className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Sincronização automática</h1>
            <p className="text-muted-foreground">O sistema reimporta os grupos escolhidos no intervalo definido — alunos novos na Curseduca aparecem sozinhos.</p>
          </div>
        </div>
      </div>

      {!g.ok ? (
        <Link href="/admin/curseduca/credenciais" className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm transition hover:bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Integração não configurada</p>
            <p className="text-muted-foreground">{g.error}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400"><KeyRound className="h-4 w-4" /> Configurar <ChevronRight className="h-4 w-4" /></span>
        </Link>
      ) : (
        <CurseducaSync grupos={g.grupos ?? []} sistema={g.sistema ?? []} regras={r.regras ?? []} />
      )}
    </div>
  )
}
