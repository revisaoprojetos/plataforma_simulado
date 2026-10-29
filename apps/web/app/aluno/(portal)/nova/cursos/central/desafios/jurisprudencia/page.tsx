import { redirect } from 'next/navigation'
import { Crumbs, PageHeader, Card, Grid, Row, Col, Stat, Muted, Btn, Avatar } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { desafiosDoAluno } from '@/lib/jurisprudencia/conteudo'
import { JulgadoDia, DesafiosInformativos, type DesafioView } from './_juris'

export const dynamic = 'force-dynamic'

// TODO(dados): ligar mini-ranking do JurisClub (desafio ativo) do aluno.
const RANK = [
  { pos: '2º', nome: 'Aluno O.C.', pts: 38, voce: false },
  { pos: '3º', nome: 'Você', pts: 34, voce: true },
  { pos: '4º', nome: 'Aluno J.F.', pts: 31, voce: false },
]

function JurisClubAside() {
  return (
    <Card>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '4px 10px', borderRadius: 99, background: 'var(--gold)', color: 'var(--goldInk)' }}>JURISCLUB</span>
        <Muted size={11.5}>encerra em 4 dias</Muted>
      </Row>
      <Col gap={4}>
        <b style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Juris Teste</b>
        <Muted size={12.5}>12 de 40 julgados · 70% de acerto</Muted>
      </Col>
      <span style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}><span style={{ display: 'block', width: '30%', height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#6449E0,#8F75FF 70%,#F1C232)' }} /></span>
      <Col gap={2}>
        {RANK.map((r) => (
          <Row key={r.pos} gap={10} style={{ padding: '9px 10px', borderRadius: 11, background: r.voce ? 'var(--chip)' : 'transparent' }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, width: 22, color: r.voce ? 'var(--brand)' : 'var(--muted)' }}>{r.pos}</span>
            {r.voce ? <Avatar s={28}>J</Avatar> : <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface2)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="user" size={14} /></span>}
            <b style={{ flex: 1, fontSize: 13, color: 'var(--ink)', fontWeight: r.voce ? 800 : 700 }}>{r.nome}</b>
            <b style={{ fontSize: 13, color: 'var(--ink)' }}>{r.pts} pts</b>
          </Row>
        ))}
      </Col>
      <Btn kind="primary" icon="play" href={R.desafioJuris} style={{ width: '100%' }}>Continuar desafio</Btn>
    </Card>
  )
}

const fmt = (n: number) => n.toLocaleString('pt-BR')
const pctDe = (f: number, t: number) => (t > 0 ? Math.round((f / t) * 100) : 0)
function statusDe(f: number, t: number): DesafioView['status'] {
  if (t > 0 && f >= t) return 'Concluído'
  if (f > 0) return 'Em andamento'
  return 'Novo'
}
function ctaDe(s: DesafioView['status']): string {
  return s === 'Concluído' ? 'Revisar' : s === 'Novo' ? 'Começar' : 'Continuar'
}

export default async function Page() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const { estudanteId, tenantId } = sessao
  const svc = createAdminClient()

  // Desafios REAIS (pastas jurisprudencia a que o aluno tem acesso) + progresso (dias dominados / total).
  const desafios = await desafiosDoAluno(estudanteId, tenantId)
  const progDesafio = new Map<string, { feitos: number; total: number }>()
  try {
    const ids = desafios.map((d) => d.id)
    if (ids.length) {
      const [pastasRes, progRes] = await Promise.all([
        svc.from('simulado_pastas').select('id, desafio_jogo').in('id', ids),
        svc.from('simulado_jurisprudencia_progresso').select('desafio_id, dom').eq('estudante_id', estudanteId).in('desafio_id', ids),
      ])
      const jogoMap = new Map((pastasRes.data ?? []).map((p: any) => [p.id, p.desafio_jogo ?? {}]))
      const domMap = new Map((progRes.data ?? []).map((p: any) => [p.desafio_id, p.dom ?? {}]))
      for (const id of ids) {
        const dj: any = jogoMap.get(id) ?? {}
        const dias = dj?.dias && typeof dj.dias === 'object' ? dj.dias : {}
        const total = Object.keys(dias).length
        const dom: any = domMap.get(id) ?? {}
        const feitos = Object.keys(dias).filter((k) => {
          const teses = dias[k]?.teses
          const n = Array.isArray(teses) ? teses.length : 0
          const arr = dom[k]
          return n > 0 && Array.isArray(arr) && arr.length >= n
        }).length
        progDesafio.set(id, { feitos, total })
      }
    }
  } catch { /* progresso é best-effort — card renderiza sem barra */ }

  const desafiosView: DesafioView[] = desafios.map((d) => {
    const p = progDesafio.get(d.id) ?? { feitos: 0, total: 0 }
    const status = statusDe(p.feitos, p.total)
    return { id: d.id, nome: d.nome, img: d.imagemTicket ?? null, status, feitas: p.feitos, total: p.total, pct: pctDe(p.feitos, p.total), cta: ctaDe(status) }
  })

  const desafiosAtivos = desafiosView.length

  return (
    <>
      <Crumbs items={[['Central de Estudos', R.central], ['Desafio de Jurisprudência', '#']]} />
      <PageHeader eyebrow="Jurisprudência" title="Desafio de Jurisprudência" sub="Julgados do STF e do STJ em desafios curtos — e os informativos da semana." />

      {/* "desafios ativos" é REAL; julgados estudados / acerto médio / sequência ficam EXEMPLO
          enquanto não há agregado de desempenho por jurisprudência. */}
      <Grid min={220} gap={16}>
        <Stat icon="gavel" value={fmt(desafiosAtivos)} label="desafios ativos" />
        {/* TODO(dados): julgados estudados (soma de teses dominadas) */}
        <Stat icon="book" value="146" label="julgados estudados" />
        {/* TODO(dados): acerto médio em jurisprudência */}
        <Stat icon="target" value="71%" label="acerto médio" />
        {/* TODO(dados): sequência em jurisprudência */}
        <Stat icon="flame" value="5 dias" label="sequência" />
      </Grid>

      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, alignItems: 'start' }}>
        <JulgadoDia />
        <JurisClubAside />
      </div>

      <DesafiosInformativos desafios={desafiosView} />
    </>
  )
}
