import { createServiceClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getCurrentTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Upload } from 'lucide-react'
import { EstudantesLista } from '@/components/admin/estudantes-lista'
import { carregarLoteEstudantes } from './actions'

export const dynamic = 'force-dynamic'

const PRIMEIRA_PAGINA = 30

export default async function EstudantesPage() {
  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  // 1) Primeiros estudantes (rápido) + total — o resto carrega em segundo plano no cliente.
  // 2) Mapa de agregados de sessão (feitos/média) por estudante — poucas linhas (só sessões
  //    finalizadas, sem teste), calculado UMA vez e aplicado a cada lote que chega.
  // 3) KPIs por count (baratos) — não dependem de baixar os 9k+ estudantes.
  const [{ rows: inicial, total }, sess, { count: totalPass }, { count: totalFeitos }] = await Promise.all([
    carregarLoteEstudantes(0, PRIMEIRA_PAGINA),
    fetchAll<any>(() => supabase
      .from('simulado_sessoes_prova')
      .select('estudante_id, nota')
      .eq('tenant_id', tid)
      .eq('status', 'finalizada')
      .eq('is_teste', false)
      .eq('deletado', false)
      .order('estudante_id', { ascending: true })),
    supabase.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('deletado', false).eq('tenant_id', tid).eq('classificacao', 'passaporte'),
    supabase.from('simulado_sessoes_prova').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false),
  ])

  const soma = new Map<string, number>(); const cont = new Map<string, number>(); const feitos = new Map<string, number>()
  for (const s of sess) {
    const id = (s as any).estudante_id
    feitos.set(id, (feitos.get(id) ?? 0) + 1)
    if ((s as any).nota != null) { soma.set(id, (soma.get(id) ?? 0) + Number((s as any).nota)); cont.set(id, (cont.get(id) ?? 0) + 1) }
  }
  const agregados: Record<string, { feitos: number; media: number | null }> = {}
  for (const [id, f] of feitos) agregados[id] = { feitos: f, media: cont.get(id) ? Math.round(((soma.get(id) ?? 0) / (cont.get(id) ?? 1)) * 10) / 10 : null }

  // E-mails de ADMIN (staff da plataforma) — NÃO contam como estudante e ganham o plano "Admin" na lista.
  const { data: acessos } = await supabase.from('simulado_tenant_acessos').select('user_id').eq('tenant_id', tid)
  const staffIds = [...new Set((acessos ?? []).map((a: any) => a.user_id).filter(Boolean))] as string[]
  const adminSet = new Set<string>()
  await Promise.all(staffIds.map(async (uid) => {
    try { const { data } = await supabase.auth.admin.getUserById(uid); const e = data?.user?.email?.toLowerCase(); if (e) adminSet.add(e) } catch { /* auth indisponível */ }
  }))
  const adminEmails = [...adminSet]
  // Desconta da contagem os estudantes cujo e-mail é de admin.
  let adminEstudantes = 0
  if (adminEmails.length) {
    const { count } = await supabase.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('deletado', false).eq('tenant_id', tid).in('email', adminEmails)
    adminEstudantes = count ?? 0
  }
  const totalReal = Math.max(0, total - adminEstudantes)

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

      <EstudantesLista
        inicial={inicial}
        agregados={agregados}
        total={total}
        adminEmails={adminEmails}
        kpis={{ total: totalReal, passaporte: totalPass ?? 0, feitos: totalFeitos ?? 0 }}
      />
    </div>
  )
}
