'use client'
// Área interna do Desafio de Lei Seca (um módulo de leitura): hero + abas Trilha / Regulamento /
// Desempenho / Ranking. Navegação por abas = estado local. Os DADOS vêm do servidor (page.tsx) via
// `dados` (trilha/aulas/streak/ranking reais). Partes sem loader pronto (regulamento textual, etapas
// da montanha, carimbos, acertos por dia) continuam EXEMPLO marcadas com // TODO(dados).
import * as React from 'react'
import { Card, Grid, Row, Col, H2, H3, Muted, P, Btn, Tag, Bar, Stat, Avatar, IconBox } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import type { IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'

/* ---------------- contratos de dados (REAL, vindos do servidor) ---------------- */
export type Situacao = 'Concluída' | 'Em andamento' | 'Bloqueada'
export interface AulaLinha { dia: number; arts: string; tema: string; situacao: Situacao; leitura: string; questoes: string; seq: string; pts: string }
export interface ProximaParada { dia: string; quando: string }
export interface DiaEnergia { label: string; on: boolean }
export interface PodioItem { pos: string; ini: string; pts: number; seq: number; h: number }
export interface ClassifLinha { pos: number; ini: string; nome: string; aulas: number; seq: number; pts: number; eu: boolean }
export interface MinhaLinha { pos: number; nome: string; inicial: string; aulas: number; seq: number; pts: number; pct: number }
export interface DesafioDados {
  moduloNome: string
  done: number
  total: number
  pct: number
  aulaAtual: { num: number; titulo: string; leituraPct: number; questoesResp: number; questoesTotal: number; pontos: number } | null
  proximas: ProximaParada[]
  energia: { streakAtual: number; recorde: number; nivel: number; xpTotal: number; semana: DiaEnergia[] } | null
  desempenhoStats: { aulasConcluidas: number; aulasTotal: number; questoesResp: number; acertoPct: number | null; pontos: number; melhorSeq: number }
  aulas: AulaLinha[]
  ranking: { podio: PodioItem[]; minha: MinhaLinha | null; classif: ClassifLinha[]; totalAlunos: number }
}

type Aba = 'trilha' | 'regulamento' | 'desempenho' | 'ranking'
const ABAS: { k: Aba; label: string; icon: IconName }[] = [
  { k: 'trilha', label: 'Trilha', icon: 'flag' },
  { k: 'regulamento', label: 'Regulamento', icon: 'book' },
  { k: 'desempenho', label: 'Desempenho', icon: 'chart' },
  { k: 'ranking', label: 'Ranking', icon: 'trophy' },
]

const fmt = (n: number) => n.toLocaleString('pt-BR')
const soLetras = (s: string) => (s || '').replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 2).toUpperCase() || '—'

function sitTag(s: Situacao) {
  if (s === 'Concluída') return <Tag kind="green" icon="check">Concluída</Tag>
  if (s === 'Em andamento') return <Tag kind="gold" icon="play">Em andamento</Tag>
  return <Tag kind="gray" icon="lock">Bloqueada</Tag>
}

/* ================= HERO ================= */
function Hero({ dados }: { dados: DesafioDados }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, background: 'linear-gradient(120deg,#160F33 0%,#241A52 55%,#2E1F6A 100%)', color: '#FFFFFF', padding: '26px 30px' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)', backgroundSize: '32px 32px', WebkitMaskImage: 'linear-gradient(180deg,#000,transparent 85%)', maskImage: 'linear-gradient(180deg,#000,transparent 85%)' }} />
      <span aria-hidden style={{ position: 'absolute', top: -40, right: 120, width: 2, height: 420, background: 'linear-gradient(180deg,transparent,var(--gold),transparent)', transform: 'rotate(28deg)', opacity: 0.5 }} />
      <Row gap={16} style={{ position: 'relative', justifyContent: 'space-between', alignItems: 'center' }}>
        <Row gap={14}>
          <a href={R.central} aria-label="Voltar" title="Voltar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,.22)', background: 'rgba(255,255,255,.06)', color: '#FFFFFF', flexShrink: 0 }}><Icon n="back" size={18} /></a>
          <Icon n="layers" size={22} />
          <b style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{dados.moduloNome}</b>
          <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: 'var(--gold)', color: 'var(--goldInk)' }}>{dados.done}/{dados.total}</span>
        </Row>
        <Col gap={0} style={{ alignItems: 'flex-end', textAlign: 'right' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.3em', opacity: 0.8 }}>— DESAFIO —</span>
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '0.02em', lineHeight: 1.05 }}>LEI SECA</span>
          <span style={{ fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: 'var(--gold)' }}>{dados.moduloNome}</span>
        </Col>
      </Row>
    </div>
  )
}

