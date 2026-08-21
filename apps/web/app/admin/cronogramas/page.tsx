import { CalendarDays } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarCategorias, listarCronogramas } from './actions'
import { CronogramasClient } from './cronogramas-client'

export const dynamic = 'force-dynamic'

export default async function CronogramasPage() {
  const [r, cats] = await Promise.all([listarCronogramas(), listarCategorias()])

  return (
    <div className="animate-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6 text-primary" />
            Cronogramas de estudo
          </h1>
          <p className="text-muted-foreground">
            O catálogo que o aluno escolhe. Cada cronograma é uma grade fixa de semanas; o aluno informa a
            data de início e o sistema data e reprograma a grade para ele.
          </p>
        </div>
      </div>

      {!r.ok ? <SemPermissao>{r.error ?? 'Não foi possível carregar o catálogo.'}</SemPermissao> : <CronogramasClient inicial={r.itens ?? []} categoriasIniciais={cats.itens ?? []} />}
    </div>
  )
}
