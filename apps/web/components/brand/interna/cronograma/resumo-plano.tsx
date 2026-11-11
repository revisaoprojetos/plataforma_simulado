// Resumo do plano de estudo (cronograma) — componente de APRESENTAÇÃO. Recebe dados já prontos (props);
// nenhum cálculo/loader aqui (backend-first). Cores só por tokens. Sem estado => serve em server component.
import { Card, Row, Col, Muted, Btn, Bar, GBAR, Eyebrow, IconBox } from '@/components/nova/ui'

export type ResumoPlanoProps = {
  /** Aluno tem plano (adaptativo fixado) ou, no fluxo padrão, cronogramas liberados. */
  temPlano: boolean
  /** Nome do plano em foco (opcional). */
  titulo?: string | null
  feitasHoje?: number
  totalHoje?: number
  pctSemana?: number
  pendencias?: number
  /** Destino do botão "Abrir cronograma". */
  hrefAbrir: string
  /** Destino do botão "Gerar cronograma". */
  hrefGerar: string
  /** Destino de "Todos os cronogramas" (página única). Padrão: /aluno/cronograma. */
  hrefTodos?: string
  /** Texto auxiliar do estado sem plano. */
  textoVazio?: string
}

export function ResumoPlano(p: ResumoPlanoProps) {
  if (!p.temPlano) {
    return (
      <Card pad={20}>
        <Row gap={16} style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
          <IconBox icon="cal" s={48} />
          <Col gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow>Cronograma</Eyebrow>
            <b style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Criar meu cronograma</b>
            <Muted size={13}>{p.textoVazio ?? 'Monte seu plano de estudo semana a semana e acompanhe as metas de cada dia.'}</Muted>
          </Col>
          <Btn kind="primary" icon="plus" href={p.hrefGerar}>Criar cronograma</Btn>
        </Row>
      </Card>
    )
  }
  const total = p.totalHoje ?? 0
  const pct = p.pctSemana ?? 0
  return (
    <Card pad={20}>
      <Row gap={16} style={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <Col gap={4} style={{ flex: '1 1 260px', minWidth: 0 }}>
          <Eyebrow>Seu cronograma</Eyebrow>
          <b style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{p.titulo?.trim() || 'Cronograma de estudos'}</b>
          <Muted size={13}>
            {total > 0 ? `${p.feitasHoje ?? 0} de ${total} ${total === 1 ? 'meta' : 'metas'} de hoje concluídas` : 'Nenhuma meta para hoje'}
            {(p.pendencias ?? 0) > 0 ? ` · ${p.pendencias} atrasada${p.pendencias === 1 ? '' : 's'}` : ''}
          </Muted>
        </Col>
        <Col gap={6} style={{ flex: '1 1 220px', minWidth: 0 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted size={12.5}>Esta semana</Muted>
            <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{pct}%</b>
          </Row>
          <Bar pct={pct} color={GBAR} />
        </Col>
        <Row gap={8}>
          <Btn kind="secondary" href={p.hrefTodos ?? '/aluno/cronograma'}>Todos os cronogramas</Btn>
          <Btn kind="primary" icon="cal" href={p.hrefAbrir}>Abrir cronograma</Btn>
        </Row>
      </Row>
    </Card>
  )
}
