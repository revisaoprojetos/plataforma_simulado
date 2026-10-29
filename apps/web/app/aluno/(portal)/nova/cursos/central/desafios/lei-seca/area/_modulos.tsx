'use client'
// Seção interativa (abas Módulos / Desempenho) da visão do Desafio de Lei Seca.
// Toggle por estado local; conteúdo presentational com os primitivos de /components/nova/ui.
import * as React from 'react'
import { Card, Grid, Row, Col, H2, H3, Muted, P, Btn, Tag, Bar, Cover, Media, SecHead } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'

// Módulos (leis) REAIS do aluno — vêm do servidor (carregarTrilhaLeituraAluno → page.tsx).
// `acerto` por módulo não é carregado aqui (custo por-módulo); o card cai no texto "Sem questões ainda".
export type Mod = { sigla: string; nome: string; capa: string | null; status: 'Em andamento' | 'Concluída' | 'Não iniciada'; feitas: number; total: number; pct: number; acerto: number | null; cta: string }
const FILTROS = ['Todas', 'Em andamento', 'Concluídas', 'Não iniciadas'] as const

// TODO(dados): aba "Desempenho" (acerto por lei, questões na semana, dispositivos que mais erra) —
// sem loader agregado pronto por módulo; mantém EXEMPLO até existir uma consulta por disciplina/assunto.
const ACERTO_LEI = [
  { nome: 'Constituição Federal', pct: 68 },
  { nome: 'Código Tributário Nacional', pct: 71 },
  { nome: 'Lei de Licitações', pct: 82 },
  { nome: 'Improbidade Administrativa', pct: 55 },
]
const MAIS_ERRA = [
  { art: 'Art. 150, VI, a', tema: 'Imunidade recíproca', lei: 'CF/88', erros: 4 },
  { art: 'Art. 75, II', tema: 'Dispensa por valor', lei: 'L. 14.133', erros: 3 },
  { art: 'Art. 142', tema: 'Lançamento tributário', lei: 'CTN', erros: 3 },
  { art: 'Art. 5º, LXXIII', tema: 'Ação popular', lei: 'CF/88', erros: 2 },
  { art: 'Art. 10', tema: 'Dano ao erário', lei: 'L. 8.429', erros: 2 },
]
const SEMANA = [18, 24, 12, 31, 22, 28, 20] // TODO(dados): questões por dia na semana

function statusTag(s: Mod['status']) {
  if (s === 'Concluída') return <Tag kind="green" icon="check">Concluída</Tag>
  if (s === 'Em andamento') return <Tag kind="brand" icon="play">Em andamento</Tag>
  return <Tag kind="gray">Não iniciada</Tag>
}

function contaFiltro(mods: Mod[], f: (typeof FILTROS)[number]) {
  if (f === 'Todas') return mods.length
  if (f === 'Em andamento') return mods.filter((m) => m.status === 'Em andamento').length
  if (f === 'Concluídas') return mods.filter((m) => m.status === 'Concluída').length
  return mods.filter((m) => m.status === 'Não iniciada').length
}

