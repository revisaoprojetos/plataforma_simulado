import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { Search } from 'lucide-react'

const POR_PAGINA = 10

interface PageProps {
  searchParams: Promise<{ page?: string; disciplina?: string; busca?: string }>
}

export default async function AlunoQuestoesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const page = Math.max(1, Number(params.page ?? 1))
  const offset = (page - 1) * POR_PAGINA

  // Disciplinas do tenant (filtro).
  const { data: disciplinas } = await svc
    .from('simulado_disciplinas')
    .select('id, nome')
    .eq('tenant_id', sessao!.tenantId)
    .order('nome')

  // Questões publicadas (com filtros).
  let q = svc
    .from('simulado_questoes')
    .select('id, tipo, enunciado, disciplina_id, ano, comentario_professor', { count: 'exact' })
    .eq('tenant_id', sessao!.tenantId)
    .eq('status', 'publicada')
    .order('created_at', { ascending: false })

  if (params.disciplina) q = q.eq('disciplina_id', params.disciplina)
  if (params.busca) q = q.ilike('enunciado', `%${params.busca}%`)

  const { data: questoes, count } = await q.range(offset, offset + POR_PAGINA - 1)
  const totalPages = Math.ceil((count ?? 0) / POR_PAGINA)

  const ids = (questoes ?? []).map((x: any) => x.id)
  const discIds = (questoes ?? []).map((x: any) => x.disciplina_id).filter(Boolean)

  const [{ data: alts }, { data: discNomes }, { data: favs }] = await Promise.all([
    ids.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
    discIds.length ? svc.from('simulado_disciplinas').select('id, nome').in('id', discIds) : Promise.resolve({ data: [] as any[] }),
    ids.length ? svc.from('simulado_favoritos').select('questao_id').eq('estudante_id', sessao!.estudanteId).in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
  ])

  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) {
    const arr = altMap.get(a.questao_id) ?? []
    arr.push(a)
    altMap.set(a.questao_id, arr)
  }
  const discMap = new Map((discNomes ?? []).map((d: any) => [d.id, d.nome]))
  const favSet = new Set((favs ?? []).map((f: any) => f.questao_id))

  const lista: QuestaoAluno[] = (questoes ?? []).map((x: any) => ({
    id: x.id,
    tipo: x.tipo,
    enunciado: x.enunciado ?? '',
    disciplina: discMap.get(x.disciplina_id) ?? null,
    ano: x.ano ?? null,
    comentario_professor: x.comentario_professor ?? null,
    favorito: favSet.has(x.id),
    alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Banco de questões</h1>
        <p className="text-muted-foreground">{count ?? 0} questões disponíveis para praticar.</p>
      </div>

      {/* Filtros (GET form, sem JS) */}
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input name="busca" defaultValue={params.busca ?? ''} placeholder="Palavra no enunciado…"
              className="w-full rounded-md border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Matéria</label>
          <select name="disciplina" defaultValue={params.disciplina ?? ''}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring">
            <option value="">Todas</option>
            {(disciplinas ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Filtrar</button>
      </form>

      {lista.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma questão encontrada com esses filtros.
        </div>
      ) : (
        <div className="space-y-4">
          {lista.map((q, i) => <QuestaoCard key={q.id} questao={q} numero={offset + i + 1} />)}
        </div>
      )}

      <PaginationControls page={page} totalPages={totalPages} />
    </div>
  )
}
