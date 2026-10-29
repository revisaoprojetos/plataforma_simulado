// Questões e Simulados — aba "Realizados" (RealizadosRevisao). Em andamento + concluídos.
// Porte fiel do canvas. Server component LIGADO A DADO REAL (sessões do próprio aluno).
import {
  PageHeader, Card, Grid, Row, Col, H3, Muted, Btn, IBtn, Bar, GBAR, Tag,
  Stat, Cover, Media, Crumbs, Tabs,
} from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { montarRelatorioEstudante } from '@/app/admin/relatorios/estudantes/_dados'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { isoParaBrtLocal } from '@/lib/brt'

export const dynamic = 'force-dynamic'

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const fmtNota = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
// "DD/MM" no horário de Brasília (America/Sao_Paulo, UTC−3) a partir do ISO do banco.
const ddmm = (iso: string | null): string => {
  const s = isoParaBrtLocal(iso)
  if (!s) return ''
  const [, mo, da] = s.split('T')[0].split('-')
  return `${da}/${mo}`
}
// Degradês de capa (decorativos) — ciclados de forma determinística por índice, sem inventar metadado.
const GRADS = [
  'linear-gradient(135deg,#2A1E4A,#4A31B8)',
  'linear-gradient(135deg,#9A3412,#EA580C)',
  'linear-gradient(135deg,#1E2A6A,#2F5BD3)',
  'linear-gradient(135deg,#0F6E60,#2EC0A2)',
  'linear-gradient(135deg,#14532D,#1F7A45)',
  'linear-gradient(135deg,#241047,#5B2A9E)',
]
const gradDe = (i: number) => GRADS[i % GRADS.length]
const siglaDe = (titulo: string) => (titulo || 'Simulado').slice(0, 18)
// tom do selo de nota (decorativo): verde p/ notas altas, dourado p/ médias, vermelho p/ baixas.
const tomDe = (n: number): 'green' | 'gold' | 'red' => (n >= 68 ? 'green' : n >= 50 ? 'gold' : 'red')

type EmAndamento = { id: string; grad: string; titulo: string; questao: string; pct: number }
type Concluido = {
  id: string; grad: string; titulo: string; data: string
  nota: number | null; notaLiberada: boolean; tom: 'green' | 'gold' | 'red'
}

