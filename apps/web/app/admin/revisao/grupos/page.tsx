import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { KpisCs } from '@/components/admin/revisao/cs-ui'
import { cursosOpcoes, gruposKpis, gruposLista, gruposOpcoes, gruposPastas, NADA } from '@/lib/admin-revisao/cs'
import { GruposCliente } from './grupos-cliente'

export const dynamic = 'force-dynamic'

type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const PP = [5, 10, 25, 50]

// CS › Grupos de acesso (#grupos do protótipo). Só LÊ: KPIs/pastas em cache curto, lista paginada no banco.
export default async function GruposRevisaoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'grupos:view')) return <SemPermissao>Você não tem permissão para ver os grupos de acesso.</SemPermissao>
  const tenantId = access.tenantId ?? NADA
  const sp = await searchParams
  const pasta = um(sp.pasta) || 'todos'
  const pp = PP.includes(Number(um(sp.pp))) ? Number(um(sp.pp)) : 10

  const [kpis, pastas, lista, cursos, todos] = await Promise.all([
    gruposKpis(tenantId),
    gruposPastas(tenantId),
    gruposLista(tenantId, { pasta, q: um(sp.q), sort: um(sp.sort), dir: um(sp.dir) === 'desc' ? 'desc' : 'asc', page: Math.max(1, Number(um(sp.page)) || 1), pp }),
    cursosOpcoes(tenantId),
    gruposOpcoes(tenantId, true),
  ])

  return (
    <div className="animate-page">
      <GruposCliente
        rows={lista.rows} total={lista.total} pastas={pastas} pastaAtual={pasta} cursos={cursos} todosGrupos={todos}
        podeEditar={accessCan(access, 'grupos:view')}
        kpis={<KpisCs itens={[
          { valor: kpis.grupos, rotulo: 'grupos' },
          { valor: kpis.vinculos, rotulo: 'vínculos de alunos' },
          { valor: kpis.vencendo, rotulo: 'grupos com acessos vencendo em 30 dias', alerta: kpis.vencendo > 0 },
          { valor: kpis.semCurso, rotulo: 'grupos sem curso ligado', alerta: kpis.semCurso > 0 },
        ]} />}
      />
    </div>
  )
}
