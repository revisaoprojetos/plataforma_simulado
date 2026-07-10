import Link from 'next/link'
import { AlertTriangle, KeyRound, ChevronRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { listarGruposCurseduca } from './actions'
import { CurseducaImport } from '@/components/admin/curseduca-import'

export const dynamic = 'force-dynamic'

export default async function CurseducaPage() {
  const r = await listarGruposCurseduca()

  return (
    <div className="animate-page w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integração Curseduca</h1>
          <p className="text-muted-foreground">Selecione um ou mais grupos de acesso da Curseduca e importe os alunos para o sistema — sem duplicar quem já existe.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/curseduca/sincronizacao" className={cn(buttonVariants({ variant: 'outline' }))}>
            <RefreshCw className="mr-2 h-4 w-4" /> Sincronização
          </Link>
          <Link href="/admin/curseduca/credenciais" className={cn(buttonVariants({ variant: 'outline' }))}>
            <KeyRound className="mr-2 h-4 w-4" /> Credenciais
          </Link>
        </div>
      </div>

      {!r.ok ? (
        <Link href="/admin/curseduca/credenciais"
          className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm transition hover:bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Não foi possível carregar os grupos</p>
            <p className="text-muted-foreground">{r.error}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">Configurar credenciais <ChevronRight className="h-4 w-4" /></span>
        </Link>
      ) : (
        <CurseducaImport grupos={r.grupos ?? []} sistema={r.sistema ?? []} />
      )}
    </div>
  )
}