export function ModulosArea({ modulos }: { modulos: Mod[] }) {
  const [aba, setAba] = React.useState<'modulos' | 'desempenho'>('modulos')
  const [filtro, setFiltro] = React.useState<(typeof FILTROS)[number]>('Todas')

  const lista = modulos.filter((m) => {
    if (filtro === 'Todas') return true
    if (filtro === 'Em andamento') return m.status === 'Em andamento'
    if (filtro === 'Concluídas') return m.status === 'Concluída'
    return m.status === 'Não iniciada'
  })

  return (
    <Col gap={18}>
      {/* segmentado Módulos / Desempenho */}
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', gap: 4, padding: 4, borderRadius: 13, background: 'var(--track)' }}>
        {(['modulos', 'desempenho'] as const).map((k) => {
          const on = aba === k
          return (
            <button key={k} type="button" onClick={() => setAba(k)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 10, fontSize: 13, whiteSpace: 'nowrap', border: 0, cursor: 'pointer', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--ink)' : 'var(--muted)', fontWeight: on ? 800 : 700, boxShadow: on ? '0 2px 8px rgba(30,15,80,.1)' : undefined }}>
              <Icon n={k === 'modulos' ? 'layers' : 'chart'} size={15} />{k === 'modulos' ? 'Módulos' : 'Desempenho'}
            </button>
          )
        })}
      </div>

      {aba === 'modulos' ? (
        <>
          {/* chips de filtro */}
          <Row gap={8}>
            {FILTROS.map((f) => {
              const on = filtro === f
              return (
                <button key={f} type="button" onClick={() => setFiltro(f)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 99, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--brand)' : 'var(--surface)', color: on ? '#FFFFFF' : 'var(--ink)', fontSize: 13, fontWeight: on ? 800 : 700, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  {f}
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 99, background: on ? 'rgba(255,255,255,.22)' : 'var(--chip)', color: on ? '#FFFFFF' : 'var(--brand)' }}>{contaFiltro(modulos, f)}</span>
                </button>
              )
            })}
          </Row>

          {lista.length === 0 ? (
            <Card style={{ alignItems: 'center', textAlign: 'center', padding: '40px 24px' }}>
              <Muted size={13}>Nenhuma lei disponível para você neste desafio ainda.</Muted>
            </Card>
          ) : (
          <Grid min={260} gap={16}>
            {lista.map((m, i) => (
              <Card key={m.nome + i} pad={0} style={{ overflow: 'hidden' }} className="lift">
                <Media ratio="16:9" img={m.capa ?? undefined} fallback={<Cover line="LEI SECA" sigla={m.sigla} />} />
                <Col gap={10} style={{ padding: 16 }}>
                  {statusTag(m.status)}
                  <H3>{m.nome}</H3>
                  <Row gap={8} style={{ justifyContent: 'space-between' }}>
                    <Muted size={12}>{m.feitas} de {m.total} aulas</Muted>
                    <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{m.pct}%</b>
                  </Row>
                  <Bar pct={m.pct} />
                  <Row gap={8} style={{ justifyContent: 'space-between', marginTop: 2 }}>
                    {m.acerto != null ? <Muted size={12}>Acerto <b style={{ color: 'var(--ink)' }}>{m.acerto}%</b></Muted> : <Muted size={12}>Sem questões ainda</Muted>}
                    <Btn kind={m.status === 'Concluída' ? 'secondary' : 'primary'} size="sm" icon={m.status === 'Não iniciada' ? 'play' : 'arrow'} style={{ marginTop: 'auto' }}>{m.cta}</Btn>
                  </Row>
                </Col>
              </Card>
            ))}
          </Grid>
          )}
        </>
      ) : (
        <Grid min={300} gap={16}>
          <Card>
            <SecHead title="Acerto por lei" sub="Questões respondidas nas aulas" />
            <Col gap={12}>
              {ACERTO_LEI.map((a) => (
                <Col key={a.nome} gap={6}>
                  <Row gap={8} style={{ justifyContent: 'space-between' }}>
                    <Muted size={12.5}>{a.nome}</Muted>
                    <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{a.pct}%</b>
                  </Row>
                  <Bar pct={a.pct} />
                </Col>
              ))}
            </Col>
          </Card>

          <Card>
            <SecHead title="Questões na semana" />
            <b style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--ink)' }}>{(155).toLocaleString('pt-BR')} questões</b>
            <Row gap={8} style={{ alignItems: 'flex-end', height: 90, marginTop: 6 }}>
              {SEMANA.map((v, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: '100%', height: `${(v / Math.max(...SEMANA)) * 72}px`, borderRadius: 6, background: 'var(--brand)' }} />
                  <span style={{ fontSize: 10.5, color: 'var(--muted2)' }}>{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][i]}</span>
                </div>
              ))}
            </Row>
          </Card>

          <Card style={{ gridColumn: '1 / -1' }}>
            <SecHead title="Dispositivos que você mais erra" right={<Btn kind="link" href="#">Revisar todos</Btn>} />
            <Col gap={2}>
              {MAIS_ERRA.map((d, i) => (
                <Row key={i} gap={12} style={{ padding: '12px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
                  <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{d.art}</b>
                    <Muted size={12}>{d.tema}</Muted>
                  </Col>
                  <Tag kind="gray">{d.lei}</Tag>
                  <Tag kind="red" icon="x">{d.erros} erros</Tag>
                </Row>
              ))}
            </Col>
          </Card>
        </Grid>
      )}
    </Col>
  )
}
