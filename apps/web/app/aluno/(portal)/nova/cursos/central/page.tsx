// Central de Estudos (nova) — CentralEstudosRevisao. Ferramentas (LegProc, JurisClub, Questões) + Desafios.
// DADO REAL:
//   • Questões e Simulados → questões resolvidas + % de acerto (sessões de prova do aluno)
//   • LegProc              → materiais da Biblioteca acessíveis + lidos (progresso de leitura)
// EXEMPLO/TODO: JurisClub (julgados do mês) e Desafios (progresso) — sem loader barato nesta tela.
import { PageHeader, Card, Grid, Row, Col, H2, H3, Muted, P, Tag, Btn, Bar, GBAR, Cover, Media, Crumbs, Seg, IconBox } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { carregarCatalogoCursos, estatisticasQuestoesAluno } from '@/lib/nova/cursos'

export const dynamic = 'force-dynamic'

type FerramentaItem = { label: string; href: string }
type Ferramenta = {
  nome: string; linha: string; sigla: string; grad: string; desc: string
  pct: number; info: string; itens: FerramentaItem[]; abrir: string; cta: string
}

type Desafio = { icon: IconName; nome: string; desc: string; tag: string; tagKind: 'gold' | 'green'; href: string }
const DESAFIOS: Desafio[] = [
  { icon: 'highlight', nome: 'Desafio de Lei Seca', desc: '30 dias de artigos, com trilha, ranking e desempenho.', tag: 'Participar', tagKind: 'gold', href: R.desafioLeiSeca },
  { icon: 'gavel', nome: 'Desafio de Jurisprudência', desc: 'Julgados em sequência, com teste rápido a cada dia.', tag: 'Participar', tagKind: 'green', href: R.desafioJuris },
]

export default async function CentralEstudosPage() {
  const [cat, stats] = await Promise.all([carregarCatalogoCursos(), estatisticasQuestoesAluno()])
  const pctLido = cat.totalPdfs ? Math.min(100, Math.round((cat.totalLidos / cat.totalPdfs) * 100)) : 0

  const FERRAMENTAS: Ferramenta[] = [
    {
      nome: 'LegProc', linha: 'LEGPROC', sigla: 'legislação anotada',
      grad: 'linear-gradient(135deg,#2A1E4A,#4A31B8)',
      desc: 'Lei seca com os grifos do Revisão, organizada por assunto.',
      // REAL: materiais da Biblioteca acessíveis + lidos.
      pct: pctLido, info: `${cat.totalPdfs.toLocaleString('pt-BR')} materiais · ${cat.totalLidos.toLocaleString('pt-BR')} lidos`,
      itens: [
        { label: 'Abrir legislação anotada', href: R.legproc },
        { label: 'Meus grifos', href: R.painelGrifos },
        { label: 'Meus cursos', href: R.cursos },
      ],
      abrir: R.legproc, cta: 'Abrir LegProc',
    },
    {
      nome: 'JurisClub', linha: 'JURISCLUB', sigla: 'julgados do mês',
      grad: 'linear-gradient(135deg,#3A1A6A,#7A2F9E)',
      desc: 'Julgados do mês com teste rápido e caderno de jurisprudência.',
      // TODO(dados): progresso "X de N julgados" do mês — sem loader barato nesta tela.
      pct: 0, info: 'Julgados comentados do mês',
      itens: [
        { label: 'Top do mês', href: R.jurisclub },
        { label: 'Caderno do mês', href: R.jurisclub },
        { label: 'Edições anteriores', href: R.jurisclub },
      ],
      abrir: R.jurisclub, cta: 'Abrir JurisClub',
    },
    {
      nome: 'Questões e Simulados', linha: 'QUESTÕES E SIMULADOS', sigla: 'banco e provas',
      grad: 'linear-gradient(135deg,#1E2A6A,#2F5BD3)',
      desc: 'Banco de questões, simulados, resultados e diagnóstico.',
      // REAL: questões resolvidas + % de acerto do aluno.
      pct: stats.acerto, info: `${stats.resolvidas.toLocaleString('pt-BR')} questões · ${stats.acerto}% de acerto`,
      itens: [
        { label: 'Simulados', href: R.questoes },
        { label: 'Banco de questões', href: R.banco },
        { label: 'Realizados e recomendados', href: R.realizados },
      ],
      abrir: R.questoes, cta: 'Abrir Questões e Simulados',
    },
  ]

  return (
    <>
      <Crumbs items={[['Cursos', R.cursos], ['Central de Estudos', R.central]]} />
      <PageHeader
        eyebrow="Cursos"
        title="Central de Estudos"
        sub="Ferramentas para praticar e fixar o que você estuda no cronograma. Valem para todos os seus cursos."
        right={<Seg items={['Meus cursos', 'Extensivo', 'Central de Estudos']} active={2} links={[R.cursos, R.extensivo, R.central]} />}
      />

      {/* Ferramentas da Central */}
      <Grid cols={3} gap={20}>
        {FERRAMENTAS.map((f) => (
          <Card key={f.nome} pad={0} style={{ overflow: 'hidden', gap: 0 }}>
            <Media ratio="16:9" fallback={<Cover line={f.linha} sigla={f.sigla} grad={f.grad} />} />
            <Col gap={12} style={{ padding: 18, flex: 1 }}>
              <H3>{f.nome}</H3>
              <P size={13}>{f.desc}</P>
              <Row gap={10} style={{ flexWrap: 'nowrap' }}>
                <Bar pct={f.pct} color={GBAR} style={{ flex: 1 }} />
                <b style={{ fontSize: 13, color: 'var(--ink)' }}>{f.pct}%</b>
              </Row>
              <Muted size={12}>{f.info}</Muted>
              <Col gap={0} style={{ marginTop: 2 }}>
                {f.itens.map((it, k) => (
                  <a key={k} href={it.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 0', borderTop: k === 0 ? '1px solid var(--line)' : 'none', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{it.label}</span>
                    <Icon n="chev" size={16} style={{ color: 'var(--muted2)' }} />
                  </a>
                ))}
              </Col>
              <Btn kind="primary" icon="arrow" href={f.abrir} style={{ marginTop: 'auto' }}>{f.cta}</Btn>
            </Col>
          </Card>
        ))}
      </Grid>

      {/* Desafios */}
      <Col gap={14}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <H2>Desafios</H2>
          <Muted size={13}>Participe junto com a turma e suba nas Ligas.</Muted>
        </div>
        <Grid cols={2} gap={20}>
          {DESAFIOS.map((d) => (
            <a key={d.nome} href={d.href}>
              <Card pad={18}>
                <Row gap={14} style={{ flexWrap: 'nowrap' }}>
                  <IconBox icon={d.icon} bg="var(--peachBg)" fg="var(--accentInk)" s={48} />
                  <Col gap={3} style={{ flex: 1, minWidth: 0 }}>
                    <H3>{d.nome}</H3>
                    <Muted size={12.5}>{d.desc}</Muted>
                  </Col>
                  <Tag kind={d.tagKind}>{d.tag}</Tag>
                  <Icon n="chev" size={18} style={{ color: 'var(--muted2)' }} />
                </Row>
              </Card>
            </a>
          ))}
        </Grid>
      </Col>
    </>
  )
}
