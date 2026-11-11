// ETAPA 1 — "Que tipo de cronograma você quer criar?". Server component: só links (nada grava).
import Link from 'next/link'
import { Card, Col, Row, Muted, IconBox, Grid, Btn, Eyebrow } from '@/components/nova/ui'
import type { TiposDisponiveis } from '@/lib/cronograma/meus'

export function EscolherTipo({ tipos, modeloId }: { tipos: TiposDisponiveis; modeloId?: string }) {
  const opcoes = [
    tipos.revisao && {
      href: `/aluno/cronograma?criar=revisao${modeloId ? `&modelo=${encodeURIComponent(modeloId)}` : ''}`,
      icon: 'list' as const, titulo: 'Cronograma Revisão',
      desc: 'O mais simples: você escolhe um modelo pronto, define sua rotina e recebe o plano semana a semana.',
    },
    tipos.adaptativo && {
      href: '/aluno/cronograma?criar=adaptativo',
      icon: 'sliders' as const, titulo: 'Cronograma Adaptativo',
      desc: 'Ajusta ao seu ritmo e ao seu desempenho: o plano se reorganiza conforme você estuda.',
    },
  ].filter(Boolean) as { href: string; icon: 'list' | 'sliders'; titulo: string; desc: string }[]

  return (
    <Col gap={16}>
      <Col gap={4}>
        <Eyebrow>Passo 1 de 2</Eyebrow>
        <b style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Que tipo de cronograma você quer criar?</b>
        <Muted>Nada é salvo até você gerar o cronograma. Se sair no meio, o que não foi gerado se perde.</Muted>
      </Col>
      <Grid min={300} gap={14}>
        {opcoes.map((o) => (
          <Link key={o.href} href={o.href} style={{ display: 'flex', textDecoration: 'none' }}>
            <Card pad={20} style={{ flex: 1, gap: 12 }}>
              <Row gap={12} style={{ flexWrap: 'nowrap' }}>
                <IconBox icon={o.icon} s={46} />
                <b style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{o.titulo}</b>
              </Row>
              <Muted size={13.5}>{o.desc}</Muted>
              <span style={{ marginTop: 'auto', fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>Escolher →</span>
            </Card>
          </Link>
        ))}
      </Grid>
      <Row><Btn kind="secondary" size="sm" icon="back" href="/aluno/cronograma">Voltar</Btn></Row>
    </Col>
  )
}
