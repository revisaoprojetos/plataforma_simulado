// Questões e Simulados — aba "Recomendado" (RecomendadoRevisao). Diagnóstico + caderno de reforço.
// Dado REAL ligado às estatísticas do aluno. Porte fiel do canvas. Server component.
import {
  PageHeader, Card, Grid, Row, Col, H2, H3, Muted, Tag, Btn, IBtn, Split,
  Stat, Bar, Aviso, Crumbs, Tabs, Chips,
} from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { provasPorQuestao } from '@/lib/aluno/provas-questao'

export const dynamic = 'force-dynamic'

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
// Remove tags/entidades do HTML armazenado para exibir o enunciado/alternativa como texto plano.
function txt(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

type Diag = { nome: string; frac: string; pct: number; prio: 'Alta' | 'Média' | 'Ok' }

// Mesma regra de faixa da produção (recomendado): <30 alta · <60 média · 60%+ ok.
const prioDe = (pct: number): Diag['prio'] => (pct < 30 ? 'Alta' : pct < 60 ? 'Média' : 'Ok')

const PRIO_META: Record<Diag['prio'], { tag: 'red' | 'gold' | 'green'; color: string }> = {
  Alta: { tag: 'red', color: 'var(--danger)' },
  Média: { tag: 'gold', color: 'var(--accentInk)' },
  Ok: { tag: 'green', color: 'var(--ok)' },
}

export default async function RecomendadoPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()

  // 1) Sessões reais do aluno (exclui teste/deletadas) → respostas objetivas.
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id')
    .eq('estudante_id', sessao.estudanteId)
    .eq('is_teste', false)
    .eq('deletado', false)
  const sessaoIds = (sessoes ?? []).map((s: any) => s.id)

  // fetchAllByIn (chunk 80): aluno ativo pode ter >1000 respostas → raw .in() truncaria o diagnóstico.
  const resp = sessaoIds.length
    ? await fetchAllByIn<any>(sessaoIds, (chunk) =>
        svc.from('simulado_respostas_objetivas').select('questao_id, correta').in('sessao_id', chunk).order('id', { ascending: true }))
    : []

  // 2) Mapeia questão → disciplina; marca dominadas/erradas.
  const answeredIds = [...new Set(resp.map((r: any) => r.questao_id))]
  const qDisc = answeredIds.length
    ? await fetchAllByIn<any>(answeredIds, (chunk) =>
        svc.from('simulado_questoes').select('id, disciplina_id').in('id', chunk).order('id', { ascending: true }))
    : []
  const qDiscMap = new Map(qDisc.map((q: any) => [q.id, q.disciplina_id]))

  const stats = new Map<string, { acertos: number; total: number }>()
  const dominadas = new Set<string>()
  const erradas = new Set<string>()
  for (const r of resp) {
    const d = qDiscMap.get(r.questao_id) ?? '__sem'
    const cur = stats.get(d) ?? { acertos: 0, total: 0 }
    cur.total += 1
    if (r.correta) { cur.acertos += 1; dominadas.add(r.questao_id) } else { erradas.add(r.questao_id) }
    stats.set(d, cur)
  }

  // 3) Nomes das disciplinas.
  const discIds = [...stats.keys()].filter((d) => d !== '__sem')
  const discNomes = discIds.length
    ? await fetchAllByIn<any>(discIds, (chunk) =>
        svc.from('simulado_disciplinas').select('id, nome').in('id', chunk).order('id', { ascending: true }))
    : []
  const discNomeMap = new Map(discNomes.map((d: any) => [d.id, d.nome]))

  // Diagnóstico por matéria (pior → melhor), mesma montagem da produção.
  const diagRaw = [...stats.entries()]
    .filter(([d]) => d !== '__sem')
    .map(([d, v]) => ({ id: d, nome: discNomeMap.get(d) ?? 'Matéria', pct: v.total ? Math.round((v.acertos / v.total) * 100) : 0, acertos: v.acertos, total: v.total }))
    .sort((a, b) => a.pct - b.pct)

  const DIAG: Diag[] = diagRaw.map((d) => ({ nome: d.nome, frac: `${d.acertos}/${d.total}`, pct: d.pct, prio: prioDe(d.pct) }))

  // 4) Disciplinas fracas (≤70%) → questões recomendadas (publicadas, não dominadas; erradas primeiro).
  const fracas = diagRaw.filter((d) => d.pct <= 70).map((d) => d.id)
  let escolhidasIds: string[] = []
  if (fracas.length) {
    const cand = await fetchAllByIn<any>(fracas, (chunk) =>
      svc.from('simulado_questoes').select('id').eq('tenant_id', sessao.tenantId).eq('status', 'publicada').in('disciplina_id', chunk).order('id', { ascending: true }))
    const naoDominadas = cand.filter((q: any) => !dominadas.has(q.id))
    naoDominadas.sort((a: any, b: any) => (erradas.has(b.id) ? 1 : 0) - (erradas.has(a.id) ? 1 : 0))
    escolhidasIds = naoDominadas.slice(0, 10).map((q: any) => q.id)
  }

  // 5) Primeira questão do caderno de reforço (enunciado + alternativas + prova + metadados reais).
  const primeiroId = escolhidasIds[0] ?? null
  let questao: { enunciado: string; disciplina: string | null; ano: number | null; prova: string | null; alternativas: { letra: string; texto: string }[] } | null = null
  if (primeiroId) {
    const [{ data: qRow }, { data: alts }, provasMap] = await Promise.all([
      svc.from('simulado_questoes').select('id, enunciado, disciplina_id, ano').eq('id', primeiroId).maybeSingle(),
      svc.from('simulado_alternativas').select('texto, ordem').eq('questao_id', primeiroId).order('ordem', { ascending: true }),
      provasPorQuestao(svc, sessao.tenantId, [primeiroId]),
    ])
    const letras = 'ABCDEFGH'
    questao = {
      enunciado: txt((qRow as any)?.enunciado),
      disciplina: discNomeMap.get((qRow as any)?.disciplina_id) ?? null,
      ano: (qRow as any)?.ano ?? null,
      prova: provasMap.get(primeiroId)?.[0]?.titulo ?? null,
      alternativas: (alts ?? []).map((a: any, i: number) => ({ letra: letras[i] ?? '?', texto: txt(a.texto) })),
    }
  }

  // Métricas do topo.
  const materiasAnalisadas = DIAG.length
  const acertoMedio = DIAG.length ? Math.round(DIAG.reduce((a, d) => a + d.pct, 0) / DIAG.length) : 0
  const paraReforcar = DIAG.filter((d) => d.pct <= 70).length
  const questoesHoje = escolhidasIds.length
  const insight = diagRaw[0] ?? null // pior matéria
  const chipsFracas = diagRaw.filter((d) => d.pct <= 70).slice(0, 4).map((d) => d.nome)

  return (
    <>
      <Crumbs items={[['Central de Estudos', R.central], ['Questões e Simulados', R.questoes]]} />
      <Tabs items={['Simulados', 'Banco de questões', 'Realizados', 'Recomendado']} links={[R.questoes, R.banco, R.realizados, R.recomendado]} active={3} />

      <PageHeader eyebrow="Para você" title="Recomendado para você" sub="Questões escolhidas a partir das suas estatísticas — reforce onde você mais erra." />

      <Grid cols={4} gap={12}>
        <Stat icon="chart" value={fmtInt(materiasAnalisadas)} label="matérias analisadas" />
        <Stat icon="target" value={`${acertoMedio}%`} label="acerto médio" />
        <Stat icon="flag" value={fmtInt(paraReforcar)} label="para reforçar" />
        <Stat icon="clip" value={fmtInt(questoesHoje)} label="questões de hoje" />
      </Grid>

      {insight && (
        <Aviso
          icon="bulb"
          action={<Btn kind="gold" icon="play" href={R.banco}>Reforçar {insight.nome}</Btn>}
        >
          <b style={{ fontSize: 14 }}>Sua maior oportunidade agora é {insight.nome}</b><br />
          {insight.total} {insight.total === 1 ? 'questão feita' : 'questões feitas'} e {insight.pct}% de acerto. {questoesHoje > 0 ? `Separamos ${questoesHoje} ${questoesHoje === 1 ? 'questão' : 'questões'} de reforço para você começar a fechar esse gargalo.` : 'Pratique no banco de questões para reforçar esse ponto.'}
        </Aviso>
      )}

      <Split
        right="minmax(0, 1.4fr)"
        main={
          <Card>
            <Col gap={2}>
              <H3><Icon n="chart" size={15} /> Diagnóstico por matéria</H3>
              <Muted size={12}>{fmtInt(materiasAnalisadas)} {materiasAnalisadas === 1 ? 'matéria' : 'matérias'} · média {acertoMedio}%</Muted>
            </Col>
            {DIAG.length === 0 ? (
              <Muted size={13}>Resolva algumas questões ou um simulado para ver seu diagnóstico por matéria.</Muted>
            ) : (
              <Col gap={0}>
                {DIAG.map((d, i) => {
                  const m = PRIO_META[d.prio]
                  return (
                    <Row key={d.nome} gap={12} style={{ flexWrap: 'nowrap', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                      <Col gap={5} style={{ flex: 1, minWidth: 0 }}>
                        <Row gap={8} style={{ justifyContent: 'space-between' }}>
                          <b style={{ fontSize: 13, color: 'var(--ink)' }}>{d.nome}</b>
                          <Muted size={11.5}>{d.frac}</Muted>
                        </Row>
                        <Bar pct={d.pct} color={m.color} h={6} />
                      </Col>
                      <b style={{ width: 42, textAlign: 'right', fontSize: 13, color: m.color }}>{d.pct}%</b>
                      <div style={{ width: 54, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}><Tag kind={m.tag}>{d.prio}</Tag></div>
                    </Row>
                  )
                })}
              </Col>
            )}
            <Row gap={14} style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <Muted size={11}><span style={{ color: 'var(--danger)' }}>●</span> &lt; 30% prioridade alta</Muted>
              <Muted size={11}><span style={{ color: 'var(--accentInk)' }}>●</span> 30–59% média</Muted>
              <Muted size={11}><span style={{ color: 'var(--ok)' }}>●</span> 60%+ ok</Muted>
            </Row>
          </Card>
        }
        aside={
          <Card pad={24}>
            {questao ? (
              <>
                <Row gap={8} style={{ justifyContent: 'space-between' }}>
                  <Col gap={2}>
                    <H3>Caderno de reforço</H3>
                    <Muted size={12}>Questão 1 de {fmtInt(questoesHoje)} · selecionadas pelos seus erros recentes</Muted>
                  </Col>
                  <Row gap={5} style={{ flexWrap: 'nowrap' }}>
                    {Array.from({ length: questoesHoje }).map((_, i) => (
                      <span key={i} style={{ width: i === 0 ? 18 : 7, height: 7, borderRadius: 99, background: i === 0 ? 'var(--gold)' : 'var(--track)' }} />
                    ))}
                  </Row>
                </Row>
                {chipsFracas.length > 0 && <Chips items={['Todas', ...chipsFracas]} active={0} />}
                <Row gap={8} style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                  {questao.disciplina && <Tag kind="brand">{questao.disciplina}</Tag>}
                  {questao.ano != null && <Tag kind="gold">{questao.ano}</Tag>}
                  {questao.prova && <Muted size={12.5}>{questao.prova}</Muted>}
                </Row>
                <H2 style={{ fontSize: 18 }}>{questao.enunciado}</H2>
                <Col gap={10}>
                  {questao.alternativas.map((a) => (
                    <Row key={a.letra} gap={14} style={{ flexWrap: 'nowrap', alignItems: 'flex-start', padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)' }}>
                      <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9, background: 'var(--surface2)', color: 'var(--ink)', fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{a.letra}</span>
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
                  <Btn kind="secondary" icon="chat" href="#">Comentário</Btn>
                  <Btn kind="secondary" icon="chart" href="#">Estatísticas</Btn>
                </Row>
              </>
            ) : (
              <Col gap={6}>
                <H3>Caderno de reforço</H3>
                <Muted size={12.5}>Sem questões de reforço no momento — você está em dia nas matérias com histórico. Continue praticando no banco de questões.</Muted>
                <Btn kind="gold" icon="play" href={R.banco} style={{ marginTop: 6, width: 'fit-content' }}>Ir para o banco</Btn>
              </Col>
            )}
          </Card>
        }
      />
    </>
  )
}
