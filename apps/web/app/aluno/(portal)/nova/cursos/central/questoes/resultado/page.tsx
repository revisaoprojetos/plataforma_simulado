// Questões e Simulados — "Resultado" (ResultadoRevisao). Nota, acertos/erros por matéria,
// ranking, tempo e revisão por questão. SEM abas de seção. Porte fiel do canvas.
// Server component LIGADO A DADOS REAIS: carrega o RESULTADO DA SESSÃO FINALIZADA MAIS RECENTE
// do aluno logado, reusando os mesmos loaders do "Simulados realizados"
// (montarResultadoAluno + montarRankingResultado + montarComparativo).
import {
  Card, Grid, Row, Col, H3, Muted, Btn, Bar, Crumbs, Hero,
} from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { montarResultadoAluno, type SessaoInput } from '@/lib/simulado/resultado-aluno'
import { montarRankingResultado } from '@/lib/simulado/ranking-resultado'
import { montarComparativo } from '@/lib/simulado/comparativo'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'

export const dynamic = 'force-dynamic'

// ——— formatadores (pt-BR / BRT) ———
const fmtNota = (n: number | null | undefined) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))
const fmtDataFull = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : '—'
const fmtTotal = (ms: number) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}min` }
const fmtPorQ = (ms: number) => { const m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000); return m > 0 ? `${m}min ${String(s).padStart(2, '0')}s` : `${s}s` }
const nInt = (n: number) => n.toLocaleString('pt-BR')
const MODO_LABEL: Record<string, string> = { janela_fixa: 'Janela fixa', prazo_relativo: 'Prazo relativo', aberto: 'Aberto' }

type Res = 'ok' | 'erro' | 'branco'
const RES_COR: Record<Res, string> = { ok: 'var(--ok)', erro: 'var(--danger)', branco: 'var(--muted2)' }

export default async function ResultadoPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) return <VazioResultado motivo="entrar" />

  const svc = createAdminClient()
  const estId = sessao.estudanteId

  // Sessão finalizada MAIS RECENTE do aluno (qualquer simulado) → define qual resultado exibir.
  const { data: ultima } = await svc
    .from('simulado_sessoes_prova')
    .select('simulado_id')
    .eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
    .order('finalizado_em', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle()
  if (!ultima?.simulado_id) return <VazioResultado motivo="sem-sessao" />
  const simId = ultima.simulado_id as string

  // Simulado + TODAS as sessões finalizadas do aluno nesse simulado (em paralelo).
  const [{ data: sim }, { data: sess }] = await Promise.all([
    svc.from('simulado_simulados').select('id, titulo, regras, status, modo_aplicacao, data_inicio, data_fim, created_at').eq('id', simId).maybeSingle(),
    svc.from('simulado_sessoes_prova')
      .select('id, status, nota, iniciado_em, finalizado_em, posicao_ranking, tentativa_num')
      .eq('estudante_id', estId).eq('simulado_id', simId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada'),
  ])
  if (!sim) return <VazioResultado motivo="sem-sessao" />
  const finalizadas = (sess ?? []) as any[]
  if (!finalizadas.length) return <VazioResultado motivo="sem-sessao" />

  // Melhor tentativa (nota; desempate pela mais recente) — usada no hero.
  const melhor = [...finalizadas].sort((a, b) => (Number(b.nota ?? -1) - Number(a.nota ?? -1)) || (new Date(b.finalizado_em ?? 0).getTime() - new Date(a.finalizado_em ?? 0).getTime()))[0]

  const { data: estRow } = await svc.from('simulado_estudantes').select('classificacao').eq('id', estId).maybeSingle()
  const { notaLiberada, gabaritoLiberado } = resolverLiberacoes(sim.regras as any, sim as any, { classificacao: (estRow as any)?.classificacao ?? null })

  const sessoesInput: SessaoInput[] = finalizadas.map((s) => ({
    id: s.id, tentativa_num: s.tentativa_num, nota: s.nota, iniciado_em: s.iniciado_em, finalizado_em: s.finalizado_em, posicao_ranking: s.posicao_ranking,
  }))

  // Resultado consolidado + ranking real + comparativo da turma (por matéria) — em paralelo.
  // Ranking/comparativo são tolerantes a falha (caem em null → cards usam o que tiverem).
  const [{ tentativas, questoes, totalQuestoes }, rankReal, comparativo] = await Promise.all([
    montarResultadoAluno(svc, simId, sessoesInput, gabaritoLiberado),
    montarRankingResultado(svc, simId, estId, sessao.tenantId, null, { minhaNota: melhor.nota != null ? Number(melhor.nota) : null }).catch(() => null),
    montarComparativo(svc, simId, { minhaNota: melhor.nota != null ? Number(melhor.nota) : null, minhaSessaoId: melhor.id }, sessao.tenantId).catch(() => null),
  ])

  const melhorT = tentativas.find((t) => t.id === melhor.id) ?? tentativas[0]
  const acertos = melhorT?.acertos ?? 0
  const total = melhorT?.total ?? totalQuestoes
  const pct = melhorT?.pct ?? 0
  const tempoMs = melhorT?.tempoMs ?? 0
  const notaVal = melhorT?.nota ?? (melhor.nota != null ? Number(melhor.nota) : null)
  const posicao = rankReal?.posicao ?? melhorT?.posicao ?? null
  const participantes = rankReal?.participantes ?? comparativo?.participantes ?? null

  // Acerto por matéria: fração (ac/tt) e meu % vêm da melhor tentativa; a média da turma vem do comparativo.
  const turmaDeDisc = new Map<string, number>((comparativo?.porDisciplina ?? []).map((d) => [d.nome, d.turmaPct]))
  const materias = (melhorT?.porDisc ?? []).map((d) => ({
    nome: d.nome, frac: `${d.ac}/${d.tt}`, pct: d.pct,
    turma: turmaDeDisc.has(d.nome) ? turmaDeDisc.get(d.nome)! : d.pct, // fallback: sem comparativo, marcador fica no próprio %
  }))

  // Ranking: top real + a linha "Você" (própria linha nunca anonimizada; terceiros só iniciais — já vêm assim do loader).
  const rankRows = (() => {
    if (!rankReal) return null
    const rows = [...rankReal.top]
    if (!rows.some((p) => p.voce)) rows.push(rankReal.voce)
    return rows.map((p) => ({ pos: `${p.posicao}º`, nome: p.voce ? 'Você' : p.iniciais, nota: fmtNota(p.nota), voce: p.voce }))
  })()

  const META: { icon: IconName; label: string }[] = [
    { icon: 'cal', label: fmtDataFull(melhor.finalizado_em) },
    { icon: 'grid', label: MODO_LABEL[String(sim.modo_aplicacao)] ?? 'Simulado' },
    { icon: 'clip', label: `${nInt(totalQuestoes)} questões` },
    { icon: 'layers', label: `${finalizadas.length} ${finalizadas.length === 1 ? 'realização' : 'realizações'}` },
  ]

  // Grade de revisão (status por questão, na ordem da prova).
  const statusQ = (q: typeof questoes[number]): Res => (q.anulada || q.acertou > 0 ? 'ok' : q.errou > 0 ? 'erro' : 'branco')
  const grade = questoes.map((q) => ({ ordem: q.ordem, res: statusQ(q) }))

  const cadernoHref = `/imprimir/resultado/${melhor.id}`

  return (
    <>
      <Crumbs items={[['Central de Estudos', R.central], ['Questões e Simulados', R.questoes], ['Resultado', '#']]} />

      {/* Hero do resultado */}
      <Hero bg="linear-gradient(120deg,#2E1F6A 0%,#4A31B8 60%,#5B3FD0 100%)">
        <Row gap={24} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Col gap={14} style={{ minWidth: 280, flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.2em', color: '#F1C232' }}>RESULTADO</span>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.1 }}>{fmtDataFull(melhor.finalizado_em)} – {sim.titulo}</h2>
            <Row gap={8}>
              {META.map((m) => (
                <span key={m.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 99, background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                  <Icon n={m.icon} size={13} />{m.label}
                </span>
              ))}
            </Row>
          </Col>
          <Col gap={12} style={{ alignItems: 'flex-end' }}>
            <Col gap={2} style={{ alignItems: 'flex-end' }}>
              <b style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.04em', color: '#F1C232', lineHeight: 1 }}>{notaLiberada ? fmtNota(notaVal) : '—'}</b>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: '#CFC4FF' }}>
                {posicao && participantes ? `MELHOR NOTA · ${posicao}º DE ${nInt(participantes)}` : 'MELHOR NOTA'}
              </span>
            </Col>
            <Row gap={10}>
              <Btn kind="ghostdark" icon="file" href={cadernoHref}>Caderno</Btn>
              <Btn kind="gold" icon="shuffle" href={R.questoes}>Refazer simulado</Btn>
            </Row>
          </Col>
        </Row>
      </Hero>

      {/* Resumo da nota */}
      <Grid cols={4} gap={12}>
        <Card pad={16}><Col gap={2}><b style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{notaLiberada ? fmtNota(notaVal) : '—'}</b><Muted size={12.5}>Nota</Muted></Col></Card>
        <Card pad={16}><Col gap={2}><b style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{nInt(acertos)}/{nInt(total)}</b><Muted size={12.5}>Acertos · {pct}%</Muted></Col></Card>
        <Card pad={16}><Col gap={2}><b style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{tempoMs ? fmtTotal(tempoMs) : '—'}</b><Muted size={12.5}>Tempo total{tempoMs && total ? ` · ${fmtPorQ(tempoMs / total)} por questão` : ''}</Muted></Col></Card>
        <Card pad={16}><Col gap={2}><b style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{posicao ? `${posicao}º` : '—'}</b><Muted size={12.5}>{participantes ? `de ${nInt(participantes)} alunos` : 'Posição'}</Muted></Col></Card>
      </Grid>

      {/* Acerto por matéria + Ranking */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <Card>
          <Col gap={2}>
            <H3><Icon n="chart" size={15} /> Acerto por matéria</H3>
            <Muted size={12}>Seu acerto × média da turma</Muted>
          </Col>
          <Col gap={16}>
            {materias.length === 0 && <Muted size={12.5}>Sem respostas por matéria nesta realização.</Muted>}
            {materias.map((m) => (
              <Col key={m.nome} gap={6}>
                <Row gap={8} style={{ justifyContent: 'space-between' }}>
                  <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{m.nome}</b>
                  <Muted size={12}>{m.frac} · <b style={{ color: 'var(--ink)' }}>{m.pct}%</b> · turma {m.turma}%</Muted>
                </Row>
                <div style={{ position: 'relative' }}>
                  <Bar pct={m.pct} color={m.pct >= 60 ? 'var(--ok)' : m.pct >= 40 ? 'var(--gold)' : 'var(--danger)'} h={10} />
                  <span title={`Média da turma ${m.turma}%`} style={{ position: 'absolute', top: -2, left: `${m.turma}%`, width: 2, height: 14, background: 'var(--ink)', borderRadius: 2 }} />
                </div>
              </Col>
            ))}
          </Col>
        </Card>

        <Card>
          <H3><Icon n="trophy" size={15} /> Ranking</H3>
          <Col gap={0}>
            {!rankRows && <Muted size={12.5}>Ranking disponível quando o resultado for liberado.</Muted>}
            {(rankRows ?? []).map((r, i) => (
              <Row key={`${r.pos}-${i}`} gap={12} style={{ flexWrap: 'nowrap', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)', background: r.voce ? 'var(--chip)' : 'transparent', borderRadius: r.voce ? 10 : 0, paddingLeft: r.voce ? 10 : 0, paddingRight: r.voce ? 10 : 0 }}>
                <b style={{ width: 44, fontSize: 13, color: r.voce ? 'var(--brand)' : 'var(--muted)' }}>{r.pos}</b>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: r.voce ? 800 : 700, color: 'var(--ink)' }}>{r.nome}</span>
                <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{r.nota}</b>
              </Row>
            ))}
          </Col>
        </Card>
      </div>

      {/* Tempo */}
      <Card>
        <H3><Icon n="clock" size={15} /> Tempo por questão</H3>
        <Grid cols={3} gap={16}>
          <Col gap={2}><b style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{tempoMs ? fmtTotal(tempoMs) : '—'}</b><Muted size={12.5}>Tempo total</Muted></Col>
          <Col gap={2}><b style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{tempoMs && total ? fmtPorQ(tempoMs / total) : '—'}</b><Muted size={12.5}>Média por questão</Muted></Col>
          {/* TODO(dados): tempo por questão não é exposto pelos loaders atuais (respostas.tempo_resposta_seg). */}
          <Col gap={2}><b style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>—</b><Muted size={12.5}>Mais demoradas</Muted></Col>
        </Grid>
      </Card>

      {/* Revisão por questão */}
      <Card>
        <Row gap={8} style={{ justifyContent: 'space-between' }}>
          <H3><Icon n="grid" size={15} /> Revisão por questão</H3>
          <Row gap={14}>
            <Muted size={11.5}><span style={{ color: 'var(--ok)' }}>●</span> Acertou</Muted>
            <Muted size={11.5}><span style={{ color: 'var(--danger)' }}>●</span> Errou</Muted>
            <Muted size={11.5}><span style={{ color: 'var(--muted2)' }}>●</span> Em branco</Muted>
          </Row>
        </Row>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 8 }}>
          {grade.map((g) => (
            <span key={g.ordem} title={`Questão ${g.ordem}`} style={{ aspectRatio: '1 / 1', borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, color: '#fff', background: RES_COR[g.res] }}>{g.ordem}</span>
          ))}
        </div>
      </Card>
    </>
  )
}

// Estado vazio elegante — sem sessão de aluno ou sem nenhum simulado finalizado.
function VazioResultado({ motivo }: { motivo: 'entrar' | 'sem-sessao' }) {
  return (
    <>
      <Crumbs items={[['Central de Estudos', R.central], ['Questões e Simulados', R.questoes], ['Resultado', '#']]} />
      <Card pad={40}>
        <Col gap={14} style={{ alignItems: 'center', textAlign: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: 'var(--chip)', color: 'var(--brand)' }}>
            <Icon n={motivo === 'entrar' ? 'lock' : 'clip'} size={24} />
          </span>
          <H3>{motivo === 'entrar' ? 'Entre para ver seu resultado' : 'Nenhum simulado concluído ainda'}</H3>
          <div style={{ maxWidth: 420 }}>
            <Muted size={13}>
              {motivo === 'entrar'
                ? 'Faça login na plataforma para acompanhar a nota, o ranking e a revisão dos seus simulados.'
                : 'Quando você finalizar um simulado, o resultado completo — nota, acerto por matéria, ranking e revisão — aparece aqui.'}
            </Muted>
          </div>
          <Btn kind="gold" icon="shuffle" href={R.questoes}>Ir para os simulados</Btn>
        </Col>
      </Card>
    </>
  )
}