/* ================= TRILHA ================= */
function Trilha({ dados }: { dados: DesafioDados }) {
  const a = dados.aulaAtual
  const en = dados.energia
  return (
    <Col gap={18}>
      <Card>
        <Row gap={16} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Col gap={6} style={{ minWidth: 0 }}>
            <H2>Subindo a montanha</H2>
            <Muted size={13}>{dados.done} de {dados.total} dias concluídos{a ? ` · dia ${a.num} em andamento` : ''}</Muted>
          </Col>
          <b style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--brand)' }}>{dados.pct}%</b>
        </Row>
        <Bar pct={dados.pct} h={10} />
        <Row gap={10}>
          <Btn kind="gold" icon="play" href={R.desafioLeiSecaArea}>Ir para minha aula</Btn>
          <Btn kind="secondary" icon="flag" href={R.desafioLeiSecaArea}>Ver trilha inteira</Btn>
        </Row>
      </Card>

      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, alignItems: 'start' }}>
        {/* Aula do dia */}
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <Row gap={20} style={{ padding: 24, alignItems: 'stretch', flexWrap: 'nowrap' }}>
            <Col gap={2} style={{ background: 'linear-gradient(135deg,#2A1E4A,#4A31B8)', color: '#FFFFFF', borderRadius: 16, padding: '18px 20px', minWidth: 150, justifyContent: 'center' }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', opacity: 0.8 }}>DIA</span>
              <span style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>{a ? String(a.num).padStart(2, '0') : '—'}</span>
              <span style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>{a ? a.titulo : 'Sem aula em andamento'}</span>
            </Col>
            <Col gap={10} style={{ flex: 1, minWidth: 0 }}>
              <Row gap={8}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', color: 'var(--accentInk)' }}>AULA DO DIA</span>
                <Tag kind="gold" icon="play">Em andamento</Tag>
              </Row>
              <H3>{a ? a.titulo : 'Nenhuma aula em andamento'}</H3>
              <Muted size={12.5}>{a ? `${a.questoesTotal} questões no quiz` : 'Comece uma aula na trilha'}</Muted>
              <Grid cols={3} gap={10} style={{ marginTop: 4 }}>
                <StatMini label="Leitura" value={a ? `${a.leituraPct}%` : '—'} icon="book" />
                <StatMini label="Quiz" value={a ? `${a.questoesResp}/${a.questoesTotal}` : '—'} icon="clip" />
                <StatMini label="Pontos" value={a ? fmt(a.pontos) : '0'} icon="bolt" />
              </Grid>
              <Row gap={10} style={{ marginTop: 4 }}>
                <Btn kind="gold" icon="play" href={R.desafioLeiSecaArea}>Continuar aula</Btn>
                <Btn kind="secondary" icon="book" href={R.desafioLeiSecaArea}>Revisar aula</Btn>
              </Row>
            </Col>
          </Row>
        </Card>

        <Col gap={16}>
          <Card>
            <Row gap={8} style={{ justifyContent: 'space-between' }}>
              <H3>Próximas paradas</H3>
              <Btn kind="link" href={R.desafioLeiSecaArea}>ver trilha</Btn>
            </Row>
            {dados.proximas.length === 0 ? (
              <Muted size={12.5}>Você está em dia com a trilha.</Muted>
            ) : (
              <Col gap={2}>
                {dados.proximas.map((p, i) => (
                  <Col key={i} gap={4} style={{ padding: '11px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
                    <Row gap={8} style={{ justifyContent: 'space-between' }}>
                      <b style={{ fontSize: 13, color: 'var(--ink)' }}>{p.dia}</b>
                      <Muted size={12}>{p.quando}</Muted>
                    </Row>
                  </Col>
                ))}
              </Col>
            )}
          </Card>

          <Card>
            <H3>Sua energia</H3>
            {en ? (
              <>
                <Row gap={12}>
                  <IconBox icon="flame" bg="var(--peachBg)" fg="var(--accentInk)" />
                  <Col gap={0}>
                    <b style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{en.streakAtual} dias</b>
                    <Muted size={12}>sequência · recorde {en.recorde}</Muted>
                  </Col>
                </Row>
                <Row gap={12}>
                  <IconBox icon="bolt" />
                  <Col gap={0}>
                    <b style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Nível {en.nivel}</b>
                    <Muted size={12}>{fmt(en.xpTotal)} XP</Muted>
                  </Col>
                </Row>
                <Row gap={6} style={{ justifyContent: 'space-between' }}>
                  {en.semana.map((s, i) => (
                    <Col key={i} gap={5} style={{ alignItems: 'center', flex: 1 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--muted2)' }}>{s.label}</span>
                      <span style={{ width: 26, height: 26, borderRadius: 8, background: s.on ? 'var(--gold)' : 'var(--surface2)', color: s.on ? 'var(--goldInk)' : 'var(--muted2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon n={s.on ? 'check' : 'x'} size={12} /></span>
                    </Col>
                  ))}
                </Row>
              </>
            ) : (
              <Muted size={12.5}>Gamificação não ativa para você nesta plataforma.</Muted>
            )}
          </Card>
        </Col>
      </div>
    </Col>
  )
}

function StatMini({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Row gap={6}><Icon n={icon} size={14} /><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</span></Row>
      <b style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{value}</b>
    </div>
  )
}

/* ================= REGULAMENTO (EXEMPLO) ================= */
// TODO(dados): ligar regulamento do módulo (simulado_pastas.regulamento) + metas (pontuacao). Mantido
// como EXEMPLO textual por enquanto para não inventar conteúdo específico do tenant.
const SUMARIO = ['O que é este desafio', 'Como funciona cada dia', 'Liberação das aulas', 'Pontuação', 'Ranking e desempate', 'Carimbos e certificado']
const SECOES = [
  { t: 'O que é este desafio', c: 'O Desafio de Lei Seca é o cronograma diário criado para te levar, em 30 dias, do Preâmbulo ao art. 250 da Constituição Federal — sem cortar caminho, sem pular artigo e sem deixar a jurisprudência de lado. Todo dia tem leitura nova e atividades para fixar o que você acabou de ler.' },
  { t: 'Como funciona cada dia', c: 'Cada dia tem duas partes, sempre nessa ordem: primeiro a leitura guiada dos artigos do dia; depois o quiz com 10 questões sobre exatamente aquele trecho. O quiz só é liberado quando a leitura chega a 100%.' },
  { t: 'Liberação das aulas', c: 'A aula seguinte é liberada no dia seguinte à conclusão da anterior. Se você atrasar, as aulas ficam acumuladas e podem ser feitas em sequência, respeitando a ordem da trilha.' },
  { t: 'Pontuação', c: 'Você ganha pontos por leitura concluída e por quiz finalizado, além de bônus por sequência de dias. Cada tarefa conta uma única vez e há um teto diário de pontos.' },
  { t: 'Ranking e desempate', c: 'O ranking ordena os participantes por pontos. Em caso de empate, vale a maior sequência e, depois, quem concluiu as aulas primeiro. Os outros alunos aparecem apenas com as iniciais.' },
  { t: 'Carimbos e certificado', c: 'Ao atingir marcos da trilha você recebe carimbos no seu passaporte. Concluindo os 30 dias, você recebe o carimbo do cume e o certificado de participação.' },
]

function Regulamento() {
  return (
    <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24, alignItems: 'start' }}>
      <Card pad={28}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.3em', color: 'var(--accentInk)' }}>— DESAFIO — LEI SECA</span>
        <H2 style={{ fontSize: 24 }}>Regulamento Oficial</H2>
        <P size={14}>Em concursos, conhecer a lei seca não é um detalhe da preparação. Muitas questões cobram exatamente o que está escrito na lei: uma expressão, uma exceção, um prazo, uma competência. Durante 30 dias, vamos percorrer a Constituição artigo por artigo, criando uma rotina de contato diário com o texto constitucional.</P>
        <P size={14}><b style={{ color: 'var(--ink)' }}>Trinta dias. Constituição na mão. Um artigo de cada vez.</b></P>
        <Col gap={18} style={{ marginTop: 6 }}>
          {SECOES.map((s, i) => (
            <Col key={i} gap={6}>
              <H3>{i + 1}. {s.t}</H3>
              <P size={13.5}>{s.c}</P>
            </Col>
          ))}
        </Col>
      </Card>

      <Col gap={16}>
        <Card>
          <H3>Sumário</H3>
          <Col gap={2}>
            {SUMARIO.map((s, i) => (
              <Row key={i} gap={10} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--chip)', color: 'var(--brand)', fontSize: 11.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{s}</span>
              </Row>
            ))}
          </Col>
        </Card>

        <Card>
          <Row gap={12}>
            <IconBox icon="file" bg="var(--dangerBg)" fg="var(--danger)" />
            <Col gap={2} style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>Regulamento oficial</b>
              <Muted size={12}>PDF · 4 páginas · atualizado em 01/09/2026</Muted>
            </Col>
          </Row>
          <Btn kind="secondary" icon="download" style={{ width: '100%' }}>Baixar PDF</Btn>
        </Card>

        <Card>
          <H3>Ganhos e metas</H3>
          <Tag kind="gold" icon="bolt">+0 pontos hoje</Tag>
          <Muted size={11.5}>Por atividade (no dia)</Muted>
          <Col gap={6}>
            <MetaRow pts="+5" txt="por leitura concluída" />
            <MetaRow pts="+5" txt="por quiz concluído" />
          </Col>
          <Muted size={11.5}>Sequência (login diário)</Muted>
          <Col gap={6}>
            <MetaRow pts="+10" txt="a cada 7 dias seguidos" />
            <MetaRow pts="+15" txt="ao completar 14 dias" />
            <MetaRow pts="+35" txt="ao completar 21 dias" />
            <MetaRow pts="+50" txt="ao completar 30 dias" />
          </Col>
          <Muted size={11.5}>Máximo de <b style={{ color: 'var(--ink)' }}>300</b> pontos por dia — cada tarefa conta uma única vez.</Muted>
        </Card>
      </Col>
    </div>
  )
}

function MetaRow({ pts, txt }: { pts: string; txt: string }) {
  return (
    <Row gap={10} style={{ justifyContent: 'space-between' }}>
      <Muted size={12.5}>{txt}</Muted>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ok)' }}>{pts}</span>
    </Row>
  )
}

