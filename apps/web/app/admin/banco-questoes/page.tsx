import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { NovoBancoForm } from '@/components/admin/novo-banco-form'
import { BancosGrid } from '@/components/admin/bancos-grid'

// Sempre renderizar fresco — a lista precisa refletir criações/exclusões na hora.
export const dynamic = 'force-dynamic'

export default async function BancoQuestoesPage() {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  // Bancos com personalização (cor/ícone) — tolerante caso a migration ainda não tenha rodado.
  let bancos: any[] | null = null
  {
    const r = await svc.from('simulado_pastas').select('id, nome, cor, icone, capa_url, tipo').eq('deletado', false).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome')
    if (r.error && /cor|icone|capa_url|tipo|column/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_pastas').select('id, nome').eq('deletado', false).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome')
      bancos = r2.data
    } else bancos = r.data
  }
  const { data: vinculos } = await svc.from('simulado_questao_pasta').select('pasta_id').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')

  // Contagem de questões por banco.
  const contagem = new Map<string, number>()
  for (const v of vinculos ?? []) contagem.set((v as any).pasta_id, (contagem.get((v as any).pasta_id) ?? 0) + 1)

  const lista = bancos ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banco de Simulado</h1>
          <p className="text-muted-foreground">
            Monte e organize seus simulados: disciplinas/conteúdo, questões, estudantes e cadernos. Depois é só selecionar o banco pronto na Aplicação de Simulado.
          </p>
        </div>
        <NovoBancoForm />
      </div>

      <BancosGrid bancos={lista.map((b: any) => ({ id: b.id, nome: b.nome, total: contagem.get(b.id) ?? 0, cor: b.cor ?? null, icone: b.icone ?? null, capa: b.capa_url ?? null, tipo: b.tipo ?? null }))} />
    </div>
  )
}
