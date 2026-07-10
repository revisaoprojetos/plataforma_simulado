import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Upload } from 'lucide-react'
import { EstudantesLista, type EstudanteRow } from '@/components/admin/estudantes-lista'

export const dynamic = 'force-dynamic'

export default async function EstudantesPage() {
  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  const { data: estudantes } = await supabase
    .from('simulado_estudantes')
    .select('id, nome, email, cpf, telefone, classificacao, matricula_externa, created_at')
    .eq('deletado', false)
    .eq('tenant_id', tenantId ?? '')
    .order('created_at', { ascending: false })
    .limit(500)

  // Simulados feitos + média por estudante (sessões finalizadas, exceto testes).
  const ids = (estudantes ?? []).map((e: any) => e.id)
  const feitos = new Map<string, number>()
  const somaNota = new Map<string, number>()
  const contNota = new Map<string, number>()
  if (ids.length) {
    const { data: sess } = await supabase
      .from('simulado_sessoes_prova')
      .select('estudante_id, nota, status, is_teste')
      .in('estudante_id', ids)
      .eq('status', 'finalizada')
      .eq('is_teste', false)
      .eq('deletado', false)
    for (const s of sess ?? []) {
      const id = (s as any).estudante_id
      feitos.set(id, (feitos.get(id) ?? 0) + 1)
      if ((s as any).nota != null) {
        somaNota.set(id, (somaNota.get(id) ?? 0) + Number((s as any).nota))
        contNota.set(id, (contNota.get(id) ?? 0) + 1)
      }
    }
  }

  const rows: EstudanteRow[] = (estudantes ?? []).map((e: any) => ({
    id: e.id, nome: e.nome, email: e.email ?? null, cpf: e.cpf ?? null, telefone: e.telefone ?? null,
    classificacao: e.classificacao ?? null, created_at: e.created_at ?? null,
    feitos: feitos.get(e.id) ?? 0,
    media: contNota.get(e.id) ? Math.round(((somaNota.get(e.id) ?? 0) / (contNota.get(e.id) ?? 1)) * 10) / 10 : null,
  }))

  return (
    <div className="animate-page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estudantes</h1>
          <p className="text-muted-foreground">Gerencie os alunos e acesse o dashboard pessoal de cada um.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/estudantes/novo?tab=csv" className={buttonVariants({ variant: 'outline' })}>
            <Upload className="mr-2 h-4 w-4" /> Importar
          </Link>
          <Link href="/admin/estudantes/novo" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" /> Novo Estudante
          </Link>
        </div>
      </div>

      <EstudantesLista estudantes={rows} />
    </div>
  )
}
