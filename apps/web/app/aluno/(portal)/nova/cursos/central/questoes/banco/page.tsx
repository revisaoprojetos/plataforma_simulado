// Questões e Simulados — aba "Banco de questões". Filtros + card de questão A–E + estatísticas.
// DADO REAL (reusa os loaders da área de produção do aluno). Server component.
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { questoesForaDeJogoTenant } from '@/lib/simulado/questoes-anuladas'
import {
  PageHeader, Card, Grid, Row, Col, H2, Muted, P, Tag, Btn, IBtn, Seg,
  Stat, Crumbs, Tabs,
} from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { BancoFiltros, type BancoParams } from './_banco'

export const dynamic = 'force-dynamic'

const POR_PAGINA = 10
const COLS_QUESTAO = 'id, tipo, enunciado, disciplina_id, banca_id, ano, nivel_dificuldade, comentario_professor, codigo, numero, assunto_id'

type SP = BancoParams & { page?: string }
interface PageProps { searchParams: Promise<SP> }

type Resumo = {
  cod: string; disciplina: string; fonte: string
  status: 'acertou' | 'errou' | 'nova'; enunciado: string; sub: string
}

const STATUS_META: Record<Resumo['status'], { label: string; icon: IconName; color: string }> = {
  acertou: { label: 'Resolvida · acertou', icon: 'check', color: 'var(--ok)' },
  errou: { label: 'Resolvida · errou', icon: 'x', color: 'var(--danger)' },
  nova: { label: 'Não resolvida', icon: 'clock', color: 'var(--muted)' },
}

