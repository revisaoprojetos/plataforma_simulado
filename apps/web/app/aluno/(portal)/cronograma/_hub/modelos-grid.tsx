// "Modelos": cards dos modelos liberados ao aluno. Server component (só links; nada grava).
import { Card, Row, Col, Muted, Btn, Grid, IconBox } from '@/components/nova/ui'
import type { ModeloCronograma } from '@/lib/cronograma/meus'

export function ModelosGrid({ modelos }: { modelos: ModeloCronograma[] }) {
  return (
    <Grid min={300} gap={14}>
      {modelos.map((m) => (
        <Card key={m.id} pad={16} style={{ gap: 12 }}>
          <Row gap={11} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <IconBox icon="list" s={42} />
            <Col gap={3} style={{ minWidth: 0 }}>
              <b style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{m.nome}</b>
              {m.subtitulo ? <Muted size={12.5}>{m.subtitulo}</Muted> : null}
              <Muted size={12}>
                {[m.cargaHoraria ? `${m.cargaHoraria}h` : null, m.totalSemanas ? `${m.totalSemanas} semanas` : null].filter(Boolean).join(' · ')}
              </Muted>
            </Col>
          </Row>
          <div style={{ marginTop: 'auto' }}>
            <Btn kind="secondary" size="sm" icon="plus" href={`/aluno/cronograma?criar=revisao&modelo=${encodeURIComponent(m.id)}`}>Criar a partir deste modelo</Btn>
          </div>
        </Card>
      ))}
    </Grid>
  )
}
