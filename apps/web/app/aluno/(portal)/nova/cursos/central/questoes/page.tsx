// Questões e Simulados — aba "Simulados". Catálogo de simulados em cards pôster + painel do aluno.
// TUDO com DADO REAL: catálogo (carregarCatalogoSimulados), painel/gamificação (carregarHome: nível/XP/
// sequência/missões/meta/cronograma) e desempenho por matéria (carregarDesempenho). Server component,
// backend-first (só lê snapshots). Blocos sem fonte real foram removidos (nada fictício).
import {
  Card, Soft, Grid, Row, Col, Split, Hero, H2, H3, Muted, P,
  Tag, Btn, IBtn, Bar, GBAR, Cover, GR, Media, Crumbs, Tabs, Chips, Aviso, IconBox,
} from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarCatalogoSimulados } from '@/lib/aluno/catalogo-simulados'
import { carregarHome } from '@/lib/home/snapshot'
import { carregarDesempenho } from '@/lib/desempenho/snapshot'

export const dynamic = 'force-dynamic'

type SimCard = { key: string; linha: string; sigla: string; grad: string; capa: string | null; info: string; titulo: string; href: string; acao: string; continuar?: boolean }
type PastaCard = { key: string; linha: string; sigla: string; grad: string; capa: string | null; qtd: string; nome: string; href: string }

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const PALETA = Object.values(GR)
function gradDe(cor: string | null | undefined, i: number): string {
  if (cor) return `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 55%, #0b0a1a))`
  return PALETA[i % PALETA.length]
}
function abreviar(txt: string, max = 20): string {
  const t = (txt || 'Simulado').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Catálogo REAL do aluno: recentes (a fazer / em andamento), pastas (grupos) e outros (avulsos). */
async function carregarCatalogo(sessao: { tenantId: string; estudanteId: string; nome: string } | null): Promise<{ nome: string; recentes: SimCard[]; pastas: PastaCard[]; outros: SimCard[] }> {
  const vazio = { nome: sessao?.nome ?? 'Aluno', recentes: [] as SimCard[], pastas: [] as PastaCard[], outros: [] as SimCard[] }
  if (!sessao) return vazio
  try {
    const svc = createAdminClient()
    const { itens, grupos, grupoPorSim } = await carregarCatalogoSimulados(svc, sessao.tenantId, sessao.estudanteId)
    if (!itens.length) return vazio
    const feitosSet = new Set(itens.filter((i) => (i.finalizadas ?? 0) > 0).map((i) => i.id))
    const nomePorGrupo = new Map<string, string>(grupos.map((g) => [g.id, g.nome]))
    const grupoDe = (id: string) => grupoPorSim[id] ?? null

    const toSimCard = (i: any, idx: number): SimCard => {
      const gid = grupoDe(i.id)
      const grupoNome = gid ? nomePorGrupo.get(gid) : null
      const podeRodar = !!i.embed_token && (i.podeFazer || i.podeAguardar)
      return {
        key: i.id,
        linha: abreviar((grupoNome ?? i.statusLabel ?? 'Simulado').toUpperCase(), 22),
        sigla: abreviar(i.titulo, 18),
        grad: gradDe(i.vis?.cor, idx),
        capa: i.vis?.capa ?? null,
        info: i.quando ?? i.statusLabel ?? '',
        titulo: i.titulo,
        href: podeRodar ? `/simulado/${i.embed_token}` : i.finalizadas > 0 ? `/aluno/simulados/${i.id}` : R.resultado,
        acao: i.emAndamento ? 'Continuar' : i.refazer ? 'Refazer' : podeRodar ? 'Fazer agora' : i.finalizadas > 0 ? 'Ver resultados' : 'Indisponível',
        continuar: !!i.emAndamento,
      }
    }

    const lancamento = (i: any) => new Date(i.regras?.publicado_em ?? i.created_at ?? 0).getTime()
    const recentesItens = itens
      .filter((i) => (i.podeFazer || i.emAndamento || i.statusLabel === 'Agendado') && (!feitosSet.has(i.id) || i.emAndamento))
      .sort((a, b) => lancamento(b) - lancamento(a))
      .slice(0, 6)
    const recentes = recentesItens.map(toSimCard)
    const recentesIds = new Set(recentesItens.map((i) => i.id))

    const contar = (gid: string) => itens.filter((i) => grupoDe(i.id) === gid).length
    const pastas: PastaCard[] = grupos.map((g, idx) => {
      const n = contar(g.id)
      return { key: g.id, linha: abreviar((g.nome ?? '').toUpperCase(), 24), sigla: abreviar(g.nome, 14), grad: gradDe(g.cor, idx), capa: g.capaCard ?? g.capa ?? null, qtd: `${fmtInt(n)} simulado${n === 1 ? '' : 's'}`, nome: g.nome, href: R.banco }
    })

    const outros = itens.filter((i) => !grupoDe(i.id) && !recentesIds.has(i.id)).slice(0, 6).map(toSimCard)
    return { nome: sessao.nome, recentes, pastas, outros }
  } catch {
    return vazio
  }
}

export default async function SimuladosPage() {
  const sessao = await getSessaoAluno()
  const svc = sessao ? createAdminClient() : null
  const [cat, home, desemp] = await Promise.all([
    carregarCatalogo(sessao),
    sessao && svc ? carregarHome(svc, sessao.tenantId, sessao.estudanteId) : Promise.resolve(null),
    sessao && svc ? carregarDesempenho(svc, sessao.tenantId, sessao.estudanteId) : Promise.resolve(null),
  ])
  const primeiroNome = (cat.nome || 'Aluno').split(' ')[0]
  const u = home?.homeData?.usuario ?? null
  const seq = home?.homeData?.sequenciaMeta ?? null
  const missoes = home?.homeData?.missoes ?? []
  const xpFalta = u ? Math.max(0, (u.xpNivelMax ?? 0) - (u.xpNivelAtual ?? 0)) : 0
  const pctNivel = u && u.xpNivelMax ? Math.round(((u.xpNivelAtual ?? 0) / u.xpNivelMax) * 100) : 0

  // Próximos no cronograma (metas reais da semana, hoje em diante) — do snapshot da Início.
  const proximos: { dia: string; num: string; titulo: string; sub: string | null; href: string }[] = []
  for (const d of home?.diasCal ?? []) {
    if (!d.hoje && new Date(d.iso) < new Date((home?.diasCal ?? []).find((x) => x.hoje)?.iso ?? d.iso)) continue
    for (const it of (home?.agendaCal?.[d.iso] ?? [])) {
      if (proximos.length >= 3) break
      proximos.push({ dia: d.wd.toUpperCase().slice(0, 3), num: String(d.dia).padStart(2, '0'), titulo: it.titulo, sub: it.contexto ?? it.tag ?? null, href: it.href ?? R.cronograma })
    }
  }

  // Continue de onde parou — primeiro simulado em andamento do catálogo (real).
  const emAndamento = cat.recentes.find((s) => s.continuar) ?? null
  const porMateria = (desemp?.porDisciplina ?? []).slice(0, 6)

  return (
    <>
      <Crumbs items={[['Central de Estudos', R.central], ['Questões e Simulados', R.questoes]]} />
      <Tabs items={['Simulados', 'Banco de questões', 'Realizados', 'Recomendado']} links={[R.questoes, R.banco, R.realizados, R.recomendado]} active={0} />

      <Split
        right="340px"
        main={
          <Col gap={26}>
            {/* Saudação */}
            <Col gap={6}>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--ink)' }}>Olá, {primeiroNome} 👋</h2>
              {u ? (
                <Muted size={14}>Continue sua trilha — faltam <b style={{ color: 'var(--ink)' }}>{fmtInt(xpFalta)} XP</b> para o próximo nível.</Muted>
              ) : (
                <Muted size={14}>Escolha um simulado e comece a treinar.</Muted>
              )}
            </Col>

            {/* Progresso + Continue (REAIS) */}
            <Grid cols={2} gap={16}>
              {u && (
                <Card>
                  <Row gap={16} style={{ flexWrap: 'nowrap' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(var(--brand) ${pctNivel}%, var(--track) 0)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface)', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                        <b style={{ fontSize: 20, color: 'var(--ink)' }}>{u.nivel}</b>
                        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.1em', color: 'var(--muted)' }}>NÍVEL</span>
                      </span>
                    </div>
                    <Col gap={6} style={{ flex: 1, minWidth: 0 }}>
                      <Row gap={8} style={{ justifyContent: 'space-between' }}>
                        <H3>{u.tituloNivel || 'Seu nível'}</H3>
                        <Muted size={12}>{fmtInt(u.xpNivelAtual ?? 0)} / {fmtInt(u.xpNivelMax ?? 0)} XP</Muted>
                      </Row>
                      <Bar pct={pctNivel} color={GBAR} />
                      <Muted size={12}>Faltam <b style={{ color: 'var(--ink)' }}>{fmtInt(xpFalta)} XP</b> para o próximo nível</Muted>
                    </Col>
                  </Row>
                  <Row gap={0} style={{ flexWrap: 'nowrap', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                    {[[fmtInt(desemp?.simulados ?? 0), 'Simulados feitos'], [desemp?.totalQuestoes != null ? fmtInt(desemp.totalQuestoes) : '—', 'Questões resolvidas'], [desemp?.acertoMedio != null ? `${desemp.acertoMedio}%` : '—', 'Taxa de acerto']].map(([v, l]) => (
                      <Col key={l} gap={2} style={{ flex: 1 }}>
                        <b style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>{v}</b>
                        <Muted size={11.5}>{l}</Muted>
                      </Col>
                    ))}
                  </Row>
                </Card>
              )}

              {emAndamento && (
                <Card>
                  <Row gap={8} style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: 'var(--muted)' }}>CONTINUE DE ONDE PAROU</span>
                  </Row>
                  <Row gap={12} style={{ flexWrap: 'nowrap' }}>
                    <Media ratio="16:9" img={emAndamento.capa} radius={12} style={{ width: 92, flexShrink: 0 }} fallback={<Cover line={emAndamento.linha} sigla={emAndamento.sigla} grad={emAndamento.grad} big={16} />} />
                    <Col gap={3} style={{ flex: 1, minWidth: 0 }}>
                      <H3>{emAndamento.titulo}</H3>
                      <Muted size={12.5}>{emAndamento.info}</Muted>
                    </Col>
                  </Row>
                  <Row gap={10} style={{ marginTop: 'auto' }}>
                    <Btn kind="primary" icon="play" href={emAndamento.href} style={{ flex: 1 }}>Retomar simulado</Btn>
                  </Row>
                </Card>
              )}
            </Grid>

            {/* Simulados recentes (REAL) */}
            {cat.recentes.length > 0 && (
              <Col gap={14}>
                <H2><Icon n="play" size={16} /> Simulados recentes</H2>
                <Grid cols={3} gap={16}>
                  {cat.recentes.map((s) => (
                    <Card key={s.key} pad={0} style={{ overflow: 'hidden', gap: 0 }}>
                      <Media ratio="16:9" img={s.capa} fallback={<Cover line={s.linha} sigla={s.sigla} grad={s.grad} />} />
                      <Col gap={10} style={{ padding: 16, flex: 1 }}>
                        <Muted size={12}>{s.info}</Muted>
                        <b style={{ fontSize: 14, color: 'var(--ink)' }}>{s.titulo}</b>
                        <Btn kind="primary" icon="play" href={s.href} style={{ marginTop: 'auto' }}>{s.acao}</Btn>
                      </Col>
                    </Card>
                  ))}
                </Grid>
              </Col>
            )}

            {/* Desempenho por matéria (REAL: acerto por disciplina nos simulados) */}
            {porMateria.length > 0 && (
              <Card>
                <Row gap={8} style={{ justifyContent: 'space-between' }}>
                  <H3><Icon n="chart" size={15} /> Desempenho por matéria</H3>
                  <Btn kind="link" href={R.desempenho}>Ver desempenho</Btn>
                </Row>
                <Col gap={12}>
                  {porMateria.map((m) => (
                    <Row key={m.nome} gap={12} style={{ flexWrap: 'nowrap' }}>
                      <span style={{ width: 170, flexShrink: 0, fontSize: 13, color: 'var(--ink)' }}>{m.nome}</span>
                      <Bar pct={m.aluno} color={m.aluno >= 70 ? 'var(--ok)' : m.aluno >= 50 ? 'var(--gold)' : 'var(--brand)'} style={{ flex: 1 }} />
                      <b style={{ width: 42, textAlign: 'right', fontSize: 13, color: 'var(--ink)' }}>{m.aluno}%</b>
                    </Row>
                  ))}
                </Col>
                {porMateria.length > 0 && (
                  <Aviso icon="bulb" action={<Btn kind="link" href={R.banco}>Treinar</Btn>}>
                    Seu ponto de atenção é <b>{[...porMateria].sort((a, b) => a.aluno - b.aluno)[0].nome}</b>. Que tal treinar questões dessa matéria?
                  </Aviso>
                )}
              </Card>
            )}

            {/* Pastas de simulados (REAL) */}
            {cat.pastas.length > 0 && (
              <Col gap={14}>
                <H2><Icon n="layers" size={16} /> Pastas de simulados</H2>
                <Grid cols={3} gap={16}>
                  {cat.pastas.map((p) => (
                    <a key={p.key} href={p.href}>
                      <Card pad={0} style={{ overflow: 'hidden', gap: 0, flexDirection: 'row', minHeight: 96 }}>
                        <div style={{ width: 128, flexShrink: 0 }}>
                          <Media ratio="16:9" img={p.capa} style={{ height: '100%' }} fallback={<Cover line={p.linha} sigla={p.sigla} grad={p.grad} big={15} />} />
                        </div>
                        <Col gap={6} style={{ padding: 14, flex: 1, minWidth: 0, justifyContent: 'center' }}>
                          <Muted size={12}><Icon n="file" size={12} /> {p.qtd}</Muted>
                          <b style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.3 }}>{p.nome}</b>
                        </Col>
                      </Card>
                    </a>
                  ))}
                </Grid>
              </Col>
            )}

            {/* Outros simulados (REAL — avulsos) */}
            {cat.outros.length > 0 && (
              <Col gap={14}>
                <Row gap={8}>
                  <H2>Outros simulados</H2>
                  <Tag kind="green" icon="check">Disponíveis · {cat.outros.length}</Tag>
                </Row>
                <Grid cols={2} gap={16}>
                  {cat.outros.map((o) => (
                    <Card key={o.key} pad={0} style={{ overflow: 'hidden', gap: 0, flexDirection: 'row' }}>
                      <div style={{ width: 120, flexShrink: 0 }}>
                        <Media ratio="2:3" img={o.capa} style={{ height: '100%' }} fallback={<Cover line={o.linha} sigla={o.sigla} grad={o.grad} big={16} />} />
                      </div>
                      <Col gap={8} style={{ padding: 16, flex: 1, minWidth: 0 }}>
                        <Muted size={12}>{o.info}</Muted>
                        <b style={{ fontSize: 14, color: 'var(--ink)' }}>{o.titulo}</b>
                        <Btn kind="primary" icon="play" href={o.href} style={{ marginTop: 'auto' }}>{o.acao}</Btn>
                      </Col>
                    </Card>
                  ))}
                </Grid>
              </Col>
            )}

            {cat.recentes.length === 0 && cat.pastas.length === 0 && cat.outros.length === 0 && (
              <Card>
                <Aviso icon="book" action={<Btn kind="secondary" icon="arrow" href={R.banco}>Banco de questões</Btn>}>
                  Você ainda não tem simulados liberados. Assim que o Revisão publicar, eles aparecem aqui, {primeiroNome}.
                </Aviso>
              </Card>
            )}
          </Col>
        }
        aside={
          <Col gap={18}>
            {/* Meta diária (REAL) */}
            {seq && (seq.metaDiariaXp ?? 0) > 0 && (
              <Card>
                <Row gap={8} style={{ justifyContent: 'space-between' }}>
                  <H3><Icon n="target" size={15} /> Meta diária</H3>
                  <Muted size={12}>{fmtInt(seq.xpHoje ?? 0)} / {fmtInt(seq.metaDiariaXp)} XP</Muted>
                </Row>
                <Bar pct={seq.metaDiariaXp ? Math.min(100, Math.round(((seq.xpHoje ?? 0) / seq.metaDiariaXp) * 100)) : 0} color={GBAR} />
                <Muted size={12.5}>Um simulado hoje garante sua sequência.</Muted>
              </Card>
            )}

            {/* Sequência (REAL) */}
            {seq && seq.semana && seq.semana.length > 0 && (
              <Card>
                <H3><Icon n="flame" size={15} style={{ color: '#E0820A' }} /> Sequência · {fmtInt(seq.diasSeguidos ?? 0)} {(seq.diasSeguidos ?? 0) === 1 ? 'dia' : 'dias'}</H3>
                <Row gap={6} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  {seq.semana.map((d, i) => (
                    <Col key={i} gap={5} style={{ alignItems: 'center', flex: 1 }}>
                      <Muted size={10}>{(d.dia || '').slice(0, 3)}</Muted>
                      <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: d.estudou ? 'var(--peachBg)' : 'var(--surface2)', color: d.estudou ? '#E0820A' : 'var(--muted2)', outline: d.hoje ? '2px solid var(--brand)' : 'none' }}>
                        <Icon n="flame" size={14} />
                      </span>
                    </Col>
                  ))}
                </Row>
                {(seq.bauDias ?? 0) > 0 && (
                  <Soft>
                    <Muted size={12}><Icon n="trophy" size={12} /> Baú da sequência: <b style={{ color: 'var(--accentInk)' }}>+{fmtInt(seq.bauXp ?? 0)} XP</b> ao manter {fmtInt(seq.bauDias)} dias.</Muted>
                  </Soft>
                )}
              </Card>
            )}

            {/* Missões (REAIS) */}
            {missoes.length > 0 && (
              <Card>
                <Row gap={8} style={{ justifyContent: 'space-between' }}>
                  <H3><Icon n="bolt" size={15} /> Missões de hoje</H3>
                  <Muted size={11}>renova à meia-noite</Muted>
                </Row>
                <Col gap={12}>
                  {missoes.map((m, i) => (
                    <Row key={i} gap={10} style={{ flexWrap: 'nowrap' }}>
                      <IconBox icon="bolt" s={34} />
                      <Col gap={3} style={{ flex: 1, minWidth: 0 }}>
                        <Row gap={6} style={{ justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{m.titulo}</span>
                          <b style={{ fontSize: 12, color: 'var(--brand)' }}>+{fmtInt(m.xp)} XP</b>
                        </Row>
                        <Muted size={11}>{fmtInt(m.progresso)}/{fmtInt(m.total)}</Muted>
                      </Col>
                    </Row>
                  ))}
                </Col>
              </Card>
            )}

            {/* Próximos no cronograma (REAIS) */}
            {proximos.length > 0 && (
              <Card>
                <Row gap={8} style={{ justifyContent: 'space-between' }}>
                  <H3><Icon n="cal" size={15} /> Próximos no cronograma</H3>
                  <Btn kind="link" href={R.cronograma}>Abrir</Btn>
                </Row>
                <Col gap={10}>
                  {proximos.map((a, i) => (
                    <a key={i} href={a.href}>
                      <Row gap={12} style={{ flexWrap: 'nowrap' }}>
                        <Col gap={0} style={{ width: 40, flexShrink: 0, alignItems: 'center', padding: '6px 0', borderRadius: 10, background: 'var(--surface2)' }}>
                          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', color: 'var(--muted)' }}>{a.dia}</span>
                          <b style={{ fontSize: 16, color: 'var(--ink)' }}>{a.num}</b>
                        </Col>
                        <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <b style={{ fontSize: 13, color: 'var(--ink)' }}>{a.titulo}</b>
                          {a.sub && <Muted size={11.5}>{a.sub}</Muted>}
                        </Col>
                      </Row>
                    </a>
                  ))}
                </Col>
              </Card>
            )}
          </Col>
        }
      />
    </>
  )
}
