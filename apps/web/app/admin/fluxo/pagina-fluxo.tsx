import { SemPermissao } from '@/components/ui/alert-box'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { obterAdaptador } from '@/lib/admin/fluxo/registro'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarDadosConstrutor } from '@/lib/admin/fluxo/overlay-server'
import { FluxoEditor } from '@/components/admin/fluxo/fluxo-editor'

/** Server component compartilhado (abas Fluxo do Gerador/Adaptativo e rota /admin/fluxo/[adaptador]). SÓ LÊ: o servidor monta nós/arestas/schema; o cliente desenha. */
export async function PaginaFluxo({ adaptadorId }: { adaptadorId: string }) {
  const ad = obterAdaptador(adaptadorId)
  if (!ad) return <SemPermissao>Fluxo não encontrado.</SemPermissao>
  const a = await getCurrentAccess()
  if (!a.tenantId || !accessCan(a, ad.permVer)) return <SemPermissao>Você não tem permissão para ver este fluxo.</SemPermissao>
  const ctx = { tenantId: a.tenantId, userId: a.userId ?? null, podeEditar: accessCan(a, ad.permEditar) }
  const dados = await ad.carregar(ctx)
  dados.construtor = await carregarDadosConstrutor(createAdminClient(), ctx, ad)
  return (
    <div className="flex w-full flex-col gap-2">
      <TituloTela titulo="Fluxo" descricao={ad.descricao} denso />
      <FluxoEditor adaptadorId={ad.id} titulo={ad.titulo} dados={dados} />
    </div>
  )
}
