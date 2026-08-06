import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getCurrentTenantId } from '@/lib/tenant'
import { BancoEstudantesClient } from '@/components/admin/banco-estudantes-client'
import { AlertTriangle } from 'lucide-react'

function SqlPendente() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      Recurso indisponível: rode o SQL pendente (tabela <code>simulado_pasta_estudantes</code>) no Supabase e recarregue.
    </div>
  )
}

export async function BancoEstudantes({ bancoId, cor = '#6d28d9' }: { bancoId: string; cor?: string }) {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  // CAMINHO RÁPIDO: função SQL faz o JOIN (pasta_estudantes × estudantes) e o PostgREST pagina o
  // resultado (~5 req vs ~34 por id). Só os campos de EXIBIÇÃO — último acesso e grupos são carregados
  // SOB DEMANDA por página no client (detalhesVinculadosBanco). Aplique scripts/sql/banco-vinculados-rpc.sql.
  let vinculados: any[] | null = null
  try {
    vinculados = await fetchAll<any>(() => svc.rpc('simulado_banco_vinculados', { p_banco: bancoId, p_tenant: tid }) as any)
  } catch {
    vinculados = null // função ausente (SQL não aplicado) → fallback abaixo
  }

  // FALLBACK (sem a função): ids dos vinculados + registros por id (chunk 300). Tolerante à tabela ausente.
  if (vinculados === null) {
    let vincIds: string[]
    try {
      const pe = await fetchAll<{ estudante_id: string }>(() => svc
        .from('simulado_pasta_estudantes').select('estudante_id')
        .eq('pasta_id', bancoId).eq('tenant_id', tid).order('estudante_id', { ascending: true }))
      vincIds = pe.map((r) => r.estudante_id)
    } catch {
      return <SqlPendente />
    }
    const vincRecs: any[] = vincIds.length
      ? await fetchAllByIn<any>(vincIds, (ids) => svc
          .from('simulado_estudantes').select('id, nome, email, telefone, cpf, classificacao').in('id', ids), { chunk: 300 })
      : []
    vinculados = vincRecs.sort((a: any, b: any) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
  }

  return <BancoEstudantesClient bancoId={bancoId} vinculados={vinculados as any} cor={cor} />
}
