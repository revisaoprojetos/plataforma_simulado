import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarConteudos } from './actions'
import { listarDisciplinasFiltro } from '../../banco-questoes/actions'
import { ConteudosClient } from './conteudos-client'

export const dynamic = 'force-dynamic'

export default async function ConteudosPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  const [r, disciplinas] = await Promise.all([listarConteudos(pasta ?? null), listarDisciplinasFiltro()])

  return (
    <div className="animate-page space-y-6">
      <TituloTela titulo="Conjuntos" descricao="Conjuntos de aulas reutilizáveis por disciplina — conteúdo, questões, links e vídeo. Depois é só selecionar ao montar um cronograma." />


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
