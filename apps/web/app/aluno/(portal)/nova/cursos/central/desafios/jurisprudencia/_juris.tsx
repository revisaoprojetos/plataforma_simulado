'use client'
// Partes interativas do Desafio de Jurisprudência:
// 1) Julgado do dia (CERTO/ERRADO com revelação do gabarito).
// 2) Abas Desafios / Informativos.
import * as React from 'react'
import { Card, Grid, Row, Col, H3, Muted, P, Btn, Tag, Bar, Cover, Media } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'

// TODO(dados): ligar julgado do dia (enunciado, gabarito, explicação, tags).
const JULGADO = {
  fonte: 'STF · Tema 825',
  enunciado: '“Os Estados podem instituir o ITCMD sobre doações e heranças com elementos no exterior mesmo sem a lei complementar federal prevista no art. 155, §1º, III, da CF.”',
  gabarito: 'ERRADO' as 'CERTO' | 'ERRADO',
  explicacao: 'No Tema 825 (RE 851.108), o STF decidiu que é vedado aos Estados e ao DF instituir o ITCMD nessas hipóteses sem a edição da lei complementar exigida pela Constituição.',
  responderam: 1248,
  acertaram: 41,
  tags: ['Tributário', 'ITCMD'],
}

export function JulgadoDia() {
  const [escolha, setEscolha] = React.useState<'CERTO' | 'ERRADO' | null>(null)
  const acertou = escolha === JULGADO.gabarito
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, background: 'linear-gradient(135deg,#241A52,#3A2890)', color: '#FFFFFF', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 300 }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '30px 30px', WebkitMaskImage: 'linear-gradient(180deg,#000,transparent 80%)', maskImage: 'linear-gradient(180deg,#000,transparent 80%)' }} />
      <Row gap={10} style={{ position: 'relative', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.18em', color: 'var(--gold)' }}>JULGADO DO DIA</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: 'rgba(255,255,255,.12)' }}>{JULGADO.fonte}</span>
      </Row>
      <p style={{ position: 'relative', margin: 0, fontSize: 18, lineHeight: 1.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{JULGADO.enunciado}</p>

      {escolha == null ? (
        <Row gap={10} style={{ position: 'relative', marginTop: 'auto' }}>
          <button type="button" onClick={() => setEscolha('CERTO')} className="sbtn"
            style={{ flex: 1, height: 46, borderRadius: 13, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.06)', color: '#FFFFFF', fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon n="check" size={16} />CERTO
          </button>
          <button type="button" onClick={() => setEscolha('ERRADO')} className="sbtn"
            style={{ flex: 1, height: 46, borderRadius: 13, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.06)', color: '#FFFFFF', fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon n="x" size={16} />ERRADO
          </button>
        </Row>
      ) : (
        <div style={{ position: 'relative', marginTop: 'auto', padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.1)', border: `1px solid ${acertou ? 'rgba(70,200,130,.5)' : 'rgba(241,194,50,.5)'}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row gap={8}>
            <Icon n={acertou ? 'check' : 'info'} size={16} />
            <b style={{ fontSize: 14 }}>{acertou ? 'Você acertou! O gabarito é ERRADO.' : 'Não foi dessa vez. O gabarito é ERRADO.'}</b>
          </Row>
          <span style={{ fontSize: 12.5, lineHeight: 1.55, opacity: 0.92 }}>{JULGADO.explicacao}</span>
          <button type="button" onClick={() => setEscolha(null)} style={{ alignSelf: 'flex-start', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--gold)', background: 'none', border: 0, cursor: 'pointer' }}>
            <Icon n="shuffle" size={14} />Responder de novo
          </button>
        </div>
      )}

      <Row gap={10} style={{ position: 'relative', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.14)' }}>
        <Row gap={6}>
          <Icon n="users" size={15} />
          <span style={{ fontSize: 12.5, opacity: 0.9 }}><b>{JULGADO.responderam.toLocaleString('pt-BR')} alunos</b> responderam hoje · <b style={{ color: 'var(--gold)' }}>{JULGADO.acertaram}%</b> acertaram</span>
        </Row>
        <Row gap={6}>
          {JULGADO.tags.map((t) => <span key={t} style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: 'rgba(255,255,255,.12)' }}>{t}</span>)}
        </Row>
      </Row>
    </div>
  )
}

// ---- Abas Desafios / Informativos ----
// Desafios de jurisprudência REAIS (pastas folder_area='jurisprudencia' a que o aluno tem acesso),
// com progresso (dias dominados / total) — vêm do servidor (page.tsx). "Informativos" seguem EXEMPLO
// até existir um modelo de informativos por corte.
export type DesafioView = { id: string; nome: string; img: string | null; status: 'Em andamento' | 'Concluído' | 'Novo'; feitas: number; total: number; pct: number; cta: string }

// TODO(dados): ligar informativos (STF/STJ por corte) — sem modelo de dados pronto nesta área.
type Inf = { corte: string; num: string; data: string; julgados: number; tags: string[]; estado: string; cta: string }
const INFORMATIVOS: Inf[] = [
  { corte: 'STF', num: '1.190', data: '26/09', julgados: 9, tags: ['Constitucional', 'Tributário'], estado: 'Novo', cta: 'Começar' },
  { corte: 'STJ', num: '862', data: '23/09', julgados: 12, tags: ['Processo Civil', 'Penal'], estado: '5/12 respondidos', cta: 'Continuar' },
  { corte: 'STF', num: '1.189', data: '19/09', julgados: 7, tags: ['Administrativo'], estado: '86% de acerto', cta: 'Revisar' },
  { corte: 'STJ', num: '861', data: '16/09', julgados: 10, tags: ['Civil', 'Consumidor'], estado: '70% de acerto', cta: 'Revisar' },
  { corte: 'STF', num: '1.188', data: '12/09', julgados: 8, tags: ['Constitucional', 'Penal'], estado: '63% de acerto', cta: 'Revisar' },
  { corte: 'STJ', num: '860', data: '09/09', julgados: 11, tags: ['Tributário'], estado: '82% de acerto', cta: 'Revisar' },
]

function desTag(s: DesafioView['status']) {
  if (s === 'Concluído') return <Tag kind="green" icon="check">Concluído</Tag>
  if (s === 'Novo') return <Tag kind="gold" icon="bolt">Novo</Tag>
  return <Tag kind="brand" icon="play">Em andamento</Tag>
}

export function DesafiosInformativos({ desafios }: { desafios: DesafioView[] }) {
  const [aba, setAba] = React.useState<'desafios' | 'informativos'>('desafios')
  return (
    <Col gap={18}>
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', gap: 4, padding: 4, borderRadius: 13, background: 'var(--track)' }}>
        {(['desafios', 'informativos'] as const).map((k) => {
          const on = aba === k
          return (
            <button key={k} type="button" onClick={() => setAba(k)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 10, fontSize: 13, whiteSpace: 'nowrap', border: 0, cursor: 'pointer', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--ink)' : 'var(--muted)', fontWeight: on ? 800 : 700, boxShadow: on ? '0 2px 8px rgba(30,15,80,.1)' : undefined }}>
              <Icon n={k === 'desafios' ? 'gavel' : 'book'} size={15} />{k === 'desafios' ? 'Desafios' : 'Informativos'}
            </button>
          )
        })}
      </div>

      {aba === 'desafios' ? (
        desafios.length === 0 ? (
          <Card style={{ alignItems: 'center', textAlign: 'center', padding: '40px 24px' }}>
            <Muted size={13}>Nenhum desafio de jurisprudência disponível para você no momento.</Muted>
          </Card>
        ) : (
        <Grid min={260} gap={16}>
          {desafios.map((d) => (
            <Card key={d.id} pad={0} style={{ overflow: 'hidden' }} className="lift">
              <Media ratio="16:9" img={d.img ?? undefined} fallback={<Cover line="DESAFIO" sigla={d.nome} grad="linear-gradient(135deg,#241A52,#4A31B8)" big={20} />} />
              <Col gap={10} style={{ padding: 16 }}>
                {desTag(d.status)}
                <H3>{d.nome}</H3>
                <Row gap={8} style={{ justifyContent: 'space-between' }}>
                  <Muted size={12}>{d.feitas} de {d.total} dias</Muted>
                  <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{d.pct}%</b>
                </Row>
                <Bar pct={d.pct} />
                <Row gap={8} style={{ justifyContent: 'flex-end', marginTop: 2 }}>
                  <Btn kind={d.status === 'Concluído' ? 'secondary' : 'primary'} size="sm" icon={d.status === 'Novo' ? 'play' : 'arrow'} style={{ marginTop: 'auto' }}>{d.cta}</Btn>
                </Row>
              </Col>
            </Card>
          ))}
        </Grid>
        )
      ) : (
        <Grid min={300} gap={16}>
          {INFORMATIVOS.map((inf, i) => (
            <Card key={i} className="lift">
              <Row gap={10} style={{ justifyContent: 'space-between' }}>
                <Row gap={10}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)' }}>{inf.corte}</span>
                  <b style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{inf.num}</b>
                </Row>
                <Muted size={12}>{inf.data}</Muted>
              </Row>
              <Col gap={2}>
                <H3>Informativo {inf.num} · {inf.corte}</H3>
                <Muted size={12}>{inf.data} · {inf.julgados} julgados</Muted>
              </Col>
              <Row gap={6}>
                {inf.tags.map((t) => <Tag key={t} kind="gray">{t}</Tag>)}
              </Row>
              <Row gap={8} style={{ justifyContent: 'space-between', marginTop: 'auto' }}>
                <Muted size={12}>{inf.estado}</Muted>
                <Btn kind={inf.cta === 'Revisar' ? 'secondary' : 'primary'} size="sm" icon={inf.cta === 'Começar' ? 'play' : 'arrow'}>{inf.cta}</Btn>
              </Row>
            </Card>
          ))}
        </Grid>
      )}
    </Col>
  )
}
