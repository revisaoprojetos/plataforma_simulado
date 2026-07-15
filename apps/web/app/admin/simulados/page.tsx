import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { SimuladosBoard, type SimuladoCard } from '@/components/admin/simulados-board'
import { tiposDeSimulados } from '@/lib/simulado/tipo'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'

export default async function SimuladosPage() {
  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  const { data: simulados } = await supabase
    .from('simulado_simulados')
    .select('id, titulo, status, data_inicio, data_fim, modo_aplicacao, tempo_limite_min, embed_token, created_at, regras')
    .eq('deletado', false)
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .order('created_at', { ascending: false })

  // Tipo (objetiva/discursiva/mista) derivado das questões de cada simulado.
  const tipos = await tiposDeSimulados(supabase, (simulados ?? []).map((s: any) => s.id))
  const visual = await resolverVisualSimulados(supabase, (simulados ?? []).map((s: any) => ({ id: s.id, regras: s.regras })))
  const comTipo = (simulados ?? []).map((s: any) => ({ ...s, tipo: tipos.get(s.id) ?? null, vis: visual.get(s.id) ?? null }))
    .filter((s: any) => !OCULTAR_DISCURSIVA || s.tipo !== 'discursiva')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulados</h1>
          <p className="text-muted-foreground">Gerencie provas, agendamentos e publicações.</p>
        </div>
        <Link href="/admin/simulados/novo" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          Novo simulado
        </Link>
      </div>

      <SimuladosBoard simulados={comTipo as SimuladoCard[]} appUrl={appUrl} />
    </div>
  )
}
