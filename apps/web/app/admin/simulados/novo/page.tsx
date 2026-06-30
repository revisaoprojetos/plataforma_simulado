import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { SimuladoWizard } from '@/components/admin/simulado-wizard'
import { createSimuladoAction } from '../actions'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function NovoSimuladoPage() {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const [{ data: bancos }, { data: questoesRaw }, { data: vinculos }] = await Promise.all([
    svc.from('simulado_pastas').select('id, nome').eq('deletado', false).eq('tenant_id', tenantId ?? '').order('nome'),
    svc.from('simulado_questoes')
      .select('id, enunciado, tipo, nivel_dificuldade, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)')
      .eq('tenant_id', tenantId ?? '')
      .order('created_at', { ascending: false })
      .limit(1000),
    svc.from('simulado_questao_pasta').select('questao_id, pasta_id').eq('tenant_id', tenantId ?? ''),
  ])

  // Mapa questão -> bancos a que pertence.
  const bancosPorQuestao = new Map<string, string[]>()
  for (const v of vinculos ?? []) {
    const arr = bancosPorQuestao.get((v as any).questao_id) ?? []
    arr.push((v as any).pasta_id)
    bancosPorQuestao.set((v as any).questao_id, arr)
  }

  const questoes = (questoesRaw ?? []).map((q: any) => ({
    id: q.id,
    enunciado: q.enunciado ?? '',
    tipo: q.tipo,
    nivel_dificuldade: q.nivel_dificuldade,
    disciplina: q.disciplinas?.nome ?? null,
    banca: q.bancas?.nome ?? null,
    bancoIds: bancosPorQuestao.get(q.id) ?? [],
  }))

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/simulados" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Voltar para Simulados
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Novo Simulado</h1>
      </div>

      <SimuladoWizard bancos={bancos ?? []} questoes={questoes} onSubmit={createSimuladoAction} />
    </div>
  )
}
