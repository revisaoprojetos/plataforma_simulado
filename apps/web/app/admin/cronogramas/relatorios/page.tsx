import { BarChart3 } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'
import { carregarRelatorio } from './actions'
import { RelatoriosClient } from './relatorios-client'

export const dynamic = 'force-dynamic'

export default async function RelatoriosCronogramaPage() {
  const r = await carregarRelatorio(30)

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="h-6 w-6 text-primary" />
          Relatórios de cronograma
        </h1>
        <p className="text-muted-foreground">
          O que foi emitido, por quem, e quanto de cada plano os alunos já marcaram como concluído.
        </p>
      </div>

      {!r.ok || !r.dados ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar os relatórios.'}</SemPermissao>
      ) : (
        <RelatoriosClient dados={r.dados} />
      )}
    </div>
  )
}
