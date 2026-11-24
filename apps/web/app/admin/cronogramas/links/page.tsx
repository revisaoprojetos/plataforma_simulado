import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarLinks } from './actions'
import { LinksClient } from './links-client'

export const dynamic = 'force-dynamic'

export default async function LinksAulaPage() {
  const r = await listarLinks()

  return (
    <div className="animate-page space-y-6">
      <TituloTela titulo="Links de aula" descricao="Cada aula pode ter um link por plataforma de curso cadastrada. Valem para todos os cronogramas que citarem aquela aula — não são por cronograma." />


      {!r.ok ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar os links.'}</SemPermissao>
      ) : (
        <LinksClient inicial={r.itens ?? []} plataformasIniciais={r.plataformas ?? []} faltandoInicial={r.faltando ?? []} />
      )}
    </div>
  )
}
