// HOME do Cronograma: "Meus cronogramas" + "Modelos" + "Criar novo". Server component — busca/ordem/
// paginação são por querystring (GET), calculadas no servidor (lib/cronograma/meus.ts).
import Link from 'next/link'
import { Card, Row, Col, Muted, Btn, SecHead, IconBox } from '@/components/nova/ui'
import type { MeusCronogramas, OrdemMeus } from '@/lib/cronograma/meus'
import { MeusCronogramasLista } from './meus-lista'
import { ModelosGrid } from './modelos-grid'

const INPUT: React.CSSProperties = { height: 40, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', padding: '0 12px', fontSize: 13.5, minWidth: 0 }

function hrefPag(q: string, ord: OrdemMeus, pg: number) {
  const p = new URLSearchParams()
  if (q) p.set('q', q)
  if (ord !== 'recentes') p.set('ord', ord)
  if (pg > 0) p.set('pg', String(pg))
  const s = p.toString()
  return `/aluno/cronograma${s ? `?${s}` : ''}`
}

export function CronogramaHome({ dados, q, ord }: { dados: MeusCronogramas; q: string; ord: OrdemMeus }) {
  const podeCriar = dados.tipos.revisao || dados.tipos.adaptativo
  const paginas = Math.max(1, Math.ceil(dados.total / dados.porPagina))
  return (
    <Col gap={28}>
      <section>
        <SecHead
          title="Meus cronogramas"
          sub="Abra, renomeie ou arquive os planos que você criou."
          right={podeCriar ? <Btn kind="gold" size="sm" icon="plus" href="/aluno/cronograma?criar">Criar novo</Btn> : undefined}
        />
        <div style={{ height: 12 }} />
        {dados.totalGeral > 1 ? (
          <form method="get" action="/aluno/cronograma" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <input name="q" defaultValue={q} placeholder="Buscar cronograma…" aria-label="Buscar cronograma" style={{ ...INPUT, flex: '1 1 220px' }} />
            <select name="ord" defaultValue={ord} aria-label="Ordenar" style={INPUT}>
              <option value="recentes">Mais recentes</option>
              <option value="antigos">Mais antigos</option>
              <option value="nome">Nome (A–Z)</option>
            </select>
            <Btn kind="secondary" size="sm" type="submit" style={{ height: 40 }}>Aplicar</Btn>
          </form>
        ) : null}

        {dados.totalGeral === 0 ? (
          <Card pad={28} style={{ alignItems: 'center', textAlign: 'center' }}>
            <IconBox icon="cal" s={52} />
            <b style={{ fontSize: 16, color: 'var(--ink)' }}>Você ainda não criou nenhum cronograma</b>
            <Muted>{podeCriar ? 'Crie o primeiro: leva poucos minutos e fica guardado na sua conta.' : 'Nenhum cronograma foi liberado para você ainda. Fale com o suporte para saber como ter acesso.'}</Muted>
            {podeCriar ? <Btn kind="gold" icon="plus" href="/aluno/cronograma?criar">Criar meu primeiro cronograma</Btn> : null}
          </Card>
        ) : dados.total === 0 ? (
          <Card pad={22}><Muted>Nenhum cronograma encontrado para “{q}”. <Link href="/aluno/cronograma" style={{ color: 'var(--brand)', fontWeight: 700 }}>Limpar busca</Link></Muted></Card>
        ) : (
          <MeusCronogramasLista itens={dados.itens} />
        )}

        {paginas > 1 ? (
          <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <Muted size={12.5}>Página {dados.pagina + 1} de {paginas} · {dados.total} cronogramas</Muted>
            <Row gap={8}>
              {dados.pagina > 0 ? <Btn kind="secondary" size="xs" icon="back" href={hrefPag(q, ord, dados.pagina - 1)}>Anterior</Btn> : null}
              {dados.pagina < paginas - 1 ? <Btn kind="secondary" size="xs" href={hrefPag(q, ord, dados.pagina + 1)}>Próxima</Btn> : null}
            </Row>
          </Row>
        ) : null}
      </section>

      {dados.tipos.revisao && dados.modelos.length > 0 ? (
        <section>
          <SecHead title="Modelos" sub="Comece de um modelo pronto liberado para você." right={<Btn kind="secondary" size="sm" href="/aluno/cronograma?criar">Criar do zero</Btn>} />
          <div style={{ height: 12 }} />
          <ModelosGrid modelos={dados.modelos} />
        </section>
      ) : null}
    </Col>
  )
}
