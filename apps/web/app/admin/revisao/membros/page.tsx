import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { membrosContagens, membrosLista, gruposOpcoes, NADA } from '@/lib/admin-revisao/cs'
import { MEMBROS_FILTROS, type MembrosFiltro } from '@/lib/admin-revisao/cs-tipos'
import { MembrosApp } from './membros-app'

export const dynamic = 'force-dynamic'

type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const PP = [5, 10, 14, 25, 50]

// CS › Membros (#alunos). A página só entrega o 1º quadro (lista + contagens); depois tudo é client-driven por rotas de
// API (/api/admin/revisao/membros e /[id]) — clique, abas, busca, paginação e ficha sem navegação completa.
export default async function MembrosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'estudantes:view')) return <SemPermissao>Você não tem permissão para ver os membros.</SemPermissao>
  const tenantId = access.tenantId ?? NADA
  const sp = await searchParams
  const f = (MEMBROS_FILTROS as string[]).includes(um(sp.f)) ? (um(sp.f) as MembrosFiltro) : 'todos'
  const pp = PP.includes(Number(um(sp.pp))) ? Number(um(sp.pp)) : 14
  const page = Math.max(1, Number(um(sp.page)) || 1)
  const q = um(sp.q).trim()
  const sort = um(sp.sort), dir = um(sp.dir) === 'asc' ? 'asc' : 'desc'
  const [contagens, lista, opcoes] = await Promise.all([
    membrosContagens(tenantId),
    membrosLista(tenantId, { f, q, sort, dir, page, pp }),
    gruposOpcoes(tenantId),
  ])
  return (
    <div className="animate-page">
      <MembrosApp
        inicial={{ rows: lista.rows, total: lista.total, migrado: lista.migrado, contagens }}
        estadoInicial={{ f, q, page, pp, sort, dir }} selInicial={um(sp.sel) || null} grupos={opcoes}
        podeCriar={accessCan(access, 'estudantes:create')} podeEditar={accessCan(access, 'estudantes:update')} podeRemover={accessCan(access, 'estudantes:delete')}
      />
    </div>
  )
}
