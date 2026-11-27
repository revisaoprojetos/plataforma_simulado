import { redirect } from 'next/navigation'
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
import { resolverComentarioGabarito } from '@/lib/simulado/comentario-gabarito'
import { Target, CheckCircle2, Percent } from 'lucide-react'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { sqlQuery } from '@/lib/data/sql'
import { lerLista, expandirAssuntos } from '@/lib/aluno/filtros-multi'
import { PlatformBanco } from '@/components/brand/interna/banco'

const POR_PAGINA = 10
const COLS_QUESTAO = 'id, tipo, enunciado, disciplina_id, banca_id, ano, nivel_dificuldade, comentario_professor, codigo, numero, assunto_id, imagem_url'

interface PageProps {
  searchParams: Promise<FiltrosParams & { page?: string }>
}

export default async function AlunoQuestoesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()
  const page = Math.max(1, Number(params.page ?? 1))
  const offset = (page - 1) * POR_PAGINA
  const tid = sessao.tenantId
  const estId = sessao.estudanteId

  // Taxonomia dos filtros + facetas distintas (disciplina/ano/órgão/cargo/assunto/tópico) + resumo de prática.
  const [{ data: disciplinasAll }, { data: bancas }, { data: assuntos }, { data: orgaosAll }, facetas, praticaTotal, praticaAcertos] = await Promise.all([
    svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_bancas').select('id, nome').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_assuntos').select('id, nome, disciplina_id, pai_id').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_orgaos').select('id, nome').eq('tenant_id', tid).order('nome'),
    carregarFacetas(svc, tid),
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', estId).then((r) => r.count ?? 0, () => 0),
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', estId).eq('correta', true).then((r) => r.count ?? 0, () => 0),
  ])
  const anos = [...new Set(facetas.map((r) => r.ano).filter((x): x is number => !!x))].sort((a, b) => b - a)
  // Só mostra no filtro o que realmente tem questões (esconde o nunca usado).
  const discUsadas = new Set(facetas.map((r) => r.disciplina_id).filter(Boolean))
  const disciplinas = (disciplinasAll ?? []).filter((d: any) => discUsadas.has(d.id))
  const orgaoUsados = new Set(facetas.map((r) => r.orgao_id).filter(Boolean))
  const orgaos = (orgaosAll ?? []).filter((o: any) => orgaoUsados.has(o.id))
  const cargos = [...new Set(facetas.map((r) => r.cargo).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const detalhes = [...new Map(facetas.filter((r) => r.assunto_id && r.assunto_detalhe).map((r) => [`${r.assunto_id}|${r.assunto_detalhe}`, { assunto_id: r.assunto_id as string, nome: r.assunto_detalhe as string }])).values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
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
    // Multi-seleção: cada filtro é uma lista "a|b|c" → .in(); assunto abrange os sub-assuntos (pai_id).
    const L = (v?: string) => lerLista(v)
    if (L(params.disciplina).length) qb = qb.in('disciplina_id', L(params.disciplina))
    if (L(params.assunto).length) qb = qb.in('assunto_id', expandirAssuntos(L(params.assunto), (assuntos ?? []) as any))
    if (L(params.detalhe).length) qb = qb.in('assunto_detalhe', L(params.detalhe))
    if (L(params.banca).length) qb = qb.in('banca_id', L(params.banca))
    if (L(params.orgao).length) qb = qb.in('orgao_id', L(params.orgao))
    if (L(params.cargo).length) qb = qb.in('cargo', L(params.cargo))
    if (L(params.ano).length) qb = qb.in('ano', L(params.ano).map(Number).filter((n) => Number.isFinite(n)))
    if (L(params.dificuldade).length) qb = qb.in('nivel_dificuldade', L(params.dificuldade))
    if (params.comentadas) qb = qb.not('comentario_professor', 'is', null)
    if (params.busca) qb = qb.ilike('enunciado', `%${params.busca}%`)
    return qb
  }

  let questoes: any[] = []
  let count = 0
  if (params.minhas || params.favoritas || params.erros_simulado) {
    // Filtros "minhas" (resolvidas/…) e/ou "favoritas": em vez de .in()/.not-in() de uma lista GRANDE
    // de ids na URL (estourava 400), busca os IDS que casam a taxonomia (leve) + as respostas e os
    // favoritos do aluno, e intersecta em memória — paginando só a PÁGINA.
    // erros_simulado=<id>: só as questões que o aluno ERROU nesse simulado (vem do botão "Treinar erros" do resultado).
    const errosSim = new Set<string>()
    if (params.erros_simulado) {
      const { data: ss } = await svc.from('simulado_sessoes_prova').select('id')
        .eq('estudante_id', estId).eq('simulado_id', params.erros_simulado).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
      const sids = (ss ?? []).map((s: any) => s.id)
      if (sids.length) {
        const { data: rs } = await svc.from('simulado_respostas_objetivas').select('questao_id').in('sessao_id', sids).eq('correta', false)
        for (const r of (rs ?? []) as any[]) if (r.questao_id) errosSim.add(r.questao_id)
      }
    }
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
      return okMinhas && (!params.favoritas || favSetF.has(id)) && (!params.erros_simulado || errosSim.has(id))
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
    ids.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta, comentario').in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
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
    // Comentário do gabarito: professor OU comentário das alternativas (formato PGE/AGU) — ver helper.
    comentario_professor: resolverComentarioGabarito(x.comentario_professor, altMap.get(x.id) ?? []),
    favorito: favSet.has(x.id),
    etiquetas: etiquetasMap.get(x.id) ?? [],
    provas: provasMap.get(x.id) ?? [],
    alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
  }))

  // Filtros + cards + paginação (peças FUNCIONAIS) — reusadas no visual atual E no novo.
  const filtrosEl = (
    <QuestoesFiltrosAluno
      disciplinas={(disciplinas ?? []) as any}
      assuntos={(assuntos ?? []) as any}
      bancas={(bancas ?? []) as any}
      anos={anos}
      total={count ?? 0}
      params={params}
    />
  )
  const questoesEl = (
    <CardsComOverlay>
      {lista.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhuma questão encontrada com esses filtros.</div>
      ) : (
        <div className="space-y-4">{lista.map((qq, i) => <QuestaoCard key={qq.id} questao={qq} numero={offset + i + 1} />)}</div>
      )}
      <PaginationControls page={page} totalPages={totalPages} />
    </CardsComOverlay>
  )

  // ── NOVO VISUAL INTERNO: Banco redesenhado (header/KPIs + QCore novo) reusando filtros/paginação. ──
  // Aqui `questoes` é o ARRAY de dados (QCore resolve/favorita de verdade); paginação continua por URL.
  const _it = await resolverInterno()
  if (_it.ativo) {
    const paginacaoEl = <PaginationControls page={page} totalPages={totalPages} />

    // Dados da COLUNA DIREITA do MEQ (spec 04 §3): "Desempenho no filtro" (donut acertos/erros/resolvidas
    // DENTRO do filtro atual) + "Questões por dia" (Seg–Sex da semana corrente). Só computa p/ MEQ
    // (as outras marcas não têm essa coluna) e de forma leve: ids do filtro (coluna única) ∩ respostas do aluno.
    let desempenhoFiltro: { acertos: number; erros: number; resolvidas: number } | undefined
    let porDia: { label: string; n: number }[] | undefined
    if (_it.brand === 'meq') {
      const [idsFiltro, respAluno] = await Promise.all([
        fetchAll<{ id: string }>(() => aplicarFiltros(svc.from('simulado_questoes').select('id')).order('id', { ascending: true })),
        fetchAll<{ questao_id: string; correta: boolean; respondido_em: string }>(
          () => svc.from('simulado_respostas_avulsas').select('questao_id, correta, respondido_em').eq('estudante_id', estId).order('id', { ascending: true }),
        ),
      ])
      const setFiltro = new Set(idsFiltro.map((x) => x.id))
      // Última resposta por questão (a mais recente decide acerto/erro), só p/ questões no filtro.
      const ultimaPorQ = new Map<string, boolean>()
      for (const r of respAluno) {
        if (!r.questao_id || !setFiltro.has(r.questao_id)) continue
        ultimaPorQ.set(r.questao_id, !!r.correta) // ordenado por id; mantém a leitura estável
      }
      let ac = 0
      for (const ok of ultimaPorQ.values()) if (ok) ac++
      const resolvidasNoFiltro = ultimaPorQ.size
      desempenhoFiltro = { acertos: ac, erros: resolvidasNoFiltro - ac, resolvidas: resolvidasNoFiltro }

      // Questões por dia desta semana (seg→sex). Conta RESPOSTAS (atividade) por dia útil.
      const agora = new Date()
      const diaSemana = (agora.getDay() + 6) % 7 // 0 = segunda
      const segunda = new Date(agora); segunda.setHours(0, 0, 0, 0); segunda.setDate(agora.getDate() - diaSemana)
      const LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
      const cont = [0, 0, 0, 0, 0]
      for (const r of respAluno) {
        if (!r.respondido_em) continue
        const d = new Date(r.respondido_em)
        const idx = Math.floor((d.getTime() - segunda.getTime()) / 86400000)
        if (idx >= 0 && idx <= 4) cont[idx]++
      }
      porDia = LABELS.map((label, i) => ({ label, n: cont[i] }))
    }

    return (
      <BancoNavProvider>
        <PlatformBanco brand={_it.brand} theme={_it.theme}
          stats={{ resolvidas: praticaTotal, acertos: praticaAcertos, aproveitamento: pct, total: count ?? 0 }}
          filtros={{ disciplinas: (disciplinas ?? []) as any, assuntos: (assuntos ?? []) as any, bancas: (bancas ?? []) as any, orgaos: orgaos as any, cargos, detalhes, anos, params }}
          questoes={lista} paginacao={paginacaoEl}
          desempenhoFiltro={desempenhoFiltro} porDia={porDia} />
      </BancoNavProvider>
    )
  }

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

        {filtrosEl}
        {questoesEl}
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

