import { NotebookPen } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'
import { CronogramaTabs } from '@/components/admin/cronograma-tabs'
import { listarCronogramas } from '../actions'
import { ConteudoClient } from './conteudo-client'

export const dynamic = 'force-dynamic'

export default async function ConteudoPage() {
  const r = await listarCronogramas()

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <NotebookPen className="h-6 w-6 text-primary" />
          Conteúdo dos cronogramas
        </h1>
        <p className="text-muted-foreground">
          Monte e ajuste as metas de cada cronograma à mão — disciplina, aula, conteúdo e duração —
          sem depender de importação. Escolha um cronograma para editar.
        </p>
      </div>

      <CronogramaTabs />

      {!r.ok ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar os cronogramas.'}</SemPermissao>
      ) : (
        <ConteudoClient cronogramas={r.itens ?? []} />
      )}
    </div>
  )
}
