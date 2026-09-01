import { NotebookPen } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'
import { CronogramaTabs } from '@/components/admin/cronograma-tabs'
import { listarConteudos } from './actions'
import { listarDisciplinasFiltro } from '../../banco-questoes/actions'
import { ConteudosClient } from './conteudos-client'

export const dynamic = 'force-dynamic'

export default async function ConteudosPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  const [r, disciplinas] = await Promise.all([listarConteudos(pasta ?? null), listarDisciplinasFiltro()])

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <NotebookPen className="h-6 w-6 text-primary" />
          Banco de Conteúdos
        </h1>
        <p className="text-muted-foreground">
          Conjuntos de aulas reutilizáveis por disciplina — conteúdo, questões, links e vídeo. Depois é só
          selecionar ao montar um cronograma.
        </p>
      </div>

      <CronogramaTabs />

      {!r.ok ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar o banco de conteúdos.'}</SemPermissao>
      ) : (
        <ConteudosClient
          conjuntos={r.conjuntos ?? []}
          pastas={r.pastas ?? []}
          trilha={r.trilha ?? []}
          pastaAtual={pasta ?? null}
          disciplinas={disciplinas}
        />
      )}
    </div>
  )
}
