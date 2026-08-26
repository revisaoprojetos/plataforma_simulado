import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { QuestoesFiltrosAluno, type FiltrosParams } from '@/components/aluno/questoes-filtros-aluno'
import { BancoNavProvider, CardsComOverlay } from '@/components/aluno/banco-questoes-client'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { etiquetasPorQuestao } from '@/lib/aluno/etiquetas-questao'
import { provasPorQuestao } from '@/lib/aluno/provas-questao'
import { questoesForaDeJogoTenant } from '@/lib/simulado/questoes-anuladas'
import { Target, CheckCircle2, Percent } from 'lucide-react'

const POR_PAGINA = 10
const COLS_QUESTAO = 'id, tipo, enunciado, disciplina_id, banca_id, ano, nivel_dificuldade, comentario_professor, codigo, numero, assunto_id, imagem_url'

interface PageProps {
  searchParams: Promise<FiltrosParams & { page?: string }>
}

export default async function AlunoQuestoesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const sessao = await getSessaoAluno()
  const svc = createAdminClient()
  const page = Math.max(1, Number(params.page ?? 1))
  const offset = (page - 1) * POR_PAGINA
  const tid = sessao!.tenantId
  const estId = sessao!.estudanteId

  // Taxonomia dos filtros + anos distintos + resumo de prática.
  const [{ data: disciplinasAll }, { data: bancas }, { data: assuntos }, { data: metaRows }, praticaTotal, praticaAcertos] = await Promise.all([
    svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_bancas').select('id, nome').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_assuntos').select('id, nome, disciplina_id').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_questoes').select('ano, disciplina_id').eq('tenant_id', tid).eq('status', 'publicada').eq('deletado', false).eq('anulada', false).neq('tipo', 'discursiva').limit(3000),
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', estId).then((r) => r.count ?? 0, () => 0),
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', estId).eq('correta', true).then((r) => r.count ?? 0, () => 0),
  ])
  const anos = [...new Set((metaRows ?? []).map((r: any) => r.ano).filter(Boolean))].sort((a, b) => b - a)
  // Só mostra no filtro as disciplinas que realmente têm questões (esconde as nunca usadas).
  const discUsadas = new Set((metaRows ?? []).map((r: any) => r.disciplina_id).filter(Boolean))
  const disciplinas = (disciplinasAll ?? []).filter((d: any) => discUsadas.has(d.id))
  const pct = praticaTotal > 0 ? Math.round((praticaAcertos / praticaTotal) * 100) : 0

  // Questões ANULADAS (etiqueta funcional anular/desconsiderar OU boolean) não podem ser praticadas:
  // some da lista (o runner já as bloqueia). Conjunto do tenant (normalmente pequeno) excluído via not-in.
  const foraDeJogo = await questoesForaDeJogoTenant(svc, tid)
  const foraIds = [...foraDeJogo]

  // Aplica os filtros de taxonomia/busca a QUALQUER query builder de questões (reusado nos 2 caminhos).
  const aplicarFiltros = (qb: any) => {
    // .eq('anulada', false) + not-in(foraDeJogo): remove as anuladas (por boolean e por etiqueta).
    qb = qb.eq('tenant_id', tid).eq('status', 'publicada').eq('deletado', false).eq('anulada', false).neq('tipo', 'discursiva')
    if (foraIds.length) qb = qb.not('id', 'in', `(${foraIds.join(',')})`)
    if (params.disciplina) qb = qb.eq('disciplina_id', params.disciplina)
    if (params.assunto) qb = qb.eq('assunto_id', params.assunto)
    if (params.banca) qb = qb.eq('banca_id', params.banca)
    if (params.ano) qb = qb.eq('ano', Number(params.ano))
    if (params.dificuldade) qb = qb.eq('nivel_dificuldade', params.dificuldade)
    if (params.comentadas) qb = qb.not('comentario_professor', 'is', null)
    if (params.busca) qb = qb.ilike('enunciado', `%${params.busca}%`)
    return qb
  }

  let questoes: any[] = []
  let count = 0
  if (params.minhas || params.favoritas) {
    // Filtros "minhas" (resolvidas/…) e/ou "favoritas": em vez de .in()/.not-in() de uma lista GRANDE
    // de ids na URL (estourava 400), busca os IDS que casam a taxonomia (leve) + as respostas e os
    // favoritos do aluno, e intersecta em memória — paginando só a PÁGINA.
    const [idsFiltrados, ra, favRows] = await Promise.all([
      fetchAll<{ id: string }>(() => aplicarFiltros(svc.from('simulado_questoes').select('id')).order('created_at', { ascending: false })),
      params.minhas
        ? fetchAll<{ questao_id: string; correta: boolean }>(() => svc.from('simulado_respostas_avulsas').select('questao_id, correta').eq('estudante_id', estId).order('questao_id', { ascending: true }))
        : Promise.resolve([] as { questao_id: string; correta: boolean }[]),
      params.favoritas
        ? fetchAll<{ questao_id: string }>(() => svc.from('simulado_favoritos').select('questao_id').eq('estudante_id', estId).order('questao_id', { ascending: true }))
        : Promise.resolve([] as { questao_id: string }[]),
    ])
    const resolvidas = new Set(ra.map((r) => r.questao_id).filter(Boolean))
    const acertei = new Set(ra.filter((r) => r.correta).map((r) => r.questao_id).filter(Boolean))
    const errei = new Set(ra.filter((r) => !r.correta).map((r) => r.questao_id).filter(Boolean))
    const favSetF = new Set(favRows.map((r) => r.questao_id).filter(Boolean))
    const alvo = idsFiltrados.map((x) => x.id).filter((id) => {
      const okMinhas = !params.minhas ? true
        : params.minhas === 'resolvidas' ? resolvidas.has(id)
          : params.minhas === 'nao_resolvidas' ? !resolvidas.has(id)
            : params.minhas === 'acertei' ? acertei.has(id)
              : params.minhas === 'errei' ? errei.has(id)
                : true
      return okMinhas && (!params.favoritas || favSetF.has(id))
    })
    count = alvo.length
    const pageIds = alvo.slice(offset, offset + POR_PAGINA)
    if (pageIds.length) {
      const { data } = await svc.from('simulado_questoes').select(COLS_QUESTAO).in('id', pageIds)
      const byId = new Map((data ?? []).map((x: any) => [x.id, x]))
      questoes = pageIds.map((id) => byId.get(id)).filter(Boolean) // preserva a ordem (created_at desc)
    }
  } else {
    const r = await aplicarFiltros(svc.from('simulado_questoes').select(COLS_QUESTAO, { count: 'exact' }))
      .order('created_at', { ascending: false }).range(offset, offset + POR_PAGINA - 1)
    questoes = r.data ?? []
    count = r.count ?? 0
  }
  const totalPages = Math.ceil(count / POR_PAGINA)

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
  const [etiquetasMap, provasMap] = await Promise.all([
    etiquetasPorQuestao(svc, tid, ids),
    provasPorQuestao(svc, tid, ids),
  ])

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
    etiquetas: etiquetasMap.get(x.id) ?? [],
    provas: provasMap.get(x.id) ?? [],
    alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
  }))

  return (
    <BancoNavProvider>
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

        {/* Cards com overlay de carregamento durante a navegação por filtro. */}
        <CardsComOverlay>
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
        </CardsComOverlay>
      </div>
    </BancoNavProvider>
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
