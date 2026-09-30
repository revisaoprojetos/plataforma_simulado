import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { GruposView, type LinhaGrupoAluno, type GrupoOpcao } from './grupos-view'
import { Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

type RpcLinha = { estudante_id: string; nome: string | null; total: number; ultimo_em: string | null; grupos: any }

export default async function GruposPorAlunoPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || accessCan(access, 'relatorios:view'))) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Grupos por aluno</h1>
        <SemPermissao>Você não tem permissão para ver os relatórios.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Agregação no banco (rpc_grupos_por_aluno): 1 linha por aluno, com os grupos já ordenados do
  // mais recente pro mais antigo. Memoizado (relatório pesado; ~11k alunos). O catálogo de grupos
  // alimenta o filtro por grupo.
  let linhas: LinhaGrupoAluno[] = []
  let grupos: GrupoOpcao[] = []
  try {
    const dados = await remember<{ linhas: LinhaGrupoAluno[]; grupos: GrupoOpcao[] }>(
      chaveRelatorio(access.tenantId, 'grupos-por-aluno'), TTL_RELATORIO, async () => {
        const { data } = await svc.rpc('rpc_grupos_por_aluno', { p_tenant: tid })
        const linhas: LinhaGrupoAluno[] = ((data ?? []) as RpcLinha[]).map((r) => ({
          id: r.estudante_id,
          nome: r.nome ?? 'Estudante',
          total: r.total,
          ultimoEm: r.ultimo_em,
          grupos: Array.isArray(r.grupos) ? r.grupos : [],
        }))
        const { data: gs } = await svc.from('simulado_grupos').select('id, nome, cor')
          .eq('tenant_id', tid).eq('deletado', false).eq('arquivado', false).order('nome')
        return { linhas, grupos: (gs ?? []) as GrupoOpcao[] }
      })
    linhas = dados.linhas
    grupos = dados.grupos
  } catch { /* tabela/RPC ausente → lista vazia */ }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grupos por aluno</h1>
          <p className="text-muted-foreground">Em quais grupos cada estudante está — os mais recentes primeiro. Filtre por grupo e exporte (Excel/CSV).</p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Nenhum aluno vinculado a grupos ainda.</div>
      ) : (
        <GruposView linhas={linhas} grupos={grupos} />
      )}
    </div>
  )
}
