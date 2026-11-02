import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { listarTaxonomia } from '@/app/admin/questoes/taxonomia-actions'
import { listarDisciplinasClassificacao } from '@/app/admin/questoes/disciplinas-actions'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { ClassificacaoClient, type AbaTax, type ItemCadastro } from './classificacao-client'

export const dynamic = 'force-dynamic'

const ABAS: AbaTax[] = ['disciplinas', 'assuntos', 'bancas', 'orgaos']
const ABA_TO_TIPO = { disciplinas: 'disciplina', assuntos: 'assunto', bancas: 'banca', orgaos: 'orgao' } as const
const PP = [5, 10, 25, 50]

// CLASSIFICAÇÃO (Estúdio): curadoria da taxonomia real (disciplinas/assuntos/bancas/órgãos).
// A taxonomia é pequena → a lista completa vem cacheada (listarTaxonomia) e a página filtra/ordena/
// pagina em memória para alimentar a <DataTable> (server-driven: lê page/pp/sort/dir/q da URL).
export default async function ClassificacaoPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  const podeVer = access.isAdmin
    || access.permissions.includes('classificacao:view')
    || access.permissions.includes('classificacao:manage')
    || access.permissions.includes('questoes:view')
  if (!podeVer) return <SemAcessoArea />

  const sp = await searchParams
  const aba: AbaTax = ABAS.includes(sp.aba as AbaTax) ? (sp.aba as AbaTax) : 'disciplinas'

  const [res, dres] = await Promise.all([
    listarTaxonomia(ABA_TO_TIPO[aba]),
    listarDisciplinasClassificacao(),
  ])

  const itensAll: ItemCadastro[] = res.ok ? (res.itens ?? []) : []
  const erro = res.ok ? null : (res.error ?? 'Erro ao carregar a classificação.')

  const discItens = dres.ok ? (dres.itens ?? []) : []
  const disciplinas = discItens.map((d) => ({ id: d.id, nome: d.nome }))
  const corPorId: Record<string, string | null> = Object.fromEntries(discItens.map((d) => [d.id, d.cor]))

  // paiPorId (assunto → disciplina): sem loader dedicado; consulta direta bounded por tenant.
  const paiPorId: Record<string, string> = {}
  if (access.tenantId) {
    const svc = createAdminClient()
    const { data: assuntos } = await svc.from('simulado_assuntos').select('id, disciplina_id').eq('tenant_id', access.tenantId)
    for (const a of (assuntos ?? []) as any[]) if (a.disciplina_id) paiPorId[a.id] = a.disciplina_id
  }

  // Filtro + ordenação + fatia da página (taxonomia pequena; total = contagem após o filtro q).
  const q = (sp.q ?? '').trim().toLowerCase()
  let itens = q ? itensAll.filter((i) => i.nome.toLowerCase().includes(q)) : itensAll
  const sort = sp.sort ?? 'nome'
  const dir = sp.dir === 'desc' ? 'desc' : 'asc'
  itens = [...itens].sort((a, b) => {
    const c = sort === 'nome'
      ? a.nome.localeCompare(b.nome, 'pt-BR')
      : ((a[sort as 'questoes' | 'extra'] ?? 0) - (b[sort as 'questoes' | 'extra'] ?? 0))
    return dir === 'asc' ? c : -c
  })
  const total = itens.length
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const pp = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const rows = itens.slice((page - 1) * pp, page * pp)

  return (
    <ClassificacaoClient
      aba={aba}
      rows={rows}
      total={total}
      erro={erro}
      disciplinas={disciplinas}
      corPorId={corPorId}
      paiPorId={paiPorId}
    />
  )
}