async function carregar(): Promise<{
  andamento: EmAndamento[]
  concluidos: Concluido[]
  stats: { feitos: number; concluidos: number; acertoMedio: number | null; melhorNota: number | null }
  personalizados: number | null
}> {
  const sessao = await getSessaoAluno()
  const vazio = {
    andamento: [] as EmAndamento[], concluidos: [] as Concluido[],
    stats: { feitos: 0, concluidos: 0, acertoMedio: null, melhorNota: null },
    personalizados: null as number | null,
  }
  if (!sessao) return vazio
  const svc = createAdminClient()
  const estId = sessao.estudanteId

  // Simulados atribuídos (matrícula liberada + acesso avulso) + TODAS as sessões do aluno
  // (garante que o histórico apareça mesmo se a matrícula mudou depois de concluir).
  const [{ data: mats }, { data: acs }, { data: sessAll }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id').eq('estudante_id', estId),
    svc.from('simulado_sessoes_prova')
      .select('id, simulado_id, status, nota, finalizado_em, iniciado_em, tentativa_num')
      .eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
  ])
  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
  ].filter(Boolean))]

  let simulados: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  if (ids.length) {
    // owner_estudante_id IS NULL: não trazer simulados PESSOAIS (aba Personalizados) p/ o catálogo oficial.
    const { data: sims } = await svc.from('simulado_simulados')
      .select('id, titulo, status, data_inicio, data_fim, regras, created_at, embed_token')
      .in('id', ids).eq('deletado', false).is('owner_estudante_id', null)
    simulados = sims ?? []
    for (const s of (sessAll ?? []) as any[]) {
      const arr = sessoesPorSim.get(s.simulado_id) ?? []; arr.push(s); sessoesPorSim.set(s.simulado_id, arr)
    }
  }

  const itens = simulados.map((s) => {
    const sess = sessoesPorSim.get(s.id) ?? []
    const finalizadas = sess.filter((x) => x.status === 'finalizada')
    const emAndamento = sess.some((x) => x.status !== 'finalizada')
    const notas = finalizadas.map((x) => (x.nota != null ? Number(x.nota) : null)).filter((n): n is number => n != null)
    const melhor = notas.length ? Math.max(...notas) : null
    const { notaLiberada } = resolverLiberacoes(s.regras, s)
    const ultimo = finalizadas.map((x) => x.finalizado_em).filter(Boolean).sort().pop() ?? null
    return { ...s, concluido: finalizadas.length > 0, emAndamento, melhor, notaLiberada, ultimo }
  })

  const concluidosItens = itens
    .filter((i) => i.concluido)
    .sort((a: any, b: any) => new Date(b.ultimo ?? b.created_at ?? 0).getTime() - new Date(a.ultimo ?? a.created_at ?? 0).getTime())
  const emAndamentoItens = itens.filter((i) => i.emAndamento && !i.concluido)

  // Progresso (questão X de Y / %) só dos poucos em andamento — 2 queries.
  const emIds = emAndamentoItens.map((s: any) => s.id)
  const emSessIds = emAndamentoItens
    .map((s: any) => (sessoesPorSim.get(s.id) ?? []).find((x: any) => x.status !== 'finalizada')?.id)
    .filter(Boolean) as string[]
  const totalPorSim = new Map<string, number>()
  const respPorSess = new Map<string, number>()
  if (emIds.length) {
    const [{ data: pqRows }, { data: rsRows }] = await Promise.all([
      svc.from('simulado_prova_questoes').select('simulado_id').in('simulado_id', emIds),
      emSessIds.length
        ? svc.from('simulado_respostas_objetivas').select('sessao_id').in('sessao_id', emSessIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    for (const r of (pqRows ?? []) as any[]) totalPorSim.set(r.simulado_id, (totalPorSim.get(r.simulado_id) ?? 0) + 1)
    for (const r of (rsRows ?? []) as any[]) respPorSess.set(r.sessao_id, (respPorSess.get(r.sessao_id) ?? 0) + 1)
  }

  const andamento: EmAndamento[] = emAndamentoItens.map((s: any, i) => {
    const total = totalPorSim.get(s.id) ?? 0
    const sessId = (sessoesPorSim.get(s.id) ?? []).find((x: any) => x.status !== 'finalizada')?.id
    const resp = sessId ? (respPorSess.get(sessId) ?? 0) : 0
    const atual = Math.min(resp + 1, total || resp + 1)
    return {
      id: s.id, grad: gradDe(i), titulo: s.titulo || 'Simulado',
      questao: total ? `Questão ${fmtInt(atual)} de ${fmtInt(total)}` : `${fmtInt(resp)} respondidas`,
      pct: total ? Math.round((resp / total) * 100) : 0,
    }
  })

  const concluidos: Concluido[] = concluidosItens.map((s: any, i) => ({
    id: s.id, grad: gradDe(i), titulo: s.titulo || 'Simulado', data: ddmm(s.ultimo ?? s.created_at),
    nota: s.melhor, notaLiberada: s.notaLiberada, tom: s.melhor != null ? tomDe(s.melhor) : 'gold',
  }))

  // acerto médio (%) via loader canônico (cacheado) — fonte real e consistente com /Desempenho.
  const rel = await montarRelatorioEstudante(svc, estId, sessao.tenantId)
  const notasLib = concluidosItens
    .filter((c: any) => c.notaLiberada && c.melhor != null)
    .map((c: any) => c.melhor as number)
  const melhorNota = notasLib.length ? Math.max(...notasLib) : null

  return {
    andamento,
    concluidos,
    stats: {
      feitos: concluidosItens.length + emAndamentoItens.length,
      concluidos: concluidosItens.length,
      acertoMedio: rel?.acertoMedio ?? null,
      melhorNota,
    },
    personalizados: null, // TODO(dados): aba "Personalizados" (simulados próprios do aluno) ainda não wirada aqui.
  }
}

function PillTabs({ revisao, personalizados }: { revisao: number; personalizados: number | null }) {
  const items: [string, string, boolean][] = [
    ['Simulados Revisão', fmtInt(revisao), true],
    // TODO(dados): contagem real de personalizados — fallback exemplo enquanto não wirado.
    ['Personalizados', personalizados != null ? fmtInt(personalizados) : '6', false],
  ]
  return (
    <Row gap={4} style={{ padding: 4, borderRadius: 15, background: 'var(--track)', flexWrap: 'nowrap' }}>
      {items.map(([t, n, on]) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 12, fontSize: 14, fontWeight: on ? 800 : 700, background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--ink)' : 'var(--muted)', boxShadow: on ? '0 2px 8px rgba(30,15,80,.1)' : 'none' }}>
          <Icon n={t === 'Personalizados' ? 'plus' : 'clip'} size={16} />{t}
          <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)' }}>{n}</span>
        </span>
      ))}
    </Row>
  )
}

function FilterChips({ total, andamento, concluidos }: { total: number; andamento: number; concluidos: number }) {
  const items: [string, string, boolean][] = [
    ['Todos', fmtInt(total), true],
    ['Em andamento', fmtInt(andamento), false],
    ['Concluídos', fmtInt(concluidos), false],
  ]
  return (
    <Row gap={6}>
      {items.map(([t, n, on]) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 99, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--chip)' : 'var(--surface)', color: on ? 'var(--brand)' : 'var(--ink)', fontSize: 13, fontWeight: on ? 800 : 700 }}>
          {t}<span style={{ opacity: 0.7, fontWeight: 600 }}>{n}</span>
        </span>
      ))}
    </Row>
  )
}

