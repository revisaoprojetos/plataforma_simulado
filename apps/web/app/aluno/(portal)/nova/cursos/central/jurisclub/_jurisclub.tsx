'use client'
// JurisClub — parte interativa (busca própria do clube + filtro por disciplina, exceção à regra de busca).
// Recebe dados REAIS do server (page.tsx) e filtra em memória. Layout fiel ao canvas (hero roxo, etapas,
// julgados + lateral). Cores via tokens; o degradê do hero é capa prevista.
import * as React from 'react'
import { Hero, Card, Row, Col, H3, Muted, P, Tag, Btn, Bar, Split, SecHead } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'

export type JulgadoView = {
  id: string
  tema: string
  texto: string
  ref: string
  corte: 'STF' | 'STJ' | null
  lido: boolean
  href: string
}
export type EdicaoItem = {
  id: string
  nome: string
  sub: string
  badge: string
  badgeKind: 'brand' | 'green' | 'gray' | 'gold'
  href: string
}
type EdicaoResumo = { id: string; nome: string; total: number; lidos: number; pct: number; href: string }

const NAV = ['Início', 'Julgados', 'Meu caderno', 'Edições']
// Buscas comuns = EXEMPLO (atalhos de UI). // TODO(dados): sugestões reais (termos mais buscados do clube).
const BUSCAS_COMUNS = ['Servidor público', 'Improbidade', 'Tributário', 'Súmulas do STJ']

