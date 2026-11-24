import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { SemPermissao } from '@/components/ui/alert-box'
import { carregarRelatorio } from './actions'
import { RelatoriosClient } from './relatorios-client'

export const dynamic = 'force-dynamic'

export default async function RelatoriosCronogramaPage() {
  const r = await carregarRelatorio(30)

  return (
    <div className="animate-page space-y-6">
      <TituloTela titulo="Relatórios" descricao="O que foi emitido, por quem, e quanto de cada plano os alunos já marcaram como concluído." />

      {!r.ok || !r.dados ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar os relatórios.'}</SemPermissao>
      ) : (
        <RelatoriosClient dados={r.dados} />
      )}
    </div>
  )
}