export default async function RealizadosPage() {
  const { andamento, concluidos, stats, personalizados } = await carregar()

  return (
    <>
      <Crumbs items={[['Central de Estudos', R.central], ['Questões e Simulados', R.questoes]]} />
      <Tabs items={['Simulados', 'Banco de questões', 'Realizados', 'Recomendado']} links={[R.questoes, R.banco, R.realizados, R.recomendado]} active={2} />

      <PageHeader title="Simulados realizados" sub="Revise suas notas, refaça simulados e acompanhe o que ainda está em andamento." />

      <Grid cols={4} gap={12}>
        <Stat icon="clip" value={fmtInt(stats.feitos)} label="simulados feitos" />
        <Stat icon="check" value={fmtInt(stats.concluidos)} label="concluídos" />
        <Stat icon="chart" value={stats.acertoMedio != null ? `${fmtInt(stats.acertoMedio)}%` : '—'} label="média de acertos" />
        <Stat icon="star" value={fmtNota(stats.melhorNota)} label="melhor nota" />
      </Grid>

      <Row gap={12} style={{ justifyContent: 'space-between' }}>
        <PillTabs revisao={stats.feitos} personalizados={personalizados} />
        <FilterChips total={stats.feitos} andamento={andamento.length} concluidos={concluidos.length} />
      </Row>

      {/* Em andamento */}
      {andamento.length > 0 && (
        <Col gap={14}>
          <Row gap={10}>
            <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--peachBg)', color: 'var(--accentInk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="clock" size={15} /></span>
            <H3>Em andamento</H3>
            <Muted size={13}>{fmtInt(andamento.length)}</Muted>
          </Row>
          <Grid cols={3} gap={14}>
            {andamento.map((s) => (
              <Card key={s.id} pad={0} style={{ overflow: 'hidden', gap: 0 }}>
                <div style={{ position: 'relative' }}>
                  <Media ratio="banner" fallback={<Cover line="SIMULADO" sigla={siglaDe(s.titulo)} grad={s.grad} big={22} />} style={{ height: 108 }} />
                  <span style={{ position: 'absolute', right: 12, top: 12, display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 10px', borderRadius: 99, background: 'rgba(241,194,50,.95)', color: '#2A1A55', fontSize: 11, fontWeight: 800 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2A1A55' }} />EM ANDAMENTO
                  </span>
                </div>
                <Col gap={10} style={{ padding: '14px 16px 16px' }}>
                  <b style={{ fontSize: 14.5, color: 'var(--ink)' }}>{s.titulo}</b>
                  <Col gap={6}>
                    <Row gap={8} style={{ justifyContent: 'space-between' }}>
                      <Muted size={12}>{s.questao}</Muted>
                      <b style={{ fontSize: 12, color: 'var(--ink)' }}>{s.pct}%</b>
                    </Row>
                    <Bar pct={s.pct} color={GBAR} h={6} />
                  </Col>
                  <Btn kind="primary" icon="play" href={R.resultado}>Continuar</Btn>
                </Col>
              </Card>
            ))}
          </Grid>
        </Col>
      )}

      {/* Concluídos */}
      <Col gap={14}>
        <Row gap={10}>
          <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--okBg)', color: 'var(--ok)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="check" size={15} /></span>
          <H3>Concluídos</H3>
          <Muted size={13}>{fmtInt(concluidos.length)}</Muted>
        </Row>
        {concluidos.length === 0 ? (
          <Muted size={13}>Você ainda não concluiu nenhum simulado.</Muted>
        ) : (
          <Grid cols={3} gap={14}>
            {concluidos.map((c) => (
              <Card key={c.id} pad={0} style={{ overflow: 'hidden', gap: 0, flexDirection: 'row', minHeight: 132 }}>
                <div style={{ width: 124, flexShrink: 0 }}>
                  <Media ratio="2:3" style={{ height: '100%' }} fallback={<Cover line="SIMULADO" sigla={siglaDe(c.titulo)} grad={c.grad} big={15} />} />
                </div>
                <Col gap={6} style={{ flex: 1, minWidth: 0, padding: '14px 16px' }}>
                  <Row gap={8} style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--ok)' }}><Icon n="check" size={13} />Concluído</span>
                    <Muted size={11.5}>{c.data}</Muted>
                  </Row>
                  <b style={{ fontSize: 14.5, lineHeight: 1.3, color: 'var(--ink)' }}>{c.titulo}</b>
                  <Row gap={8} style={{ marginTop: 'auto', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                    {c.notaLiberada && c.nota != null
                      ? <Tag kind={c.tom}>Nota {fmtNota(c.nota)}</Tag>
                      : <Tag kind="blue">Aguardando nota</Tag>}
                    <Row gap={5} style={{ flexWrap: 'nowrap' }}>
                      <IBtn icon="chart" label="Ver resultado" size={30} href={R.resultado} />
                      <IBtn icon="play" label="Refazer" size={30} href={R.resultado} />
                      <IBtn icon="download" label="Baixar caderno" size={30} />
                    </Row>
                  </Row>
                </Col>
              </Card>
            ))}
          </Grid>
        )}
      </Col>
    </>
  )
}
