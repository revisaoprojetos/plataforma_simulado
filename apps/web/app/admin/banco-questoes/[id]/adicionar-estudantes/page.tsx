import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getCurrentTenantId } from '@/lib/tenant'
import { buttonVariants } from '@/components/ui/button'
import { ImportarEstudanteForm } from '@/components/admin/importar-estudante-form'
import { SelecionarEstudantesClient } from '@/components/admin/selecionar-estudantes-client'
import { ArrowLeft } from 'lucide-react'

export default async function AdicionarEstudantesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: banco } = await svc.from('simulado_pastas').select('id, nome').eq('id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  if (!banco) notFound()

  // Todos os estudantes da plataforma (tenant) + quem já está vinculado.
  // fetchAll: `.limit(2000)` NÃO burla o teto de ~1000 do PostgREST.
  const [todos, vinc] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_estudantes').select('id, nome, email, telefone, classificacao').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome', { ascending: true }).order('id', { ascending: true })),
    fetchAll<{ estudante_id: string }>(() => svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('estudante_id', { ascending: true })),
  ])
  const vinculados = new Set(vinc.map((v) => v.estudante_id))
  const alunos = todos.map((a: any) => ({ ...a, jaVinculado: vinculados.has(a.id) }))

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
      <SelecionarEstudantesClient bancoId={id} alunos={alunos} />
    </div>
  )
}
