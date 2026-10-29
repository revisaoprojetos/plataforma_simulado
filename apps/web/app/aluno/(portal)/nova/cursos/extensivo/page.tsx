// Extensivo — ExtensivoRevisao. Porte fiel do canvas.
// REAL: nome do aluno, progresso agregado de leitura (materiais lidos/total) e "continue de onde parou".
// EXEMPLO/TODO(dados): grade de disciplinas por professor (não há modelo de "disciplina/curso Extensivo"
// nem fotos 2:3 dos professores); os atalhos "Comece por aqui"/"Material extra" são links reais.
import { PageHeader, Card, Col, Row, Muted, P, Tag, Btn, Bar, Seg, Media, Cover, GR, SecHead, Crumbs, IconBox } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { carregarCatalogoCursos } from '@/lib/nova/cursos'

export const dynamic = 'force-dynamic'

// 16:9 — atalhos "Comece por aqui" e "Material extra"
type Link16 = { line: string; sigla: string; grad: string; titulo: string; sub: string; href: string }
const COMECE: Link16[] = [
  { line: 'CRONOGRAMA', sigla: 'Cronograma', grad: 'linear-gradient(135deg,#3A1E5C,#7A3DB0)', titulo: 'Gerador de cronograma', sub: 'Monte o seu Cronograma Adaptativo', href: R.cronogramaMontar },
  { line: 'COMO ESTUDAR', sigla: 'Como Estudar', grad: 'linear-gradient(135deg,#241A52,#5B3FD0)', titulo: 'Módulo Como Estudar', sub: 'Orientações de método em vídeo', href: R.comoEstudar },
]
const EXTRA: Link16[] = [
  { line: 'ATUALIZAÇÕES', sigla: 'Compilado', grad: 'linear-gradient(135deg,#3A1E5C,#7A3DB0)', titulo: 'Compilado de Atualizações', sub: 'Aulas novas ou reorganizadas', href: R.extensivo },
  { line: 'LEGPROC', sigla: 'LegProc', grad: 'linear-gradient(135deg,#241A52,#5B3FD0)', titulo: 'LegProc · Legislação anotada', sub: 'Lei seca ligada às aulas', href: R.legproc },
  { line: 'TESES', sigla: 'Teses e Súmulas', grad: 'linear-gradient(135deg,#1E2A5C,#3F5BD0)', titulo: 'Teses e Súmulas', sub: 'Para a Advocacia Pública', href: R.extensivo },
  { line: 'GESTÃO', sigla: 'Gestão Emocional', grad: 'linear-gradient(135deg,#5C1E4A,#B03D8A)', titulo: 'Gestão Emocional', sub: 'Encontros ao vivo gravados', href: R.extensivo },
  { line: 'PREPARAÇÃO 360°', sigla: 'Preparação 360°', grad: 'linear-gradient(135deg,#241A52,#4A31B8)', titulo: 'Preparação 360°', sub: 'Encontros temáticos com os professores', href: R.extensivo },
]

// 2:3 — disciplinas
type Disc = { nome: string; prof: string; pct?: number }
const ESSENCIAIS: Disc[] = [
  { nome: 'Direito Administrativo', prof: 'Renério Castro', pct: 37 },
  { nome: 'Direito Constitucional', prof: 'Francisco Braga', pct: 22 },
  { nome: 'Direito Tributário', prof: 'Leandro Vieira', pct: 10 },
  { nome: 'Direito Ambiental', prof: 'Isadora Bueno' },
  { nome: 'Direito Processual Civil', prof: 'Maurício Cunha', pct: 15 },
  { nome: 'Direito Civil', prof: 'Luciano Figueiredo', pct: 5 },
  { nome: 'Direito Financeiro', prof: 'Renério Castro' },
  { nome: 'Processual do Trabalho', prof: 'Breno Lenza' },
  { nome: 'Direito do Trabalho', prof: 'Breno Lenza' },
]
const COMPLEMENTARES: Disc[] = [
  { nome: 'Direito Previdenciário Público', prof: 'Francisco Braga' },
  { nome: 'Direito Previdenciário', prof: 'Adriana Menezes' },
  { nome: 'Direito Urbanístico', prof: 'Fernando Leustada' },
  { nome: 'Direito Empresarial', prof: 'Cristiane Pauli' },
  { nome: 'Direito Penal', prof: 'Leandro Borges', pct: 33 },
  { nome: 'Processual Penal', prof: 'Leandro Borges' },
  { nome: 'Legislação Penal Especial', prof: 'Leandro Borges' },
  { nome: 'Direito Agrário', prof: 'Stanley Costa' },
  { nome: 'Direito Econômico', prof: 'Lucas Alves' },
  { nome: 'Direito do Consumidor', prof: 'Sílvio Soares' },
]

function Link16Card({ c }: { c: Link16 }) {
  return (
    <a href={c.href} style={{ display: 'block' }}>
      <Card pad={0} style={{ overflow: 'hidden', gap: 0, height: '100%' }}>
        <Media ratio="16:9" fallback={<Cover line={c.line} sigla={c.sigla} grad={c.grad} big={c.sigla.length > 12 ? 16 : 20} />} />
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap', padding: 14 }}>
          <Col gap={2} style={{ minWidth: 0 }}>
            <b style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{c.titulo}</b>
            <Muted size={11.5}>{c.sub}</Muted>
          </Col>
          <Icon n="chev" size={16} style={{ color: 'var(--muted2)', flexShrink: 0 }} />
        </Row>
      </Card>
    </a>
  )
}

