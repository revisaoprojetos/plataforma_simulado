import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { resumoAcessoLote } from '@/lib/acesso/aluno-efetivo'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { AcessoClient, type AcessoLinha } from './acesso-client'

export const dynamic = 'force-dynamic'

const PER_PAGE = [5, 10, 25, 50]
const SEM = '00000000-0000-0000-0000-000000000000'

export default async function ConteudosAcessoPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('grupos:view') || access.permissions.includes('matriculas:view')
  if (!pode) return <SemAcessoArea />
  const podeReconciliar = access.isAdmin || access.permissions.includes('grupos:view')

  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const perPage = PER_PAGE.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const q = (sp.q ?? '').trim()

  const svc = createAdminClient()
  const tenantId = access.tenantId ?? SEM

  let query = svc.from('simulado_estudantes').select('id, nome, email, classificacao', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('deletado', false)
    .order('nome', { ascending: true }).range((page - 1) * perPage, page * perPage - 1)
  if (q) { const safe = q.replace(/[,()%*]/g, ' ').trim(); if (safe) query = query.or(`nome.ilike.%${safe}%,email.ilike.%${safe}%`) }
  const { data, count } = await query
  const estRows = (data ?? []) as any[]

  // Nº de produtos com acesso ATIVO por aluno (só a página — barato, chunk 80).
  const resumo = await resumoAcessoLote(tenantId, estRows.map((e) => e.id))

  const rows: AcessoLinha[] = estRows.map((e) => ({
    id: e.id, nome: e.nome ?? 'Estudante', email: e.email ?? null, classificacao: e.classificacao ?? null,
    produtosAtivos: resumo[e.id] ?? 0,
  }))

  return <AcessoClient rows={rows} total={count ?? 0} podeReconciliar={podeReconciliar} />
}
