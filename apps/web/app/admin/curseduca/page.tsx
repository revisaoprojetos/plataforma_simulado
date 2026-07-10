import { AlertTriangle } from 'lucide-react'
import { listarGruposCurseduca } from './actions'
import { CurseducaImport } from '@/components/admin/curseduca-import'

export const dynamic = 'force-dynamic'

export default async function CurseducaPage() {
  const r = await listarGruposCurseduca()

  return (
    <div className="animate-page w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integração Curseduca</h1>
        <p className="text-muted-foreground">Selecione um ou mais grupos de acesso da Curseduca e importe os alunos para o sistema — sem duplicar quem já existe.</p>
      </div>

      {!r.ok ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-400">Não foi possível carregar os grupos</p>
            <p className="text-muted-foreground">{r.error}</p>
          </div>
        </div>
      ) : (
        <CurseducaImport grupos={r.grupos ?? []} sistema={r.sistema ?? []} />
      )}
    </div>
  )
}