export default async function BancoPage({ searchParams }: PageProps) {
  const params = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()
  const tid = sessao.tenantId
  const estId = sessao.estudanteId
  const page = Math.max(1, Number(params.page ?? 1))
  const offset = (page - 1) * POR_PAGINA

  // Taxonomia dos filtros + anos distintos + resumo de prática (mesmos loaders da produção).
  const [{ data: disciplinasAll }, { data: bancas }, { data: assuntos }, { data: metaRows }, praticaTotal, praticaAcertos] = await Promise.all([
    svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_bancas').select('id, nome').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_assuntos').select('id, nome, disciplina_id').eq('tenant_id', tid).order('nome'),
    svc.from('simulado_questoes').select('ano, disciplina_id').eq('tenant_id', tid).eq('status', 'publicada').eq('deletado', false).eq('anulada', false).neq('tipo', 'discursiva').limit(3000),
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', estId).then((r: any) => r.count ?? 0, () => 0),
    svc.from('simulado_respostas_avulsas').select('*', { count: 'exact', head: true }).eq('estudante_id', estId).eq('correta', true).then((r: any) => r.count ?? 0, () => 0),
  ])
  const anos = [...new Set((metaRows ?? []).map((r: any) => r.ano).filter(Boolean))].sort((a: number, b: number) => b - a)
  const discUsadas = new Set((metaRows ?? []).map((r: any) => r.disciplina_id).filter(Boolean))
  const disciplinas = (disciplinasAll ?? []).filter((d: any) => discUsadas.has(d.id))
  const pct = praticaTotal > 0 ? Math.round((praticaAcertos / praticaTotal) * 100) : 0

  // Questões "fora de jogo" (anuladas/desconsideradas) somem da prática.
  const foraDeJogo = await questoesForaDeJogoTenant(svc, tid)
  const foraIds = [...foraDeJogo]

  const aplicarFiltros = (qb: any) => {
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

  // Página de questões (paginação no banco). Filtro "minhas" (resolvidas/errei) intersecta em memória
  // — mesma estratégia da produção p/ evitar .in() gigante na URL.
  let questoes: any[] = []
  let count = 0
  if (params.minhas) {
    const [idsFiltrados, ra] = await Promise.all([
      fetchAll<{ id: string }>(() => aplicarFiltros(svc.from('simulado_questoes').select('id')).order('created_at', { ascending: false })),
      fetchAll<{ questao_id: string; correta: boolean }>(() => svc.from('simulado_respostas_avulsas').select('questao_id, correta').eq('estudante_id', estId).order('questao_id', { ascending: true })),
    ])
    const resolvidas = new Set(ra.map((r) => r.questao_id).filter(Boolean))
    const errei = new Set(ra.filter((r) => !r.correta).map((r) => r.questao_id).filter(Boolean))
    const alvo = idsFiltrados.map((x) => x.id).filter((id) =>
      params.minhas === 'nao_resolvidas' ? !resolvidas.has(id)
        : params.minhas === 'errei' ? errei.has(id)
          : true,
    )
    count = alvo.length
    const pageIds = alvo.slice(offset, offset + POR_PAGINA)
    if (pageIds.length) {
      const { data } = await svc.from('simulado_questoes').select(COLS_QUESTAO).in('id', pageIds)
      const byId = new Map((data ?? []).map((x: any) => [x.id, x]))
      questoes = pageIds.map((id) => byId.get(id)).filter(Boolean)
    }
  } else {
    const r = await aplicarFiltros(svc.from('simulado_questoes').select(COLS_QUESTAO, { count: 'exact' }))
      .order('created_at', { ascending: false }).range(offset, offset + POR_PAGINA - 1)
    questoes = r.data ?? []
    count = r.count ?? 0
  }
  const totalPages = Math.max(1, Math.ceil(count / POR_PAGINA))

  // Nomes (disciplina/banca/assunto), alternativas da 1ª questão (card aberto) e status do aluno.
  const ids = questoes.map((x) => x.id)
  const discIds = questoes.map((x) => x.disciplina_id).filter(Boolean)
  const bancaIds = questoes.map((x) => x.banca_id).filter(Boolean)
  const assuntoIds = questoes.map((x) => x.assunto_id).filter(Boolean)
  const abertaId = questoes[0]?.id as string | undefined

  const [{ data: discNomes }, { data: bancaNomes }, { data: assuntoNomes }, { data: alts }, { data: respRows }] = await Promise.all([
    discIds.length ? svc.from('simulado_disciplinas').select('id, nome').in('id', discIds) : Promise.resolve({ data: [] as any[] }),
    bancaIds.length ? svc.from('simulado_bancas').select('id, nome').in('id', bancaIds) : Promise.resolve({ data: [] as any[] }),
    assuntoIds.length ? svc.from('simulado_assuntos').select('id, nome').in('id', assuntoIds) : Promise.resolve({ data: [] as any[] }),
    abertaId ? svc.from('simulado_alternativas').select('id, texto, ordem').eq('questao_id', abertaId).order('ordem', { ascending: true }) : Promise.resolve({ data: [] as any[] }),
    ids.length ? svc.from('simulado_respostas_avulsas').select('questao_id, correta, respondido_em').eq('estudante_id', estId).in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
  ])

  const discMap = new Map((discNomes ?? []).map((d: any) => [d.id, d.nome]))
  const bancaMap = new Map((bancaNomes ?? []).map((b: any) => [b.id, b.nome]))
  const assuntoMap = new Map((assuntoNomes ?? []).map((a: any) => [a.id, a.nome]))

  // Última resposta por questão → status (acertou/errou); ausente = nova.
  const ultima = new Map<string, { correta: boolean; em: number }>()
  for (const r of (respRows ?? []) as any[]) {
    if (!r.questao_id) continue
    const em = r.respondido_em ? new Date(r.respondido_em).getTime() : 0
    const prev = ultima.get(r.questao_id)
    if (!prev || em >= prev.em) ultima.set(r.questao_id, { correta: !!r.correta, em })
  }
  const statusDe = (qid: string): Resumo['status'] => {
    const u = ultima.get(qid)
    return !u ? 'nova' : u.correta ? 'acertou' : 'errou'
  }
  const fonteDe = (q: any): string => {
    const banca = bancaMap.get(q.banca_id)
    if (banca && q.ano) return `${banca} (${q.ano})`
    return banca ?? (q.ano ? String(q.ano) : '—')
  }
  const codDe = (q: any): string => q.codigo ?? (q.numero != null ? `Q${q.numero}` : q.id.slice(0, 6))

  // URLs (preservam filtros; troca de filtro/aba zera a página).
  const hrefFiltro = (over: Partial<SP>): string => {
    const merged: SP = { ...params, ...over, page: undefined }
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, String(v))
    const qs = usp.toString()
    return qs ? `${R.banco}?${qs}` : R.banco
  }
  const hrefPagina = (p: number): string => {
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page') usp.set(k, String(v))
    if (p > 1) usp.set('page', String(p))
    const qs = usp.toString()
    return qs ? `${R.banco}?${qs}` : R.banco
  }

  const aberta = questoes[0]
  const resumos = questoes.slice(1)
  const abertaDisc = aberta ? discMap.get(aberta.disciplina_id) : undefined

  // Seg "Minhas questões" (Todas / Não resolvidas / Que errei) → filtro real por URL.
  const segAtivo = params.minhas === 'nao_resolvidas' ? 1 : params.minhas === 'errei' ? 2 : 0
  const segLinks = [hrefFiltro({ minhas: undefined }), hrefFiltro({ minhas: 'nao_resolvidas' }), hrefFiltro({ minhas: 'errei' })]

  // Chips dos filtros ativos (remover = link sem aquele param).
  const chips: { label: string; href: string }[] = []
  if (params.disciplina) chips.push({ label: discMap.get(params.disciplina) ?? disciplinas.find((d: any) => d.id === params.disciplina)?.nome ?? 'Disciplina', href: hrefFiltro({ disciplina: undefined, assunto: undefined }) })
  if (params.assunto) chips.push({ label: assuntoMap.get(params.assunto) ?? (assuntos ?? []).find((a: any) => a.id === params.assunto)?.nome ?? 'Assunto', href: hrefFiltro({ assunto: undefined }) })
  if (params.banca) chips.push({ label: bancaMap.get(params.banca) ?? (bancas ?? []).find((b: any) => b.id === params.banca)?.nome ?? 'Banca', href: hrefFiltro({ banca: undefined }) })
  if (params.ano) chips.push({ label: String(params.ano), href: hrefFiltro({ ano: undefined }) })
  if (params.dificuldade) chips.push({ label: ({ facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' } as Record<string, string>)[params.dificuldade] ?? params.dificuldade, href: hrefFiltro({ dificuldade: undefined }) })
  if (params.comentadas) chips.push({ label: 'Com comentário', href: hrefFiltro({ comentadas: undefined }) })
  if (params.busca) chips.push({ label: `"${params.busca}"`, href: hrefFiltro({ busca: undefined }) })

  return (
    <>
      <Crumbs items={[['Central de Estudos', R.central], ['Questões e Simulados', R.questoes]]} />
      <Tabs items={['Simulados', 'Banco de questões', 'Realizados', 'Recomendado']} links={[R.questoes, R.banco, R.realizados, R.recomendado]} active={1} />

      <PageHeader eyebrow="Questões" title="Banco de questões" sub="Questões comentadas de procuradorias e carreiras jurídicas." />

      <Grid cols={4} gap={12}>
        <Stat icon="clip" value={praticaTotal.toLocaleString('pt-BR')} label="resolvidas" />
        <Stat icon="check" value={praticaAcertos.toLocaleString('pt-BR')} label="acertos" />
        <Stat icon="target" value={`${pct}%`} label="aproveitamento" />
        <Stat icon="qbook" value={count.toLocaleString('pt-BR')} label="questões no filtro" />
      </Grid>

      <Row gap={8}>
        <Muted size={13}><b style={{ color: 'var(--ink)' }}>{count.toLocaleString('pt-BR')} questões</b> encontradas com os filtros</Muted>
        {chips.length > 0 && (
          <Row gap={6}>
            {chips.map((c) => (
              <a key={c.label} href={c.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 700 }}>
                {c.label}<Icon n="x" size={12} />
              </a>
            ))}
            <Btn kind="link" href={R.banco}>Limpar</Btn>
          </Row>
        )}
      </Row>

      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* Painel de filtros (client) — dados reais, navega por URL */}
        <BancoFiltros
          disciplinas={(disciplinas ?? []) as any}
          assuntos={(assuntos ?? []) as any}
          bancas={(bancas ?? []) as any}
          anos={anos as number[]}
          total={count}
          params={params}
        />

        {/* Lista de questões */}
        <Col gap={16}>
          <Row gap={8} style={{ justifyContent: 'space-between' }}>
            <Seg items={['Todas', 'Não resolvidas', 'Que errei']} links={segLinks} active={segAtivo} />
            <Row gap={8}>
              <Muted size={12.5}>Ordenar por</Muted>
              {/* TODO(dados): ordenação alternativa — hoje sempre "mais recentes" (created_at desc). */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 700 }}>Mais recentes<Icon n="chevd" size={15} /></span>
            </Row>
          </Row>

          {questoes.length === 0 ? (
            <Card pad={40}>
              <Muted size={13.5}>Nenhuma questão encontrada com esses filtros.</Muted>
            </Card>
          ) : (
            <>
              {/* Questão aberta (1ª da página) com alternativas A–E reais */}
              {aberta && (
                <Card pad={24}>
                  <Row gap={8}>
                    {abertaDisc && <Tag kind="brand">{abertaDisc}</Tag>}
                    {aberta.ano && <Tag kind="gold">{aberta.ano}</Tag>}
                    <Muted size={12.5}>{fonteDe(aberta)}</Muted>
                  </Row>
                  <H2 style={{ fontSize: 18 }}>{aberta.enunciado}</H2>
                  <Col gap={10}>
                    {(alts ?? []).map((a: any, i: number) => (
                      <Row key={a.id} gap={14} style={{ flexWrap: 'nowrap', alignItems: 'flex-start', padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)' }}>
                        <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9, background: 'var(--surface2)', color: 'var(--ink)', fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{String.fromCharCode(65 + i)}</span>
                        <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)' }}>{a.texto}</span>
                        <button type="button" aria-label="Riscar alternativa (tesoura)" title="Riscar alternativa" style={{ flexShrink: 0, width: 28, height: 28, border: 0, background: 'transparent', color: 'var(--muted2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon n="x" size={15} /></button>
                      </Row>
                    ))}
                  </Col>
                  <Row gap={8}>
                    <IBtn icon="bookmark" label="Favoritar" />
                    <IBtn icon="flag" label="Reportar erro" />
                  </Row>
                  <Row gap={10} style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                    <Btn kind="secondary" icon="chat" href={R.questoes}>Comentário</Btn>
                    <Btn kind="secondary" icon="chart" href={R.questoes}>Estatísticas</Btn>
                  </Row>
                </Card>
              )}

              {/* Questões resumidas (restante da página) */}
              {resumos.map((q: any) => {
                const status = statusDe(q.id)
                const st = STATUS_META[status]
                const assunto = assuntoMap.get(q.assunto_id)
                const sub = [assunto, q.nivel_dificuldade ? ({ facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' } as Record<string, string>)[q.nivel_dificuldade] : null].filter(Boolean).join(' · ') || 'Questão objetiva'
                return (
                  <Card key={q.id}>
                    <Row gap={8} style={{ justifyContent: 'space-between' }}>
                      <Row gap={8}>
                        <b style={{ fontSize: 13, color: 'var(--brand)' }}>{codDe(q)}</b>
                        <b style={{ fontSize: 13, color: 'var(--ink)' }}>{discMap.get(q.disciplina_id) ?? '—'}</b>
                        <Muted size={12.5}>{fonteDe(q)}</Muted>
                      </Row>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: st.color }}><Icon n={st.icon} size={13} />{st.label}</span>
                    </Row>
                    <P size={13.5}><span style={{ color: 'var(--ink)' }}>{q.enunciado}</span></P>
                    <Row gap={8} style={{ justifyContent: 'space-between' }}>
                      <Muted size={12}>{sub}</Muted>
                      <Btn kind="secondary" icon={status === 'nova' ? 'play' : 'eye'} href={R.questoes}>{status === 'nova' ? 'Resolver' : 'Ver de novo'}</Btn>
                    </Row>
                  </Card>
                )
              })}

              {/* Paginação (links, preserva filtros) */}
              {totalPages > 1 && (
                <Row gap={6} style={{ justifyContent: 'center' }}>
                  <IBtn icon="back" label="Página anterior" size={36} href={hrefPagina(Math.max(1, page - 1))} />
                  {paginas(page, totalPages).map((p, i) => p === '…' ? (
                    <span key={`e${i}`} style={{ minWidth: 36, height: 36, padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>…</span>
                  ) : (
                    <a key={p} href={hrefPagina(p as number)} style={{ minWidth: 36, height: 36, padding: '0 8px', borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, border: '1px solid var(--line)', background: p === page ? 'var(--brand)' : 'var(--surface)', color: p === page ? '#fff' : 'var(--ink)' }}>{(p as number).toLocaleString('pt-BR')}</a>
                  ))}
                  <IBtn icon="arrow" label="Próxima página" size={36} href={hrefPagina(Math.min(totalPages, page + 1))} />
                </Row>
              )}
            </>
          )}
        </Col>
      </div>
    </>
  )
}

// Pager compacto: 1 … (atual-1 atual atual+1) … último.
function paginas(cur: number, tot: number): (number | '…')[] {
  const s = new Set<number>([1, tot, cur - 1, cur, cur + 1, 2, tot - 1])
  const nums = [...s].filter((n) => n >= 1 && n <= tot).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  let prev = 0
  for (const n of nums) {
    if (prev && n - prev > 1) out.push('…')
    out.push(n)
    prev = n
  }
  return out
}
