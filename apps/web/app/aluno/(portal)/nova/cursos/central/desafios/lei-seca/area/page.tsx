import { redirect } from 'next/navigation'
import { Crumbs, PageHeader, Grid, Row, Col, Stat, H2, Muted, Btn, Tag, Card } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarTrilhaLeituraAluno } from '@/lib/leitura/trilha'
import { ModulosArea, type Mod } from './_modulos'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('pt-BR')
const pctDe = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0)

/** Sigla curta p/ a capa do card (CF/88, CTN…): usa o nome quando curto, senão as iniciais das palavras. */
function siglaDe(nome: string): string {
  const n = (nome || '').trim()
  if (n.length <= 10) return n || '—'
  const ini = n.split(/\s+/).filter((w) => !/^(de|da|do|e|a|o|das|dos)$/i.test(w)).map((w) => w[0]?.toUpperCase() ?? '').join('')
  return ini.slice(0, 5) || n.slice(0, 8)
}
function statusDe(done: number, total: number): Mod['status'] {
  if (total > 0 && done >= total) return 'Concluída'
  if (done > 0) return 'Em andamento'
  return 'Não iniciada'
}
function ctaDe(s: Mod['status']): string {
  return s === 'Concluída' ? 'Revisar' : s === 'Não iniciada' ? 'Começar' : 'Continuar'
}
function stepSt(estado: 'concluido' | 'atual' | 'disponivel'): 'done' | 'now' | 'next' {
  return estado === 'concluido' ? 'done' : estado === 'atual' ? 'now' : 'next'
}

function Passo({ n, label, st }: { n: number; label: string; st: string }) {
  const done = st === 'done'
  const now = st === 'now'
  const circle: React.CSSProperties = {
    width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12.5, fontWeight: 800, flexShrink: 0,
    background: done ? 'var(--brand)' : now ? 'var(--gold)' : 'var(--surface2)',
    color: done ? '#FFFFFF' : now ? 'var(--goldInk)' : 'var(--muted)',
    border: now ? '0' : done ? '0' : '1px solid var(--line)',
    boxShadow: now ? '0 0 0 4px var(--peachBg)' : undefined,
  }
  return (
    <Col gap={8} style={{ alignItems: 'center', width: 78, flexShrink: 0 }}>
      <span style={circle}>{done ? <Icon n="check" size={16} /> : String(n).padStart(2, '0')}</span>
      <span style={{ fontSize: 10.5, lineHeight: 1.25, textAlign: 'center', color: now ? 'var(--ink)' : 'var(--muted)', fontWeight: now ? 800 : 600 }}>{label}</span>
    </Col>
  )
}

