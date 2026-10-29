// Meus Cadernos (novo) — CadernosRevisao. Tela de menu (sem caminho).
// Abas Cadernos|Anotações|Grifos|Salvos + cadernos (automático/criados/diagnóstico) + criar/compartilhar.
// CONTEÚDO DE EXEMPLO — marcado com TODO(dados). Layout fiel ao canvas.
import { PageHeader, Card, Row, Col, H3, Muted, Tag, Btn, Tabs, Bar, GR } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'

export const dynamic = 'force-dynamic'

// ——— abas (TODO(dados): ligar às coleções reais do aluno) ———
const ABAS = ['Cadernos', 'Anotações', 'Grifos', 'Salvos']
const CONTAGENS: (number | null)[] = [4, 24, 57, 19]

type TagItem = { label: string; kind: 'green' | 'brand' | 'gold' | 'blue' | 'pink' }
type Caderno = { origem: string; itens: number; titulo: string; tags: TagItem[]; pct: number; meta: string; compartilhar: boolean }
const CADERNOS: Caderno[] = [
  { origem: 'Automático', itens: 38, titulo: 'Caderno de erros', tags: [{ label: 'Questões', kind: 'green' }], pct: 42, meta: 'atualizado hoje', compartilhar: false },
  { origem: 'Criado por você', itens: 46, titulo: 'Responsabilidade civil · revisão final', tags: [{ label: 'Questões', kind: 'green' }, { label: 'LegProc', kind: 'brand' }, { label: 'JurisClub', kind: 'gold' }], pct: 65, meta: 'editado ontem', compartilhar: true },
  { origem: 'Do diagnóstico', itens: 30, titulo: 'Crédito tributário · diagnóstico PGE/RS', tags: [{ label: 'Questões', kind: 'green' }, { label: 'LegProc', kind: 'brand' }], pct: 0, meta: 'criado em 14/10', compartilhar: true },
  { origem: 'Criado por você', itens: 22, titulo: 'Lei seca da Fazenda Pública', tags: [{ label: 'LegProc', kind: 'brand' }, { label: 'Anotações', kind: 'pink' }], pct: 80, meta: 'editado em 10/10', compartilhar: true },
]

export default function CadernosPage() {
  return (
    <>
      <PageHeader
        title="Meus Cadernos"
        sub="Tudo o que você montou, anotou, grifou e salvou na plataforma, num lugar só."
        right={<Btn kind="primary" icon="pen">Criar caderno</Btn>}
      />

      {/* TODO(dados): tornar as abas navegáveis quando as coleções tiverem rota própria */}
      <Tabs items={ABAS} active={0} counts={CONTAGENS} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))', gap: 16, alignItems: 'stretch' }}>
        {/* Criar caderno */}
        <a href="#" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', minHeight: 260, padding: 24, borderRadius: 20, border: '2px dashed var(--line2)', background: 'var(--surface)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--gold)', color: 'var(--goldInk)' }}><Icon n="plus" size={24} /></span>
          <b style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Criar caderno</b>
          <Muted size={12.5}>questões, artigos, teses e anotações</Muted>
        </a>

        {CADERNOS.map((c, i) => (
          <Card key={i} pad={0} style={{ overflow: 'hidden', gap: 0 }}>
            {/* capa/cabeçalho */}
            <div style={{ position: 'relative', background: GR.EXT, color: '#fff', padding: '16px 18px', minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '22px 22px' }} />
              <span style={{ position: 'relative', fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#E6DEFF' }}>{c.origem}</span>
              <span style={{ position: 'relative', fontFamily: 'Montserrat, sans-serif', fontStyle: 'italic', fontWeight: 800, fontSize: 28, color: 'var(--gold)' }}>{c.itens}</span>
            </div>
            {/* corpo */}
            <Col gap={12} style={{ padding: 18 }}>
              <H3>{c.titulo}</H3>
              <Row gap={6}>
                {c.tags.map((t, k) => <Tag key={k} kind={t.kind}>{t.label}</Tag>)}
              </Row>
              <Bar pct={c.pct} color="var(--gold)" />
              <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                <Muted size={12}>{c.pct}% resolvido</Muted>
                <Muted size={12}>{c.meta}</Muted>
              </Row>
              {c.compartilhar ? (
                <Btn kind="secondary" size="sm" icon="users" style={{ marginTop: 'auto' }}>Compartilhar na comunidade</Btn>
              ) : null}
            </Col>
          </Card>
        ))}
      </div>
    </>
  )
}
