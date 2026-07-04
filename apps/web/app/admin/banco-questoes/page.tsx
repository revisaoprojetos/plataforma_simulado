import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { NovoBancoForm } from '@/components/admin/novo-banco-form'
import { BancosGrid } from '@/components/admin/bancos-grid'

// Sempre renderizar fresco — a lista precisa refletir criações/exclusões na hora.
export const dynamic = 'force-dynamic'

export default async function BancoQuestoesPage() {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const [{ data: bancos }, { data: vinculos }] = await Promise.all([
    svc.from('simulado_pastas').select('id, nome').eq('deletado', false).eq('tenant_id', tenantId ?? '').order('nome'),
    svc.from('simulado_questao_pasta').select('pasta_id').eq('tenant_id', tenantId ?? ''),
  ])

  // Contagem de questões por banco.
  const contagem = new Map<string, number>()
  for (const v of vinculos ?? []) contagem.set((v as any).pasta_id, (contagem.get((v as any).pasta_id) ?? 0) + 1)

  const lista = bancos ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banco de Questões</h1>
          <p className="text-muted-foreground">
            Crie bancos para organizar suas questões. Uma questão pode estar em vários bancos.
          </p>
        </div>
        <NovoBancoForm />
      </div>

      <BancosGrid bancos={lista.map((b: any) => ({ id: b.id, nome: b.nome, total: contagem.get(b.id) ?? 0 }))} />
    </div>
  )
}
