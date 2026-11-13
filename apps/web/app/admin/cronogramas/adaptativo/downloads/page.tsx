import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { DownloadsClient } from './downloads-client'

export const dynamic = 'force-dynamic'

// Admin: Downloads dos alunos — chave de bloqueio da plataforma + registro/análise (geral e individual) por conteúdo, meta e aluno.
export default function CronogramaAdaptativoDownloadsPage() {
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Downloads dos alunos</h1>
        <p className="text-muted-foreground">
          Controle se o aluno pode baixar os materiais e acompanhe cada download (e cada tentativa bloqueada) por conteúdo, por meta do cronograma e por aluno.
        </p>
      </div>
      <AdaptativoTabs />
      <DownloadsClient />
    </div>
  )
}
