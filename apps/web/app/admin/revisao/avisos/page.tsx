import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { avisosLista, gruposOpcoes, NADA } from '@/lib/admin-revisao/cs'
import { AvisosCliente } from './avisos-cliente'

export const dynamic = 'force-dynamic'
type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const PP = [5, 10, 25, 50]

// CS › Avisos e pop-ups (#avisos). Só LÊ (lista paginada no banco); criar/ligar/apagar em ./actions.ts.
export default async function AvisosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'configuracoes:view')) return <SemPermissao>Você não tem permissão para ver os avisos.</SemPermissao>
  const tenantId = access.tenantId ?? NADA
  const sp = await searchParams
  const pp = PP.includes(Number(um(sp.pp))) ? Number(um(sp.pp)) : 10
  const [lista, grupos] = await Promise.all([
    avisosLista(tenantId, { q: um(sp.q), local: um(sp.local), sort: um(sp.sort), dir: um(sp.dir) === 'asc' ? 'asc' : 'desc', page: Math.max(1, Number(um(sp.page)) || 1), pp }),
    gruposOpcoes(tenantId, true),
  ])
  return (
    <div className="animate-page">
      <AvisosCliente rows={lista.rows} total={lista.total} grupos={grupos} localAtual={um(sp.local)} podeEditar={accessCan(access, 'configuracoes:manage')} migrado={lista.migrado} />
    </div>
  )
}
