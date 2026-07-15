import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { buttonVariants } from '@/components/ui/button'
import { BancoQuestoesSearch } from '@/components/admin/banco-questoes-search'
import { AdicionarQuestoesClient } from '@/components/admin/adicionar-questoes-client'
import { ArrowLeft } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; banca?: string; disciplina?: string; dificuldade?: string }>
}

export default async function AdicionarPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: banco } = await svc
    .from('simulado_pastas')
    .select('id, nome')
    .eq('id', id)
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle()
  if (!banco) notFound()

  const [{ data: bancas }, { data: disciplinas }, { data: vinculos }] = await Promise.all([
    svc.from('simulado_bancas').select('id, nome').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome'),
    svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome'),
    svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000'),
  ])
  const jaNoBanco = (vinculos ?? []).map((v: any) => v.questao_id)

  let query = svc
    .from('simulado_questoes')
    .select('id, enunciado, tipo, nivel_dificuldade, ano, bancas:simulado_bancas(nome), disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)')
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .order('created_at', { ascending: false })
    .limit(50)

  if (sp.q) query = query.ilike('enunciado', `%${sp.q}%`)
  if (sp.banca) query = query.eq('banca_id', sp.banca)
  if (sp.disciplina) query = query.eq('disciplina_id', sp.disciplina)
  if (sp.dificuldade) query = query.eq('nivel_dificuldade', sp.dificuldade)

  const { data: questoes } = await query

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/banco-questoes/${id}`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Adicionar questões</h1>
          <p className="text-muted-foreground">Selecione questões para o banco <strong>{banco.nome}</strong></p>
        </div>
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-4 space-y-4 rounded-lg border p-4">
            <h3 className="font-medium">Filtros</h3>
            <BancoQuestoesSearch bancas={bancas ?? []} disciplinas={disciplinas ?? []} />
          </div>
        </aside>

        <div className="flex-1">
          <AdicionarQuestoesClient bancoId={id} questoes={(questoes ?? []) as any} jaNoBanco={jaNoBanco} />
        </div>
      </div>
    </div>
  )
}
