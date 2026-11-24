import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { GruposView, type LinhaGrupoAluno, type GrupoOpcao } from './grupos-view'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { GRUPOS_POR_PAGINA, listarGruposPorAluno, normalizarFiltroGrupos } from '@/lib/relatorios/grupos-aluno'

export const dynamic = 'force-dynamic'

type SP = { q?: string; grupo?: string; ord?: string; dir?: string; pagina?: string }

export default async function GruposPorAlunoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || accessCan(access, 'relatorios:view'))) {
    return (
      <div className="space-y-4">
        <CabecalhoArea titulo="Grupos por aluno" />
        <SemPermissao>Você não tem permissão para ver os relatórios.</SemPermissao>
      </div>
    )
  }

  const sp = await searchParams
  const svc = createAdminClient()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'
  const filtro = normalizarFiltroGrupos(sp)
  const pagina = Math.max(1, Math.floor(Number(sp.pagina) || 1))

  // Paginação/busca/filtro/ordenação NO SERVIDOR (antes: ~11 mil linhas com jsonb de grupos no payload RSC).
  // A exportação completa sai por /api/admin/relatorios/grupos (não passa pelo payload da página).
  let linhas: LinhaGrupoAluno[] = []
  let total = 0
  let grupos: GrupoOpcao[] = []
  let temAlgum = true
  try {
    const [pag, gs] = await Promise.all([
      listarGruposPorAluno(tid, filtro, GRUPOS_POR_PAGINA, (pagina - 1) * GRUPOS_POR_PAGINA),
      remember<GrupoOpcao[]>(chaveRelatorio(access.tenantId, 'grupos-por-aluno', 'opcoes'), TTL_RELATORIO, async () => {
        const { data } = await svc.from('simulado_grupos').select('id, nome, cor')
          .eq('tenant_id', tid).eq('deletado', false).eq('arquivado', false).order('nome')
        return (data ?? []) as GrupoOpcao[]
      }),
    ])
    linhas = pag.linhas
    total = pag.total
    grupos = gs
    // Sem filtro e sem linhas = ninguém vinculado ainda (estado vazio original).
    temAlgum = !(total === 0 && !filtro.q.trim() && !filtro.grupo)
  } catch { /* tabela/RPC ausente → lista vazia */ temAlgum = false }

  return (
    <div className="space-y-6">
      <CabecalhoArea titulo="Grupos por aluno" descricao="Em quais grupos cada estudante está — os mais recentes primeiro. Filtre por grupo e exporte (Excel/CSV)." />

      {!temAlgum ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Nenhum aluno vinculado a grupos ainda.</div>
      ) : (
        <GruposView linhas={linhas} total={total} pagina={pagina} porPagina={GRUPOS_POR_PAGINA} filtro={filtro} grupos={grupos} />
      )}
    </div>
  )
}
