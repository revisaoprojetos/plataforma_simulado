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

  // Vínculos do banco (ids). Tolerante: a tabela pode não existir → SqlPendente.
  let vincIds: string[]
  try {
    const pe = await fetchAll<{ estudante_id: string }>(() => svc
      .from('simulado_pasta_estudantes').select('estudante_id')
      .eq('pasta_id', bancoId).eq('tenant_id', tid).order('estudante_id', { ascending: true }))
    vincIds = pe.map((r) => r.estudante_id)
  } catch {
    return <SqlPendente />
  }
  // SÓ os campos de EXIBIÇÃO dos vinculados (por id, chunk 400). Último acesso e grupos NÃO são
  // buscados aqui (custavam ~7s p/ 4.9k) — o client os carrega SOB DEMANDA, só da PÁGINA visível
  // (detalhesVinculadosBanco). Sem embed: as FKs do esqueleto simulado_* estão quebradas → sem JOIN.
  const vincRecs: any[] = vincIds.length
    ? await fetchAllByIn<any>(vincIds, (ids) => svc
        .from('simulado_estudantes').select('id, nome, email, telefone, cpf, classificacao').in('id', ids), { chunk: 300 })
    : []
  const vinculados = vincRecs.sort((a: any, b: any) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))

  return <BancoEstudantesClient bancoId={bancoId} vinculados={vinculados as any} cor={cor} />
}
