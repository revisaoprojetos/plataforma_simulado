import { createAdminClient } from '@/lib/supabase/server'
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

export async function BancoEstudantes({ bancoId }: { bancoId: string }) {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: pe, error } = await svc
    .from('simulado_pasta_estudantes')
    .select('estudante_id')
    .eq('pasta_id', bancoId)
    .eq('tenant_id', tenantId ?? '')
  if (error) return <SqlPendente />

  const vincIds = (pe ?? []).map((r: any) => r.estudante_id)
  const vincSet = new Set(vincIds)

  // Todos os estudantes da plataforma (tenant) — para o pop-up de adicionar.
  const { data: todos } = await svc
    .from('simulado_estudantes')
    .select('id, nome, email, telefone, cpf, classificacao')
    .eq('tenant_id', tenantId ?? '')
    .order('nome')
    .limit(2000)
  const lista = todos ?? []
  const alunos = lista.map((a: any) => ({ ...a, jaVinculado: vincSet.has(a.id) }))

  // Último acesso de cada vinculado = sessão mais recente.
  const ultimoPorAluno = new Map<string, string>()
  if (vincIds.length) {
    const { data: sess } = await svc
      .from('simulado_sessoes_prova')
      .select('estudante_id, iniciado_em')
      .in('estudante_id', vincIds)
      .order('iniciado_em', { ascending: false })
    for (const s of sess ?? []) if (!ultimoPorAluno.has((s as any).estudante_id)) ultimoPorAluno.set((s as any).estudante_id, (s as any).iniciado_em)
  }
  const vinculados = lista.filter((a: any) => vincSet.has(a.id)).map((a: any) => ({ ...a, ultimo_acesso: ultimoPorAluno.get(a.id) ?? null }))

  return <BancoEstudantesClient bancoId={bancoId} vinculados={vinculados as any} alunos={alunos as any} />
}
