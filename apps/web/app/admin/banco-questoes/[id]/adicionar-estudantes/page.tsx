import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { buttonVariants } from '@/components/ui/button'
import { ImportarEstudanteForm } from '@/components/admin/importar-estudante-form'
import { SelecionarEstudantesClient } from '@/components/admin/selecionar-estudantes-client'
import { buscarEstudantesLote } from '@/app/admin/banco-questoes/estudantes-actions'
import { ArrowLeft } from 'lucide-react'

export default async function AdicionarEstudantesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: banco } = await svc.from('simulado_pastas').select('id, nome').eq('id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  if (!banco) notFound()

  // EGRESS: antes trazia TODOS os ~19k estudantes ao cliente p/ filtrar. Agora só a 1ª página; o
  // cliente busca/pagina no banco via `buscarEstudantesLote` (server action).
  const primeira = await buscarEstudantesLote(id, { offset: 0, limit: 20 })
  const alunos = primeira.rows ?? []
  const total = primeira.total ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/banco-questoes/${id}?tab=estudantes`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Adicionar estudantes</h1>
          <p className="text-muted-foreground">Importe um novo aluno ou selecione da plataforma para o banco <strong>{banco.nome}</strong></p>
        </div>
      </div>

      <ImportarEstudanteForm bancoId={id} />
      <SelecionarEstudantesClient bancoId={id} alunos={alunos} total={total} />
    </div>
  )
}
