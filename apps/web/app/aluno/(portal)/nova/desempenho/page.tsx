// Meu Desempenho (novo) — DesempenhoRevisao. Porte fiel do canvas, agora com DADOS REAIS do aluno.
// Backend-first: a página só LÊ o snapshot pronto (lib/desempenho/snapshot.ts). Blocos de TEMPO por
// frente/período dependem do ledger de tempo (Fase 2) — enquanto não houver registro, mostram estado
// honesto (nunca número fictício).
import { Card, Soft, Grid, Row, Col, H3, Muted, P, Tag, Btn, Bar, GBAR, Stat, Seg, SecHead } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarDesempenho } from '@/lib/desempenho/snapshot'

export const dynamic = 'force-dynamic'

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const fmtNota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
const fmtDurMin = (min: number | null) => {
  if (min == null) return '—'
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return h > 0 ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m}min`
}
const fmtData = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleDateString('pt-BR')
}

// Estado honesto (sem número fake) para os blocos de tempo até a Fase 2 (ledger de tempo).
function EmBreveTempo({ texto }: { texto: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px', borderRadius: 14, background: 'var(--surface2)', border: '1px dashed var(--line)', color: 'var(--muted)' }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n="clock" size={16} /></span>
      <P size={12.5}>{texto}</P>
    </div>
  )
}

export default async function DesempenhoPage() {
  const sessao = await getSessaoAluno()
  const svc = sessao ? createAdminClient() : null
  const d = sessao && svc ? await carregarDesempenho(svc, sessao.tenantId, sessao.estudanteId) : null

  const totalQuestoes = d?.totalQuestoes ?? null
  const constancia = d?.constancia ?? Array(35).fill(0)
  const porDisc = d?.porDisciplina ?? []
  const evolucao = d?.evolucao ?? []
  const foco = d?.foco ?? null
  const metas = d?.metas ?? null
  const streak = d?.streak ?? 0
  const provaEm = fmtData(foco?.provaEm ?? null)

  // Chips reais do hero (só o que existe).
  const chips: string[] = []
  if (streak > 0) chips.push(`${streak} ${streak === 1 ? 'dia' : 'dias'} de sequência`)
  if (metas) chips.push(`${metas.pctSemana}% das metas da semana`)
  if ((d?.horasEstudo30d ?? 0) > 0) chips.push(`${fmtNota(d!.horasEstudo30d)}h nos últimos 30 dias`)
  if ((d?.simulados ?? 0) > 0) chips.push(`${fmtInt(d!.simulados)} ${d!.simulados === 1 ? 'simulado' : 'simulados'}`)

  // Indicadores: 100% reais.
  const INDICADORES = [
    { v: totalQuestoes != null ? fmtInt(totalQuestoes) : '—', l: 'Questões respondidas', s: d?.acertoMedio != null ? `${d.acertoMedio}% de acerto` : 'sem dados ainda', icon: 'qbook' as const },
    { v: fmtNota(d?.notaMedia ?? null), l: 'Média nos simulados', s: `${fmtInt(d?.simulados ?? 0)} ${(d?.simulados ?? 0) === 1 ? 'simulado feito' : 'simulados feitos'}`, icon: 'target' as const },
    { v: fmtNota(d?.melhorNota ?? null), l: 'Melhor nota', s: 'entre os seus simulados', icon: 'trophy' as const },
    { v: fmtDurMin(d?.tempoMedioMin ?? null), l: 'Tempo médio', s: 'por simulado', icon: 'clock' as const },
  ]

  // Evolução das notas (real) — últimas 10 para o gráfico.
  const evo = evolucao.slice(-10)
  const maxNota = Math.max(10, ...evo.map((e) => e.nota))
  const primeira = evolucao[0]?.nota ?? null
  const ultima = evolucao[evolucao.length - 1]?.nota ?? null
  const deltaNota = primeira != null && ultima != null ? Number((ultima - primeira).toFixed(1)) : null

  // Sugestões reais: as 3 disciplinas com menor acerto do aluno (com algum volume).
  const fracas = [...porDisc].sort((a, b) => a.aluno - b.aluno).slice(0, 3)

  return (
    <>
      {/* Faixa de resumo */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, background: 'linear-gradient(120deg,#160F33 0%,#241A52 55%,#2E1F6A 100%)', color: '#FFFFFF', padding: '28px 30px' }}>
        <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '44px 44px' }} />
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
          <Col gap={12} style={{ maxWidth: 560 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--gold)' }}>Meu desempenho</span>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>Meu Desempenho</h1>
            {foco && (
              <P size={13.5}><span style={{ color: '#D9CFFF' }}>Foco atual: <b style={{ color: '#fff' }}>{foco.nome}</b>{provaEm ? ` · prova em ${provaEm}` : ''}</span></P>
            )}
            {chips.length > 0 && (
              <Row gap={8}>
                {chips.map((t) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 11px', borderRadius: 99, background: 'rgba(241,194,50,.16)', color: 'var(--gold)', fontSize: 12, fontWeight: 700 }}>{t}</span>
                ))}
              </Row>
            )}
          </Col>
          <Col gap={10} style={{ alignItems: 'flex-end', textAlign: 'right' }}>
            <b style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--gold)', lineHeight: 1 }}>{d?.acertoMedio != null ? `${d.acertoMedio}%` : '—'}</b>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: '#CFC4FF' }}>DE ACERTO MÉDIO</span>
          </Col>
        </div>
      </section>

      {/* Indicadores (reais) */}
      <Grid cols={4} min={220}>
        {INDICADORES.map((i) => <Stat key={i.l} value={i.v} label={i.l} sub={i.s} icon={i.icon} />)}
      </Grid>

      {/* Evolução das notas (real) */}
      <Card>
        <SecHead title="Evolução das notas" sub="Suas notas nos simulados ao longo do tempo" />
        {evo.length === 0 ? (
          <Muted size={13}>Você ainda não finalizou simulados. Assim que fizer, a evolução das suas notas aparece aqui.</Muted>
        ) : (
          <>
            <Grid cols={3} min={200}>
              <Soft pad={16}>
                <b style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{fmtNota(primeira)} → {fmtNota(ultima)}</b>
                <Muted size={12}>primeira → última nota</Muted>
                {deltaNota != null && <b style={{ fontSize: 13, color: deltaNota >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{deltaNota >= 0 ? '+' : ''}{fmtNota(deltaNota)} pontos</b>}
              </Soft>
              <Soft pad={16}>
                <b style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{fmtNota(d?.melhorNota ?? null)}</b>
                <Muted size={12}>melhor nota</Muted>
              </Soft>
              <Soft pad={16}>
                <b style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{fmtInt(d?.simulados ?? 0)}</b>
                <Muted size={12}>simulados finalizados</Muted>
              </Soft>
            </Grid>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 180, padding: '8px 0' }}>
              {evo.map((e, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <b style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtNota(e.nota)}</b>
                  <div style={{ width: '100%', maxWidth: 40, height: Math.max(4, Math.round((e.nota / maxNota) * 130)), background: GBAR, borderRadius: 6 }} />
                  <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{e.rotulo}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Tempo por frente (Fase 2) + Constância (real) */}
      <Grid cols={2} min={340}>
        <Card>
          <SecHead title="Tempo por frente" sub="Horas por semana · por tipo de estudo" />
          {d?.tempoPorFrente && d.tempoPorFrente.length > 0 ? (
            <Col gap={10}>
              {d.tempoPorFrente.map((f) => (
                <Row key={f.frente} style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{f.frente}</span>
                  <b style={{ fontSize: 13, color: 'var(--ink)' }}>{f.horas}h</b>
                </Row>
              ))}
            </Col>
          ) : (
            <EmBreveTempo texto="Vamos passar a registrar o seu tempo de estudo por frente (leitura, LegProc, JurisClub, simulados). Assim que houver registro, ele aparece aqui — sem estimativas." />
          )}
        </Card>

        <Card>
          <H3>Constância</H3>
          <Muted size={12}>Sua intensidade de estudo nos últimos 35 dias.</Muted>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18px, 1fr))', gap: 4, marginTop: 6 }}>
            {constancia.map((n, i) => (
              <span key={i} aria-hidden style={{ aspectRatio: '1 / 1', borderRadius: 5, background: n === 0 ? 'var(--track)' : `color-mix(in srgb, var(--brand) ${n * 25}%, var(--track))` }} />
            ))}
          </div>
          <div style={{ height: 1, background: 'var(--line)', margin: '10px 0' }} />
          <H3>Divisão do tempo</H3>
          {d?.divisaoTempo && d.divisaoTempo.length > 0 ? (
            <Col gap={12}>
              {d.divisaoTempo.map((x) => (
                <div key={x.frente}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{x.frente}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}><b style={{ color: 'var(--ink)' }}>{x.pct}%</b></span>
                  </Row>
                  <Bar pct={x.pct} color={GBAR} style={{ marginTop: 6 }} />
                </div>
              ))}
            </Col>
          ) : (
            <EmBreveTempo texto="A divisão do seu tempo entre as frentes de estudo entra aqui quando o registro de tempo estiver ativo." />
          )}
        </Card>
      </Grid>

      {/* Raio-x por disciplina (real: você × turma) */}
      <Card>
        <SecHead title="Raio-x por disciplina" sub="Seu acerto em simulados por disciplina, comparado com a turma" />
        {porDisc.length === 0 ? (
          <Muted size={13}>Sem dados por disciplina ainda — eles aparecem conforme você responde questões e simulados.</Muted>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Disciplina', 'Seu acerto', 'Turma', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '0 12px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porDisc.map((r) => {
                  const diff = r.aluno - r.turma
                  return (
                    <tr key={r.nome} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '12px', fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{r.nome}</td>
                      <td style={{ padding: '12px' }}><MiniCell pct={r.aluno} c={r.aluno >= 70 ? 'var(--ok)' : r.aluno >= 50 ? 'var(--gold)' : 'var(--danger)'} /></td>
                      <td style={{ padding: '12px' }}><MiniCell pct={r.turma} c="var(--muted2)" /></td>
                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                        <Tag kind={diff >= 0 ? 'green' : 'red'}>{diff >= 0 ? `+${diff}` : diff} vs turma</Tag>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Sugestões para a semana (reais: disciplinas mais fracas) */}
      {fracas.length > 0 && (
        <Card>
          <SecHead title="Sugestões para a semana" sub="A partir dos seus números — onde você mais erra" />
          <Grid cols={3} min={260}>
            {fracas.map((f) => (
              <Card key={f.nome} style={{ background: 'var(--surface2)', border: '1px solid var(--line)' }}>
                <Row gap={12} style={{ alignItems: 'flex-start' }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n="shuffle" size={18} /></span>
                  <Col gap={4} style={{ flex: 1 }}>
                    <H3>Treinar {f.nome}</H3>
                    <P size={12.5}>Seu acerto nessa disciplina é de {f.aluno}% (turma: {f.turma}%). Praticar questões aqui tende a render mais.</P>
                  </Col>
                </Row>
                <Btn kind="secondary" size="sm" href={f.disciplinaId ? `${R.banco}?disciplina=${f.disciplinaId}` : R.banco} style={{ marginTop: 'auto', width: 'fit-content' }}>Treinar questões</Btn>
              </Card>
            ))}
          </Grid>
        </Card>
      )}
    </>
  )
}

function MiniCell({ pct, c }: { pct: number; c: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 70, height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: c, borderRadius: 99 }} /></span>
      <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{pct}%</b>
    </span>
  )
}