export default async function Page() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const { estudanteId, tenantId } = sessao
  const svc = createAdminClient()

  // Módulos (leis) REAIS do aluno + stats agregadas (mesma fonte da área de Leitura em produção).
  const trilhas = await carregarTrilhaLeituraAluno(estudanteId, tenantId)

  // Stats: leis, aulas concluídas e questões respondidas/acerto médio (1 par de counts agregados).
  let questoesRespondidas = 0
  let acertoMedio: number | null = null
  let ultimoModuloId: string | null = null
  try {
    const base = () => svc.from('simulado_leitura_respostas').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    const [{ count: total }, { count: corretas }, ultEv] = await Promise.all([
      base(), base().eq('correta', true),
      svc.from('simulado_xp_eventos').select('meta').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('origem', 'leitura').order('criado_em', { ascending: false }).limit(1).maybeSingle().then((r) => r.data, () => null),
    ])
    questoesRespondidas = total ?? 0
    if (questoesRespondidas > 0) acertoMedio = Math.round(((corretas ?? 0) / questoesRespondidas) * 100)
    // Último módulo com atividade → é o card "Continue de onde parou". Vem do último evento de leitura → documento → pasta.
    const docId = (ultEv as { meta?: { documentoId?: string } } | null)?.meta?.documentoId
    if (docId) {
      const { data: doc } = await svc.from('simulado_documentos').select('pasta_id').eq('id', docId).maybeSingle()
      ultimoModuloId = (doc as { pasta_id?: string | null } | null)?.pasta_id ?? null
    }
  } catch { /* tolerante: sem stats/último módulo */ }

  const leis = trilhas.length
  const aulasConcluidas = trilhas.reduce((s, t) => s + (t.done || 0), 0)

  const modulos: Mod[] = trilhas.map((t) => {
    const status = statusDe(t.done, t.total)
    return { sigla: siglaDe(t.nome), nome: t.nome, capa: t.capaCard ?? t.capa ?? null, status, feitas: t.done, total: t.total, pct: pctDe(t.done, t.total), acerto: null, cta: ctaDe(status) }
  })

  // "Continue de onde parou": o último módulo com atividade (ou o primeiro disponível).
  const cont = trilhas.find((t) => t.id === ultimoModuloId) ?? trilhas[0] ?? null
  const aulaNodes = cont ? cont.nodes.filter((n) => !n.id.startsWith('intro:')) : []
  const idxAtual = Math.max(0, aulaNodes.findIndex((n) => n.estado === 'atual'))
  const atual = aulaNodes[idxAtual] ?? null
  const contPct = cont ? pctDe(cont.done, cont.total) : 0

  return (
    <>
      <Crumbs items={[['Central de Estudos', R.central], ['Desafio de Lei Seca', R.desafioLeiSeca]]} />
      <PageHeader eyebrow="Lei Seca" title="Desafio de Lei Seca" sub="Estude a letra da lei aula por aula e fixe com questões dos dispositivos." />

      <Grid min={220} gap={16}>
        <Stat icon="layers" value={fmt(leis)} label="leis no desafio" />
        <Stat icon="check" value={fmt(aulasConcluidas)} label="aulas concluídas" />
        <Stat icon="clip" value={fmt(questoesRespondidas)} label="questões respondidas" />
        <Stat icon="target" value={acertoMedio != null ? `${acertoMedio}%` : '—'} label="acerto médio" />
      </Grid>

      {/* Continue de onde parou (módulo real em andamento) */}
      {cont && atual ? (
        <div className="np-split" style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', gap: 0, alignItems: 'stretch', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}>
          {/* capa roxa */}
          <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg,#2A1E4A,#4A31B8)', color: '#FFFFFF', padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '26px 26px' }} />
            <span style={{ position: 'relative', fontSize: 10.5, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', opacity: 0.8 }}>Continue de onde parou</span>
            <span style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 6, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 4 }}>
              <span style={{ fontSize: 40, lineHeight: 1 }}>Aula {String(idxAtual + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 16, opacity: 0.75 }}>/ {cont.total}</span>
            </span>
            <span style={{ position: 'relative', fontSize: 14, opacity: 0.9 }}>{cont.nome}</span>
            <div style={{ position: 'relative', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Row gap={8} style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11.5, opacity: 0.85 }}>Progresso do módulo</span>
                <b style={{ fontSize: 12.5 }}>{contPct}%</b>
              </Row>
              <span style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,.18)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${contPct}%`, height: '100%', borderRadius: 99, background: 'var(--gold)' }} /></span>
            </div>
          </div>

          {/* detalhe da aula */}
          <Col gap={14} style={{ padding: 24, background: 'var(--surface)' }}>
            <Col gap={4}>
              <H2>{atual.titulo}</H2>
              {/* TODO(dados): subtítulo/descrição da aula (não exposto pelo loader de trilha). */}
              <Muted size={13}>{cont.nome}</Muted>
            </Col>
            <Row gap={8}>
              <Tag kind="gray" icon="clip">{fmt(atual.questoes)} questões</Tag>
              <Tag kind="gray" icon="book">{atual.statusLabel}</Tag>
            </Row>
            <div style={{ display: 'flex', gap: 2, overflowX: 'auto', padding: '6px 0' }} className="hs">
              {aulaNodes.map((p, i) => (
                <Row key={p.id} gap={2} style={{ flexWrap: 'nowrap' }}>
                  <Passo n={i + 1} label={p.titulo} st={stepSt(p.estado)} />
                  {i < aulaNodes.length - 1 ? <span style={{ width: 20, height: 2, background: p.estado === 'concluido' ? 'var(--brand)' : 'var(--line)', marginTop: -18, flexShrink: 0 }} /> : null}
                </Row>
              ))}
            </div>
            <Row gap={10}>
              <Btn kind="gold" icon="play" href={R.desafioLeiSeca}>Continuar aula</Btn>
              <Btn kind="secondary" icon="book" href={R.desafioLeiSeca}>Ler os artigos</Btn>
            </Row>
          </Col>
        </div>
      ) : null}

      <ModulosArea modulos={modulos} />
    </>
  )
}
