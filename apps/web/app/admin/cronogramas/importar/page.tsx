import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { SemPermissao } from '@/components/ui/alert-box'
import { carregarEstadoAtual } from './actions'
import { ImportarClient } from './importar-client'

export const dynamic = 'force-dynamic'

export default async function ImportarPage() {
  const r = await carregarEstadoAtual()

  return (
    <div className="animate-page space-y-6">
      <TituloTela titulo="Importação" descricao="Substitui as metas dos cronogramas mencionados nos arquivos. Cronogramas que não aparecerem ficam intocados, e reimportar o mesmo arquivo duas vezes dá o mesmo resultado." />

      {!r.ok || !r.estado ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar o catálogo atual.'}</SemPermissao>
      ) : (
        <ImportarClient estado={r.estado} />
      )}
    </div>
  )
}
