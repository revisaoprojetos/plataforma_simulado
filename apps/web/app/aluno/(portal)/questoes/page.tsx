import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { QuestoesFiltrosAluno, type FiltrosParams } from '@/components/aluno/questoes-filtros-aluno'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { Target, CheckCircle2, Percent } from 'lucide-react'

const POR_PAGINA = 10
const UUID_ZERO = '00000000-0000-0000-0000-000000000000'

interface PageProps {
  searchParams: Promise<FiltrosParams & { page?: string }>
}

export default async function AlunoQuestoesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const page = Math.max(1, Number(params.page ?? 1))
  const offset = (page - 1) * POR_PAGINA
  const tid = sessao!.tenantId
  const estId = sessao!.estudanteId

  // Taxonomia dos filtros + anos distintos + resumo de prática.
  const [{ data: disciplinas }, { data: bancas }, { data: assuntos }, { data: anosRows }, praticaTotal, praticaAcertos] = await Promise.all([
    svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_bancas').select('id, nome').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_assuntos').select('id, nome, disciplina_id').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_questoes').select('ano').eq('tenant_id', tid).eq('status', 'publicada').eq('deletado', false).not('ano', 'is', null).limit(3000),
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', estId).then((r) => r.count ?? 0, () => 0),
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', estId).eq('correta', true).then((r) => r.count ?? 0, () => 0),
  ])
  const anos = [...new Set((anosRows ?? []).map((r: any) => r.ano).filter(Boolean))].sort((a, b) => b - a)
  const pct = praticaTotal > 0 ? Math.round((praticaAcertos / praticaTotal) * 100) : 0

  // Questões publicadas (com filtros).
  let q = svc
    .from('simulado_questoes')
    .select('id, tipo, enunciado, disciplina_id, banca_id, ano, nivel_dificuldade, comentario_professor, codigo, numero, assunto_id, imagem_url', { count: 'exact' })
    .eq('tenant_id', tid)
    .eq('status', 'publicada')
    .eq('deletado', false)
    .order('created_at', { ascending: false })

  if (params.tipo) q = q.eq('tipo', params.tipo)
  if (params.disciplina) q = q.eq('disciplina_id', params.disciplina)
  if (params.assunto) q = q.eq('assunto_id', params.assunto)
  if (params.banca) q = q.eq('banca_id', params.banca)
  if (params.ano) q = q.eq('ano', Number(params.ano))
  if (params.dificuldade) q = q.eq('nivel_dificuldade', params.dificuldade)
  if (params.comentadas) q = q.not('comentario_professor', 'is', null)
  if (params.busca) q = q.ilike('enunciado', `%${params.busca}%`)

  // "Minhas questões": resolvidas / não resolvidas / acertei / errei (via respostas avulsas).
  if (params.minhas) {
    const { data: ra } = await svc.from('simulado_respostas_avulsas').select('questao_id, correta').eq('estudante_id', estId)
    const rows = (ra ?? []) as any[]
    const resolvidas = [...new Set(rows.map((r) => r.questao_id).filter(Boolean))]
    const acertei = [...new Set(rows.filter((r) => r.correta).map((r) => r.questao_id).filter(Boolean))]
    const errei = [...new Set(rows.filter((r) => !r.correta).map((r) => r.questao_id).filter(Boolean))]
    if (params.minhas === 'resolvidas') q = q.in('id', resolvidas.length ? resolvidas : [UUID_ZERO])
    else if (params.minhas === 'acertei') q = q.in('id', acertei.length ? acertei : [UUID_ZERO])
    else if (params.minhas === 'errei') q = q.in('id', errei.length ? errei : [UUID_ZERO])
    else if (params.minhas === 'nao_resolvidas' && resolvidas.length) q = q.not('id', 'in', `(${resolvidas.join(',')})`)
  }

  const { data: questoes, count } = await q.range(offset, offset + POR_PAGINA - 1)
  const totalPages = Math.ceil((count ?? 0) / POR_PAGINA)

  const ids = (questoes ?? []).map((x: any) => x.id)
  const discIds = (questoes ?? []).map((x: any) => x.disciplina_id).filter(Boolean)
  const bancaIds = (questoes ?? []).map((x: any) => x.banca_id).filter(Boolean)
  const assuntoIds = (questoes ?? []).map((x: any) => x.assunto_id).filter(Boolean)

  const [{ data: alts }, { data: discNomes }, { data: bancaNomes }, { data: assuntoNomes }, { data: favs }] = await Promise.all([
    ids.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
    discIds.length ? svc.from('simulado_disciplinas').select('id, nome').in('id', discIds) : Promise.resolve({ data: [] as any[] }),
    bancaIds.length ? svc.from('simulado_bancas').select('id, nome').in('id', bancaIds) : Promise.resolve({ data: [] as any[] }),
    assuntoIds.length ? svc.from('simulado_assuntos').select('id, nome').in('id', assuntoIds) : Promise.resolve({ data: [] as any[] }),
    ids.length ? svc.from('simulado_favoritos').select('questao_id').eq('estudante_id', estId).in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
  ])

  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }
  const discMap = new Map((discNomes ?? []).map((d: any) => [d.id, d.nome]))
  const bancaMap = new Map((bancaNomes ?? []).map((b: any) => [b.id, b.nome]))
  const assuntoMap = new Map((assuntoNomes ?? []).map((a: any) => [a.id, a.nome]))
  const favSet = new Set((favs ?? []).map((f: any) => f.questao_id))

  const lista: QuestaoAluno[] = (questoes ?? []).map((x: any) => ({
    id: x.id,
    tipo: x.tipo,
    enunciado: x.enunciado ?? '',
    imagem_url: x.imagem_url ?? null,
    codigo: x.codigo ?? (x.numero != null ? `Q${x.numero}` : null),
    disciplina: discMap.get(x.disciplina_id) ?? null,
    assunto: assuntoMap.get(x.assunto_id) ?? null,
    banca: bancaMap.get(x.banca_id) ?? null,
    ano: x.ano ?? null,
    comentario_professor: x.comentario_professor ?? null,
    favorito: favSet.has(x.id),
    alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Banco de questões</h1>
        <p className="text-muted-foreground">Pratique com filtros — responda quantas vezes quiser.</p>
      </div>

      {praticaTotal > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi icon={<Target className="h-5 w-5" />} tom="bg-primary/10 text-primary" rotulo="Resolvidas" valor={praticaTotal.toLocaleString('pt-BR')} />
          <Kpi icon={<CheckCircle2 className="h-5 w-5" />} tom="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" rotulo="Acertos" valor={praticaAcertos.toLocaleString('pt-BR')} />
          <Kpi icon={<Percent className="h-5 w-5" />} tom="bg-amber-500/15 text-amber-600 dark:text-amber-400" rotulo="Aproveitamento" valor={`${pct}%`} />
        </div>
      )}

      <QuestoesFiltrosAluno
        disciplinas={(disciplinas ?? []) as any}
        assuntos={(assuntos ?? []) as any}
        bancas={(bancas ?? []) as any}
        anos={anos}
        total={count ?? 0}
        params={params}
      />

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
