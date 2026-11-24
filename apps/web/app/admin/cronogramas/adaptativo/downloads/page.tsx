import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { DownloadsClient } from './downloads-client'

export const dynamic = 'force-dynamic'

// Admin: Downloads dos alunos — chave de bloqueio da plataforma + registro/análise (geral e individual) por conteúdo, meta e aluno.
export default function CronogramaAdaptativoDownloadsPage() {
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Downloads dos alunos" descricao="Controle se o aluno pode baixar os materiais e acompanhe cada download (e cada tentativa bloqueada) por conteúdo, por meta do cronograma e por aluno." />
      <DownloadsClient />
    </div>
  )
}