function DiscCard({ d }: { d: Disc }) {
  const andamento = d.pct != null
  return (
    <a href={R.extensivo} style={{ display: 'block' }}>
      <Card pad={0} style={{ overflow: 'hidden', gap: 0, height: '100%' }}>
        <div style={{ position: 'relative' }}>
          <Media ratio="2:3" fallback={<Cover line={d.prof} sigla={d.nome} grad={GR.EXT} big={15} />} />
          {andamento ? <span style={{ position: 'absolute', top: 8, left: 8, padding: '3px 8px', borderRadius: 99, background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 11, fontWeight: 800 }}>{d.pct}%</span> : null}
        </div>
        <Col gap={7} style={{ padding: 12 }}>
          <b style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.25 }}>{d.nome}</b>
          <Muted size={11.5}>{andamento ? 'Em andamento' : 'Não iniciada'}</Muted>
          <Bar pct={d.pct ?? 0} h={4} />
        </Col>
      </Card>
    </a>
  )
}

export default async function ExtensivoPage() {
  // DADO REAL: nome do aluno, progresso agregado de leitura e "continue de onde parou".
  const cat = await carregarCatalogoCursos()
  const primeiroNome = (cat.nome || 'Aluno').split(' ')[0]
  const pct = cat.totalPdfs ? Math.min(100, Math.round((cat.totalLidos / cat.totalPdfs) * 100)) : 0
  const cont = cat.continue
  return (
    <>
      <Crumbs items={[['Cursos', R.cursos], ['Extensivo', '#']]} />

      <PageHeader
        eyebrow="Cursos"
        title="Extensivo"
        sub="A base completa para PGEs e PGMs, com o seu Cronograma Adaptativo."
        right={<Seg items={['Meus cursos', 'Extensivo', 'Central de Estudos']} active={1} links={[R.cursos, '#', R.central]} />}
      />

      {/* Banner */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, background: 'linear-gradient(120deg,#160F33 0%,#2A1A6A 55%,#3A2490 100%)', color: '#fff', padding: '30px 32px' }}>
        <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '44px 44px', WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 60%)', maskImage: 'linear-gradient(90deg,transparent,#000 60%)' }} />
        <Row style={{ position: 'relative', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
          <Col gap={10} style={{ maxWidth: 640 }}>
            <Tag kind="gold" icon="layers">Extensivo</Tag>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>Extensivo Advocacia Pública</h1>
            <P size={14}><span style={{ color: '#E6DEFF' }}>Esse é o nosso Extensivo completo, {primeiroNome}.</span></P>
          </Col>
          <Col gap={0} style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            {/* REAL: progresso agregado de leitura (materiais lidos / total acessível). */}
            <b style={{ fontSize: 40, fontWeight: 800, color: 'var(--gold)', lineHeight: 1, letterSpacing: '-0.03em' }}>{pct}%</b>
            <span style={{ fontSize: 12, color: '#E6DEFF', whiteSpace: 'nowrap' }}>{cat.totalLidos.toLocaleString('pt-BR')} de {cat.totalPdfs.toLocaleString('pt-BR')} materiais</span>
          </Col>
        </Row>
      </section>

      {/* Continue de onde parou — último material lido (REAL) */}
      <Card>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 16 }}>
          <Row gap={14} style={{ flexWrap: 'nowrap', minWidth: 0 }}>
            <IconBox icon="play" s={46} />
            <Col gap={3} style={{ minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>Continue de onde parou</span>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{cont ? cont.titulo : 'Comece pelo primeiro material do seu curso'}</div>
              <Muted size={12}>{cont?.cursoNome ? `${cont.cursoNome} · último material aberto` : 'Abra um curso para começar a estudar'}</Muted>
            </Col>
          </Row>
          <Row gap={10} style={{ flexWrap: 'nowrap' }}>
            <Btn kind="secondary" icon="cal" href={R.cronograma}>Abrir cronograma</Btn>
            <Btn kind="primary" icon="play" href={cont ? R.painelLeitor(cont.docId) : R.cursos}>Continuar</Btn>
          </Row>
        </Row>
      </Card>

      {/* Abas da área */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <Seg items={['Tudo', 'Essenciais', 'Complementares', 'Material extra']} active={0} />
        <Btn kind="secondary" size="sm" icon="chart">Meus avanços</Btn>
      </Row>

      {/* Comece por aqui */}
      <Col gap={14}>
        <SecHead title="Comece por aqui" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {COMECE.map((c) => <Link16Card key={c.titulo} c={c} />)}
        </div>
      </Col>

      {/* Disciplinas essenciais */}
      <Col gap={14}>
        <SecHead title="Disciplinas essenciais" right={<Muted size={12.5}>{ESSENCIAIS.length} disciplinas</Muted>} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))', gap: 14, alignItems: 'stretch' }}>
          {ESSENCIAIS.map((d) => <DiscCard key={d.nome} d={d} />)}
        </div>
      </Col>

      {/* Disciplinas complementares */}
      <Col gap={14}>
        <SecHead title="Disciplinas complementares" right={<Muted size={12.5}>{COMPLEMENTARES.length} disciplinas</Muted>} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))', gap: 14, alignItems: 'stretch' }}>
          {COMPLEMENTARES.map((d) => <DiscCard key={d.nome} d={d} />)}
        </div>
      </Col>

      {/* Material extra */}
      <Col gap={14}>
        <SecHead title="Material extra" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
          {EXTRA.map((c) => <Link16Card key={c.titulo} c={c} />)}
        </div>
      </Col>
    </>
  )
}