type Faceta = { disciplina_id: string | null; ano: number | null; orgao_id: string | null; cargo: string | null; assunto_id: string | null; assunto_detalhe: string | null }

/** Combinações DISTINTAS de taxonomia das questões publicadas (alimenta as opções dos filtros). 1 SELECT DISTINCT; fallback PostgREST paginado. */
async function carregarFacetas(svc: ReturnType<typeof createAdminClient>, tid: string): Promise<Faceta[]> {
  const rows = await sqlQuery<Faceta>(
    `select distinct disciplina_id::text, ano, orgao_id::text, nullif(btrim(cargo), '') as cargo, assunto_id::text, nullif(btrim(assunto_detalhe), '') as assunto_detalhe
       from simulado_questoes where tenant_id = $1 and status = 'publicada' and deletado = false and anulada = false and tipo <> 'discursiva'`, [tid])
  if (rows) return rows
  try {
    const r = await fetchAll<Faceta>(() => svc.from('simulado_questoes').select('disciplina_id, ano, orgao_id, cargo, assunto_id, assunto_detalhe')
      .eq('tenant_id', tid).eq('status', 'publicada').eq('deletado', false).eq('anulada', false).neq('tipo', 'discursiva').order('id', { ascending: true }) as never)
    return r.map((x) => ({ ...x, cargo: x.cargo?.trim() || null, assunto_detalhe: x.assunto_detalhe?.trim() || null }))
  } catch { return [] }
}