/* ================= DESEMPENHO ================= */
// TODO(dados): acertos por dia, etapas da montanha e passaporte de carimbos dependem de loaders de
// carimbos/medalhas (lib/leitura/carimbos) não carregados nesta tela — mantidos como EXEMPLO.
const ETAPAS = [
  { nome: 'Acampamento base', dia: 'Dia 1', done: true },
  { nome: 'Primeiro mirante', dia: 'Dia 7', done: false },
  { nome: 'Meio da encosta', dia: 'Dia 15', done: false },
  { nome: 'Acampamento alto', dia: 'Dia 21', done: false },
  { nome: 'Cume', dia: 'Dia 30', done: false },
]
const CARIMBOS = [
  { linha: 'LEI SECA', nome: 'Primeiro passo', req: 'Concluiu o dia 1', on: true },
  { linha: 'LEI SECA', nome: '3 dias seguidos', req: 'Sequência de 3', on: true },
  { linha: null as string | null, nome: 'Semana 1', req: 'Concluir o dia 7', on: false },
  { linha: null, nome: 'Meio do caminho', req: 'Concluir o dia 15', on: false },
  { linha: 'LEI SECA', nome: 'Gabaritou', req: '10/10 em um quiz', on: true },
  { linha: null, nome: 'Cume', req: 'Concluir os 30 dias', on: false },
]

