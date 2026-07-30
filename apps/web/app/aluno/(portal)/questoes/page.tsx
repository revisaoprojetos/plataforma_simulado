import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { Search, Target, CheckCircle2, Percent } from 'lucide-react'

const POR_PAGINA = 10

interface PageProps {
  searchParams: Promise<{ page?: string; disciplina?: string; banca?: string; ano?: string; dificuldade?: string; busca?: string }>
}

const DIFICULDADES = [
  { valor: 'facil', rotulo: 'Fácil' },
  { valor: 'medio', rotulo: 'Médio' },
  { valor: 'dificil', rotulo: 'Difícil' },
]

export default async function AlunoQuestoesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const page = Math.max(1, Number(params.page ?? 1))
  const offset = (page - 1) * POR_PAGINA
  const tid = sessao!.tenantId

  // Taxonomia para os filtros (estilo banco de questões: matéria, banca, dificuldade, ano).
  const [{ data: disciplinas }, { data: bancas }, praticaTotal, praticaAcertos] = await Promise.all([
    svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_bancas').select('id, nome').eq('tenant_id', tid).order('nome'),
    // Resumo de prática do aluno (contagens — sem trazer linhas). Tolerante se a tabela não existir.
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', sessao!.estudanteId).then((r) => r.count ?? 0, () => 0),
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', sessao!.estudanteId).eq('correta', true).then((r) => r.count ?? 0, () => 0),
  ])
  const pct = praticaTotal > 0 ? Math.round((praticaAcertos / praticaTotal) * 100) : 0

  // Questões publicadas (com filtros).
  let q = svc
    .from('simulado_questoes')
    .select('id, tipo, enunciado, disciplina_id, banca_id, ano, nivel_dificuldade, comentario_professor', { count: 'exact' })
    .eq('tenant_id', tid)
    .eq('status', 'publicada')
    .order('created_at', { ascending: false })

  if (params.disciplina) q = q.eq('disciplina_id', params.disciplina)
  if (params.banca) q = q.eq('banca_id', params.banca)
  if (params.ano) q = q.eq('ano', Number(params.ano))
  if (params.dificuldade) q = q.eq('nivel_dificuldade', params.dificuldade)
  if (params.busca) q = q.ilike('enunciado', `%${params.busca}%`)

  const { data: questoes, count } = await q.range(offset, offset + POR_PAGINA - 1)
  const totalPages = Math.ceil((count ?? 0) / POR_PAGINA)

  const ids = (questoes ?? []).map((x: any) => x.id)
  const discIds = (questoes ?? []).map((x: any) => x.disciplina_id).filter(Boolean)
  const bancaIds = (questoes ?? []).map((x: any) => x.banca_id).filter(Boolean)

  const [{ data: alts }, { data: discNomes }, { data: bancaNomes }, { data: favs }] = await Promise.all([
    ids.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
    discIds.length ? svc.from('simulado_disciplinas').select('id, nome').in('id', discIds) : Promise.resolve({ data: [] as any[] }),
    bancaIds.length ? svc.from('simulado_bancas').select('id, nome').in('id', bancaIds) : Promise.resolve({ data: [] as any[] }),
    ids.length ? svc.from('simulado_favoritos').select('questao_id').eq('estudante_id', sessao!.estudanteId).in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
  ])

  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }
  const discMap = new Map((discNomes ?? []).map((d: any) => [d.id, d.nome]))
  const bancaMap = new Map((bancaNomes ?? []).map((b: any) => [b.id, b.nome]))
  const favSet = new Set((favs ?? []).map((f: any) => f.questao_id))

  const lista: QuestaoAluno[] = (questoes ?? []).map((x: any) => ({
    id: x.id,
    tipo: x.tipo,
    enunciado: x.enunciado ?? '',
    disciplina: discMap.get(x.disciplina_id) ?? null,
    banca: bancaMap.get(x.banca_id) ?? null,
    ano: x.ano ?? null,
    comentario_professor: x.comentario_professor ?? null,
    favorito: favSet.has(x.id),
    alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
  }))

  const filtroCls = 'w-full rounded-md border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Banco de questões</h1>
        <p className="text-muted-foreground">{count ?? 0} questões para praticar — responda quantas vezes quiser.</p>
      </div>

      {/* Resumo de prática do aluno */}
      {praticaTotal > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi icon={<Target className="h-5 w-5" />} tom="bg-primary/10 text-primary" rotulo="Resolvidas" valor={praticaTotal.toLocaleString('pt-BR')} />
          <Kpi icon={<CheckCircle2 className="h-5 w-5" />} tom="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" rotulo="Acertos" valor={praticaAcertos.toLocaleString('pt-BR')} />
          <Kpi icon={<Percent className="h-5 w-5" />} tom="bg-amber-500/15 text-amber-600 dark:text-amber-400" rotulo="Aproveitamento" valor={`${pct}%`} />
        </div>
      )}

      {/* Filtros (GET form, sem JS) */}
      <form method="get" className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input name="busca" defaultValue={params.busca ?? ''} placeholder="Palavra no enunciado…" className={`${filtroCls} pl-8`} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Matéria</label>
          <select name="disciplina" defaultValue={params.disciplina ?? ''} className={filtroCls}>
            <option value="">Todas</option>
            {(disciplinas ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Banca</label>
          <select name="banca" defaultValue={params.banca ?? ''} className={filtroCls}>
            <option value="">Todas</option>
            {(bancas ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Dificuldade</label>
          <select name="dificuldade" defaultValue={params.dificuldade ?? ''} className={filtroCls}>
            <option value="">Todas</option>
            {DIFICULDADES.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Ano</label>
          <input name="ano" type="number" inputMode="numeric" min={1990} max={2100} defaultValue={params.ano ?? ''} placeholder="Ex.: 2024" className={filtroCls} />
        </div>
        <div className="flex items-end gap-2 lg:col-span-5">
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Filtrar</button>
          <a href="/aluno/questoes" className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">Limpar</a>
        </div>
      </form>

      {lista.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma questão encontrada com esses filtros.
        </div>
      ) : (
        <div className="space-y-4">
          {lista.map((qq, i) => <QuestaoCard key={qq.id} questao={qq} numero={offset + i + 1} />)}
        </div>
      )}

      <PaginationControls page={page} totalPages={totalPages} />
    </div>
  )
}

function Kpi({ icon, tom, rotulo, valor }: { icon: React.ReactNode; tom: string; rotulo: string; valor: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tom}`}>{icon}</span>
      <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p><p className="text-lg font-bold leading-tight tabular-nums">{valor}</p></div>
    </div>
  )
}