export function JurisClub({
  alunoNome,
  edicao,
  julgados,
  disciplinas,
  edicoes,
}: {
  alunoNome: string
  edicao: EdicaoResumo
  julgados: JulgadoView[]
  disciplinas: string[]
  edicoes: EdicaoItem[]
}) {
  const [busca, setBusca] = React.useState('')
  const [disc, setDisc] = React.useState<string | null>(null)

  const termo = busca.trim().toLowerCase()
  const filtrados = julgados.filter((j) => {
    if (disc && j.tema !== disc) return false
    if (!termo) return true
    return (j.texto + ' ' + j.tema + ' ' + j.ref).toLowerCase().includes(termo)
  })
  const visiveis = filtrados.slice(0, 8)

  // Etapas do mês: a etapa "Caderno" é REAL (progresso por teses); as demais são EXEMPLO.
  // TODO(dados): Top 3 / Flashcards / Aprofundamento do mês não têm modelo próprio — ligar quando existir.
  const etapas = [
    { n: 1, estado: 'todo' as const, titulo: 'Comece pelo Top 3', desc: 'Os julgados do mês que você não pode deixar passar.', link: 'Top 3 Juris', href: edicao.href, exemplo: true },
    { n: 2, estado: 'atual' as const, titulo: 'Estude o Caderno', desc: 'Os julgados comentados do mês, por disciplina e tema.', link: 'Abrir o caderno', href: edicao.href, pct: edicao.pct, prog: `${edicao.lidos} de ${edicao.total} lidos` },
    { n: 3, estado: 'todo' as const, titulo: 'Fixe com flashcards', desc: 'As teses do mês em cartões de certo ou errado.', link: 'Flashcards do mês', href: edicao.href, exemplo: true },
    { n: 4, estado: 'todo' as const, titulo: 'Aprofunde', desc: 'Material de aprofundamento dentro de cada julgado.', link: 'Aprofundamento', href: edicao.href, exemplo: true },
  ]

  return (
    <>
      {/* Hero com nav + busca PRÓPRIA do clube (exceção à regra de busca) */}
      <Hero bg="linear-gradient(120deg,#160F33 0%,#241A52 55%,#2E1F6A 100%)" style={{ padding: '24px 28px' }}>
        <Col gap={20}>
          <Row style={{ justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,.12)', paddingBottom: 16 }}>
            <Row gap={16}>
              <span style={{ fontStyle: 'italic', fontWeight: 800, fontSize: 18, color: '#fff' }}>JurisClub</span>
              <Row gap={6}>
                {NAV.map((t, k) => (
                  <a key={t} href={k === 3 ? '#edicoes' : '#'} style={{ display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 14px', borderRadius: 10, fontSize: 13, fontWeight: k === 0 ? 800 : 700, background: k === 0 ? '#fff' : 'transparent', color: k === 0 ? 'var(--ink)' : '#E6DEFF' }}>{t}</a>
                ))}
              </Row>
            </Row>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>O seu Clube de Atualizações</span>
          </Row>

          <Col gap={10}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.2em', color: 'var(--gold)' }}>OLÁ, {alunoNome.toUpperCase()}</span>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>O que você quer estudar hoje?</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 16, padding: '8px 8px 8px 16px' }}>
              <Icon n="search" size={18} style={{ color: 'var(--muted)' }} />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Busque por tese, tema ou disciplina desta edição"
                aria-label="Buscar no JurisClub"
                style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14, color: 'var(--ink)' }}
              />
              {busca ? (
                <Btn kind="secondary" size="sm" icon="x" onClick={() => setBusca('')}>Limpar</Btn>
              ) : null}
            </div>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#C9BEF2' }}>Buscas comuns:</span>
              {BUSCAS_COMUNS.map((b) => (
                <button key={b} type="button" onClick={() => setBusca(b)} style={{ display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 12px', borderRadius: 99, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{b}</button>
              ))}
            </Row>
          </Col>
        </Col>
      </Hero>

      {/* Edição mais recente + etapas (Caderno = progresso REAL) */}
      <SecHead
        eyebrow="Edição mais recente"
        title={`JurisClub · ${edicao.nome}`}
        sub="Siga as etapas do mês na ordem."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16, alignItems: 'stretch' }}>
        {etapas.map((e) => {
          const circleBg = e.estado === 'atual' ? 'var(--brand)' : 'var(--track)'
          const circleFg = e.estado === 'atual' ? '#fff' : 'var(--muted)'
          return (
            <Card key={e.n} pad={18} style={{ border: `1px solid ${e.estado === 'atual' ? 'var(--brand)' : 'var(--line)'}` }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: circleBg, color: circleFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>{e.n}</span>
                {e.estado === 'atual' ? <b style={{ fontSize: 12.5, color: 'var(--brand)' }}>Você está aqui</b> : null}
              </Row>
              <H3>{e.titulo}</H3>
              <P size={12.5}>{e.desc}</P>
              {e.estado === 'atual' && 'pct' in e ? (
                <Col gap={4}>
                  <Row gap={8} style={{ flexWrap: 'nowrap' }}>
                    <Bar pct={e.pct} color="var(--brand)" style={{ flex: 1 }} />
                    <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{e.pct}%</b>
                  </Row>
                  <Muted size={11.5}>{e.prog}</Muted>
                </Col>
              ) : null}
              <a href={e.href} style={{ marginTop: 'auto', fontSize: 12.5, fontWeight: 800, color: 'var(--brand)' }}>{e.link}</a>
            </Card>
          )
        })}
      </div>

      {/* Julgados (REAIS, filtrados) + lateral */}
      <Split
        main={
          <Col gap={16}>
            <SecHead
              title="Julgados do mês"
              sub={disc || termo ? `${filtrados.length} de ${julgados.length} julgados` : undefined}
              right={<Btn kind="link" href={edicao.href}>Ver todos os {edicao.total}</Btn>}
            />
            {julgados.length === 0 ? (
              <Card style={{ alignItems: 'center', textAlign: 'center', padding: '32px 24px' }}>
                <Muted size={13}>Esta edição ainda não tem julgados publicados.</Muted>
              </Card>
            ) : filtrados.length === 0 ? (
              <Card style={{ alignItems: 'center', textAlign: 'center', padding: '32px 24px' }}>
                <Muted size={13}>Nenhum julgado encontrado para a sua busca.</Muted>
              </Card>
            ) : (
              visiveis.map((j) => (
                <Card key={j.id} pad={18}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Row gap={8} style={{ flexWrap: 'wrap' }}>
                      <Tag kind="gray">{j.tema.toUpperCase()}</Tag>
                      {j.corte ? <Tag kind={j.corte === 'STF' ? 'blue' : 'gold'}>{j.corte}{j.ref ? ` · ${j.ref}` : ''}</Tag> : j.ref ? <Tag kind="brand">{j.ref}</Tag> : null}
                      {j.lido ? <Tag kind="green" icon="check">Lido</Tag> : null}
                    </Row>
                    <Row gap={8} style={{ flexWrap: 'nowrap' }}>
                      <Btn kind="primary" size="sm" href={j.href}>Ler o julgado</Btn>
                    </Row>
                  </Row>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.5, color: 'var(--ink)' }}>{j.texto || 'Julgado comentado desta edição.'}</p>
                </Card>
              ))
            )}
            {filtrados.length > visiveis.length ? (
              <Row style={{ justifyContent: 'center' }}>
                <Btn kind="secondary" href={edicao.href}>Ver os {filtrados.length - visiveis.length} julgados restantes</Btn>
              </Row>
            ) : null}
          </Col>
        }
        aside={
          <Col gap={16}>
            <Card pad={16}>
              <H3>Por disciplina</H3>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {['Todas', ...disciplinas].map((d, i) => {
                  const val = i === 0 ? null : d
                  const on = disc === val
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDisc(val)}
                      style={{ display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 12px', borderRadius: 99, fontSize: 12.5, fontWeight: on ? 800 : 700, cursor: 'pointer', border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--chip)' : 'var(--surface)', color: on ? 'var(--brand)' : 'var(--muted)' }}
                    >
                      {d}
                    </button>
                  )
                })}
              </Row>
            </Card>
            <span id="edicoes" />
            <Card pad={16}>
              <H3>Edições</H3>
              <Col gap={10}>
                {edicoes.map((ed) => (
                  <a key={ed.id} href={ed.href}>
                    <Row gap={12} style={{ flexWrap: 'nowrap' }}>
                      <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--peachBg)', color: 'var(--accentInk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n="gavel" size={16} /></span>
                      <Col gap={1} style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{ed.nome}</b>
                        <Muted size={11.5}>{ed.sub}</Muted>
                      </Col>
                      <Tag kind={ed.badgeKind}>{ed.badge}</Tag>
                    </Row>
                  </a>
                ))}
              </Col>
            </Card>
            <Card pad={16}>
              <Row gap={8} style={{ justifyContent: 'space-between' }}>
                <H3>Ver no desafio</H3>
              </Row>
              <P size={12.5}>Abra a edição no formato de desafio: julgados do dia, leitura rápida e placar.</P>
              <Btn kind="secondary" icon="play" href={R.desafioJuris} style={{ marginTop: 'auto' }}>Abrir desafios de jurisprudência</Btn>
            </Card>
          </Col>
        }
      />
    </>
  )
}