function Desempenho({ dados }: { dados: DesafioDados }) {
  const s = dados.desempenhoStats
  return (
    <Col gap={18}>
      <Grid min={180} gap={16}>
        <Stat icon="check" value={`${s.aulasConcluidas}/${s.aulasTotal}`} label="Aulas concluídas" />
        <Stat icon="clip" value={fmt(s.questoesResp)} label="Questões respondidas" />
        <Stat icon="target" value={s.acertoPct != null ? `${s.acertoPct}%` : '—'} label="Acerto nos quizzes" />
        <Stat icon="bolt" value={fmt(s.pontos)} label="Pontos no desafio" />
        <Stat icon="flame" value={fmt(s.melhorSeq)} label="Melhor sequência" />
      </Grid>

      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24, alignItems: 'start' }}>
        {/* EXEMPLO: acertos por dia (sem agregado de acertos por aula) */}
        <Card>
          <Row gap={10} style={{ justifyContent: 'space-between' }}>
            <H3>Acertos por dia</H3>
            <Muted size={12}>exemplo</Muted>
          </Row>
          <Row gap={12} style={{ alignItems: 'flex-end', height: 140, marginTop: 6 }}>
            {[8, 9, 7, 10].map((a, i) => (
              <Col key={i} gap={6} style={{ flex: 1, alignItems: 'center' }}>
                <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{a}</b>
                <div style={{ width: '100%', height: `${(a / 10) * 110}px`, borderRadius: 8, background: 'var(--brand)' }} />
                <span style={{ fontSize: 11, color: 'var(--muted2)' }}>Dia {i + 1}</span>
              </Col>
            ))}
          </Row>
          <Row gap={16} style={{ marginTop: 4 }}>
            <Row gap={6}><span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--brand)' }} /><Muted size={11.5}>Concluída</Muted></Row>
            <Row gap={6}><span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--gold)' }} /><Muted size={11.5}>Leitura em andamento</Muted></Row>
            <Row gap={6}><span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--surface2)', border: '1px solid var(--line)' }} /><Muted size={11.5}>Bloqueada</Muted></Row>
          </Row>
        </Card>

        {/* EXEMPLO: etapas da montanha */}
        <Card>
          <Row gap={10} style={{ justifyContent: 'space-between' }}>
            <H3>Etapas da montanha</H3>
            <Muted size={12}>exemplo</Muted>
          </Row>
          <Col gap={2}>
            {ETAPAS.map((e, i) => (
              <Row key={i} gap={12} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: e.done ? 'var(--brand)' : 'var(--surface2)', color: e.done ? '#FFFFFF' : 'var(--muted2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n={e.done ? 'check' : 'flag'} size={14} /></span>
                <b style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{e.nome}</b>
                <Muted size={12}>{e.dia}</Muted>
              </Row>
            ))}
          </Col>
        </Card>
      </div>

      {/* REAL: todas as aulas do módulo */}
      <Card>
        <Row gap={10} style={{ justifyContent: 'space-between' }}>
          <H3>Todas as aulas</H3>
          <Muted size={12}>{dados.total} {dados.total === 1 ? 'aula' : 'aulas'}</Muted>
        </Row>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                {['Dia', 'Aula', 'Leitura', 'Questões', 'Sequência', 'Pontos', 'Situação'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.aulas.map((a) => (
                <tr key={a.dia}>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', fontWeight: 800, color: 'var(--ink)' }}>{String(a.dia).padStart(2, '0')}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', minWidth: 220 }}>
                    <b style={{ color: 'var(--ink)', fontWeight: 700 }}>{a.arts}</b>
                    {a.tema ? <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12 }}>{a.tema}</span> : null}
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{a.leitura}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{a.questoes}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>{a.seq}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>{a.pts}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>{sitTag(a.situacao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* EXEMPLO: passaporte de carimbos */}
      <Card>
        <Row gap={10} style={{ justifyContent: 'space-between' }}>
          <Col gap={2}>
            <H3>Passaporte de carimbos</H3>
            <Muted size={12}>Carimbos que você coleta ao longo da subida · exemplo</Muted>
          </Col>
          <Tag kind="gold">3/6</Tag>
        </Row>
        <Grid min={160} gap={14}>
          {CARIMBOS.map((c, i) => (
            <Col key={i} gap={8} style={{ alignItems: 'center', textAlign: 'center', padding: 16, borderRadius: 14, border: `1px solid ${c.on ? 'var(--gold)' : 'var(--line)'}`, background: c.on ? 'var(--peachBg)' : 'var(--surface2)', opacity: c.on ? 1 : 0.7 }}>
              <span style={{ width: 48, height: 48, borderRadius: '50%', background: c.on ? 'var(--gold)' : 'var(--surface)', color: c.on ? 'var(--goldInk)' : 'var(--muted2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: c.on ? '0' : '1px dashed var(--line2)' }}><Icon n={c.on ? 'star' : 'lock'} size={20} /></span>
              {c.linha ? <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.14em', color: c.on ? 'var(--accentInk)' : 'var(--muted2)' }}>{c.linha}</span> : null}
              <b style={{ fontSize: 13, color: 'var(--ink)' }}>{c.nome}</b>
              <Muted size={11}>{c.req}</Muted>
            </Col>
          ))}
        </Grid>
      </Card>
    </Col>
  )
}

/* ================= RANKING (REAL + privacidade: terceiros só por iniciais) ================= */
function Ranking({ dados }: { dados: DesafioDados }) {
  const { podio, minha, classif, totalAlunos } = dados.ranking
  // Pódio exibido na ordem 2º · 1º · 3º (o do meio é o campeão).
  const podioOrdem = [podio[1], podio[0], podio[2]].filter(Boolean) as PodioItem[]
  return (
    <Col gap={18}>
      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, alignItems: 'start' }}>
        <Card pad={24}>
          <Row gap={10} style={{ justifyContent: 'space-between' }}>
            <H3>Ranking geral</H3>
            <Muted size={12}>Ao vivo · <b style={{ color: 'var(--ink)' }}>{fmt(totalAlunos)}</b> alunos</Muted>
          </Row>
          {podioOrdem.length === 0 ? (
            <Muted size={12.5}>Ainda sem ranking neste desafio.</Muted>
          ) : (
            <Row gap={14} style={{ alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'nowrap', marginTop: 6 }}>
              {podioOrdem.map((p) => {
                const first = p.pos === '1º'
                return (
                  <Col key={p.pos} gap={8} style={{ alignItems: 'center', flex: 1, maxWidth: 160 }}>
                    <Avatar s={first ? 56 : 46} bg={first ? 'var(--gold)' : 'var(--chip)'} fg={first ? 'var(--goldInk)' : 'var(--brand)'}>{soLetras(p.ini)}</Avatar>
                    <b style={{ fontSize: 13, color: 'var(--ink)' }}>{p.ini}</b>
                    <Muted size={11.5}>{fmt(p.pts)} pts · {p.seq} dias</Muted>
                    <div style={{ width: '100%', height: p.h, borderRadius: '12px 12px 0 0', background: first ? 'var(--gold)' : 'var(--chip)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 10, color: first ? 'var(--goldInk)' : 'var(--brand)', fontWeight: 800, fontSize: 18 }}>{p.pos}</div>
                  </Col>
                )
              })}
            </Row>
          )}
        </Card>

        {minha ? (
          <Card>
            <Row gap={12} style={{ justifyContent: 'space-between' }}>
              <Col gap={0}>
                <b style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--brand)' }}>{minha.pos}º</b>
                <Muted size={12}>Posição</Muted>
              </Col>
            </Row>
            <Row gap={10}>
              <Avatar>{minha.inicial}</Avatar>
              <Col gap={0}>
                <b style={{ fontSize: 14, color: 'var(--ink)' }}>{minha.nome}</b>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand)' }}>VOCÊ</span>
              </Col>
            </Row>
            <Row gap={10} style={{ justifyContent: 'space-between' }}>
              <Col gap={0} style={{ alignItems: 'center' }}><b style={{ fontSize: 18, color: 'var(--ink)' }}>{minha.aulas}</b><Muted size={11}>aulas</Muted></Col>
              <Col gap={0} style={{ alignItems: 'center' }}><b style={{ fontSize: 18, color: 'var(--ink)' }}>{minha.seq}</b><Muted size={11}>seq.</Muted></Col>
              <Col gap={0} style={{ alignItems: 'center' }}><b style={{ fontSize: 18, color: 'var(--ink)' }}>{fmt(minha.pts)}</b><Muted size={11}>pts</Muted></Col>
            </Row>
            <Col gap={6}>
              <Row gap={8} style={{ justifyContent: 'space-between' }}>
                <Muted size={12}>Progresso do desafio</Muted>
                <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{minha.pct}%</b>
              </Row>
              <Bar pct={minha.pct} />
              <Muted size={11.5}>{minha.aulas} de {dados.total} aulas concluídas</Muted>
            </Col>
          </Card>
        ) : (
          <Card>
            <Muted size={12.5}>Conclua uma aula com quiz para entrar no ranking.</Muted>
          </Card>
        )}
      </div>

      <Card>
        <Row gap={10} style={{ justifyContent: 'space-between' }}>
          <H3>Classificação</H3>
          <Muted size={12}>Top {classif.length}</Muted>
        </Row>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                {['#', 'Aluno', 'Aulas', 'Sequência', 'Pontos'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classif.map((l) => (
                <tr key={l.pos} style={{ background: l.eu ? 'var(--chip)' : undefined }}>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', fontWeight: 800, color: 'var(--ink)' }}>{l.pos}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
                    <Row gap={10}>
                      <Avatar s={32} bg="var(--chip)" fg="var(--brand)">{soLetras(l.ini)}</Avatar>
                      <b style={{ color: 'var(--ink)', fontWeight: l.eu ? 800 : 700 }}>{l.eu ? 'Você' : l.nome}</b>
                    </Row>
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>{l.aulas}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}><Row gap={5}><Icon n="flame" size={13} /><b style={{ color: 'var(--ink)' }}>{l.seq}</b></Row></td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', fontWeight: 800, color: 'var(--ink)' }}>{fmt(l.pts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Row gap={10} style={{ justifyContent: 'space-between' }}>
          <Muted size={12}>Mostrando <b style={{ color: 'var(--ink)' }}>1–{classif.length}</b> de <b style={{ color: 'var(--ink)' }}>{fmt(totalAlunos)}</b></Muted>
        </Row>
      </Card>
    </Col>
  )
}

/* ================= RAIZ ================= */
export function DesafioInterno({ dados }: { dados: DesafioDados }) {
  const [aba, setAba] = React.useState<Aba>('trilha')
  return (
    <Col gap={20}>
      <Hero dados={dados} />
      <nav aria-label="Seções" style={{ display: 'flex', gap: 26, borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
        {ABAS.map((a) => {
          const on = aba === a.k
          return (
            <button key={a.k} type="button" onClick={() => setAba(a.k)}
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 4px', fontSize: 14, fontWeight: on ? 800 : 700, color: on ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap', background: 'none', border: 0, cursor: 'pointer' }}>
              <Icon n={a.icon} size={16} />{a.label}
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, borderRadius: '3px 3px 0 0', background: on ? 'var(--gold)' : 'transparent' }} />
            </button>
          )
        })}
      </nav>

      {aba === 'trilha' ? <Trilha dados={dados} /> : aba === 'regulamento' ? <Regulamento /> : aba === 'desempenho' ? <Desempenho dados={dados} /> : <Ranking dados={dados} />}
    </Col>
  )
}
