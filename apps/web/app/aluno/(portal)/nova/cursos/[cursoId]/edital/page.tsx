// Edital (como estudar) — EditalRevisao. Porte fiel do canvas.
// REAL: título do curso (pasta da Biblioteca) no cabeçalho/breadcrumb.
// EXEMPLO/TODO(dados): este é um CONFIGURADOR de conciliação edital↔cronograma. NÃO existe modelo de
// vínculo edital→conteúdo, nem "data da prova" por curso, nem prévia por disciplina/incidência — tudo
// isso (passos 1 e 2, "45 dias", caderno de erros) fica como exemplo até haver backend.
import { Card, Col, Row, H2, Muted, P, Eyebrow, Tag, Btn, Bar, Media, Cover, GR, Crumbs, IconBox } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { carregarCurso } from '@/lib/nova/cursos'

export const dynamic = 'force-dynamic'

type Params = { cursoId: string }

// ——— Passo 1: opções de como estudar ———
type Opcao = { icon: IconName; titulo: string; texto: string; itens: string[]; selecionada?: boolean; recomendada?: boolean }
const OPCOES: Opcao[] = [
  { icon: 'shuffle', titulo: 'Conciliar com meu cronograma', texto: 'O Extensivo continua e as metas do edital entram no seu Cronograma Adaptativo até a prova.', itens: ['Nada do que você estudou se perde', 'O que é comum conta para os dois', 'Revisão final 100% edital'], selecionada: true, recomendada: true },
  { icon: 'flag', titulo: 'Seguir o cronograma do edital', texto: 'O Extensivo pausa até a prova, com todo o progresso guardado. Você estuda só o plano do edital.', itens: ['Plano focado só na PGE/RS', 'Extensivo volta depois da prova'] },
  { icon: 'book', titulo: 'Só quero o curso', texto: 'Seu cronograma não muda. O curso fica em Cursos para você estudar por conta própria.', itens: ['Sem metas novas no cronograma', 'Acesso livre às aulas do curso'] },
]

// ——— Passo 2: prévia da conciliação ———
type Inc = 'Alta' | 'Média' | 'Baixa'
type Acao = 'Estudar agora' | 'Revisar até a prova' | 'Depois da prova'
type Disc = { nome: string; pct: number; inc: Inc; acao: Acao }
const DISCIPLINAS: Disc[] = [
  { nome: 'Constitucional', pct: 22, inc: 'Alta', acao: 'Estudar agora' },
  { nome: 'Administrativo', pct: 37, inc: 'Alta', acao: 'Revisar até a prova' },
  { nome: 'Tributário', pct: 10, inc: 'Alta', acao: 'Estudar agora' },
  { nome: 'Processo Civil', pct: 15, inc: 'Média', acao: 'Estudar agora' },
  { nome: 'Financeiro', pct: 0, inc: 'Média', acao: 'Estudar agora' },
  { nome: 'Ambiental', pct: 0, inc: 'Baixa', acao: 'Depois da prova' },
]
const INC_KIND: Record<Inc, 'red' | 'gold' | 'green'> = { Alta: 'red', Média: 'gold', Baixa: 'green' }

type Erro = { tema: string; origem: string }
const ERROS: Erro[] = [
  { tema: 'Controle de constitucionalidade estadual', origem: 'Constitucional · 6 erros · Simulado PGE/RS 02' },
  { tema: 'Licitações: dispensa e inexigibilidade', origem: 'Administrativo · 5 erros · Questões da aula 21' },
  { tema: 'ICMS: substituição tributária', origem: 'Tributário · 4 erros · Simulado PGE/RS 01' },
  { tema: 'Precatórios e RPV', origem: 'Processo Civil · 3 erros · Simulado AGU 02' },
]

const RESUMO = [
  { icon: 'layers' as IconName, titulo: 'Disciplinas em comum · 6', texto: 'As 74 aulas do Extensivo que cobrem o edital sobem na fila e contam para os dois.' },
  { icon: 'plus' as IconName, titulo: 'Só do edital · 3', texto: 'Constituição do Estado do RS, ICMS no RS e Legislação estadual de servidores entram como metas novas.' },
  { icon: 'flag' as IconName, titulo: 'Regra sempre', texto: 'Nas duas semanas antes da prova, 100% edital. Depois da prova, o cronograma volta ao ritmo do Extensivo.' },
]

function AcaoPill({ acao }: { acao: Acao }) {
  if (acao === 'Estudar agora') return <Tag kind="brand">Estudar agora</Tag>
  if (acao === 'Revisar até a prova') return <Tag kind="gold">Revisar até a prova</Tag>
  return <Muted size={12.5}>Depois da prova</Muted>
}

export default async function EditalPage({ params }: { params: Promise<Params> }) {
  const { cursoId } = await params
  const curso = await carregarCurso(cursoId)
  const titulo = curso?.titulo ?? 'este curso'

  return (
    <>
      <Crumbs items={[['Cursos', R.cursos], [curso?.titulo ?? 'Curso', R.curso(cursoId)], ['Como estudar', '#']]} />

      {/* Banner do edital */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, background: GR.RS, color: '#fff', padding: 24 }}>
        <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '44px 44px' }} />
        <Row style={{ position: 'relative', justifyContent: 'space-between', flexWrap: 'nowrap', gap: 24, alignItems: 'center' }}>
          <Row gap={22} style={{ flexWrap: 'nowrap', minWidth: 0, alignItems: 'center' }}>
            <div style={{ width: 230, flexShrink: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.2)' }}>
              <Media ratio="16:9" fallback={<Cover line="CURSO" sigla={titulo.length > 14 ? `${titulo.slice(0, 14)}…` : titulo} grad={curso?.cor ? `linear-gradient(135deg, ${curso.cor}, color-mix(in oklab, ${curso.cor} 55%, #0b0a1a))` : GR.RS} big={16} />} />
            </div>
            <Col gap={8} style={{ minWidth: 0 }}>
              {/* TODO(dados): "edital publicado em"/"prova em" não existem como dado do curso. */}
              <Eyebrow color="var(--gold)">Como encaixar este curso nos seus estudos</Eyebrow>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>Como você quer estudar {titulo}?</h1>
              <P size={13}><span style={{ color: '#E6DEFF' }}>{titulo} · escolha conciliar com o seu cronograma ou estudar o curso por conta própria</span></P>
            </Col>
          </Row>
          <Col gap={0} style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            <b style={{ fontSize: 46, fontWeight: 800, color: 'var(--gold)', lineHeight: 1, letterSpacing: '-0.03em' }}>45</b>
            <span style={{ fontSize: 12, color: '#E6DEFF', whiteSpace: 'nowrap' }}>dias para a prova</span>
          </Col>
        </Row>
      </section>

      {/* Passo 1 */}
      <Col gap={14}>
        <H2>1. Escolha como estudar</H2>
        <Row gap={16} style={{ alignItems: 'stretch', flexWrap: 'nowrap' }}>
          {OPCOES.map((o) => (
            <Card key={o.titulo} style={{ flex: 1, border: o.selecionada ? '2px solid var(--brand)' : '1px solid var(--line)' }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={10}>
                  <span aria-hidden style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${o.selecionada ? 'var(--brand)' : 'var(--line2)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {o.selecionada ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--brand)' }} /> : null}
                  </span>
                  <IconBox icon={o.icon} s={34} />
                </Row>
                {o.recomendada ? <Tag kind="green">Recomendado para Passaporte</Tag> : null}
              </Row>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{o.titulo}</div>
              <P size={13}>{o.texto}</P>
              <Col gap={8}>
                {o.itens.map((it) => (
                  <Row key={it} gap={8} style={{ flexWrap: 'nowrap' }}>
                    <Icon n="check" size={15} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>{it}</span>
                  </Row>
                ))}
              </Col>
            </Card>
          ))}
        </Row>
      </Col>

      {/* Passo 2 */}
      <Col gap={14}>
        <H2>2. Confira o que muda</H2>
        <Card pad={24}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Col gap={4} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Prévia: o que muda se você conciliar</div>
              <Muted size={12.5}>A conciliação não divide o seu dia ao meio. Ela cruza o que você já estudou com a incidência de cada disciplina na prova.</Muted>
            </Col>
            <Tag kind="green" icon="check">Escolha marcada</Tag>
          </Row>

          <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, alignItems: 'start' }}>
            {/* Tabela por disciplina */}
            <Col gap={2}>
              {DISCIPLINAS.map((d) => (
                <Row key={d.nome} gap={14} style={{ flexWrap: 'nowrap', padding: '12px 4px', borderBottom: '1px solid var(--line)' }}>
                  <b style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', width: 140, flexShrink: 0 }}>{d.nome}</b>
                  <Row gap={10} style={{ flexWrap: 'nowrap', width: 140, flexShrink: 0 }}>
                    <Bar pct={d.pct} style={{ flex: 1 }} />
                    <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{d.pct}%</b>
                  </Row>
                  <span style={{ width: 70, flexShrink: 0 }}><Tag kind={INC_KIND[d.inc]}>{d.inc}</Tag></span>
                  <span style={{ marginLeft: 'auto' }}><AcaoPill acao={d.acao} /></span>
                </Row>
              ))}
            </Col>

            {/* Temas do caderno de erros */}
            <Col gap={10} style={{ padding: 16, borderRadius: 14, background: 'var(--surface2)' }}>
              <Muted size={12.5}>Temas específicos deste edital que têm origem no seu caderno de erros.</Muted>
              {ERROS.map((e) => (
                <Row key={e.tema} gap={10} style={{ justifyContent: 'space-between', flexWrap: 'nowrap', padding: '10px 12px', borderRadius: 12, background: 'var(--surface)', borderLeft: '3px solid var(--brand)' }}>
                  <Col gap={2} style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{e.tema}</b>
                    <Muted size={11.5}>{e.origem}</Muted>
                  </Col>
                  <Btn kind="link" href={R.cadernos}>Caderno</Btn>
                </Row>
              ))}
            </Col>
          </div>

          {/* Resumo: comum / só do edital / regra sempre */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
            {RESUMO.map((r) => (
              <Col key={r.titulo} gap={6} style={{ padding: 16, borderRadius: 14, background: 'var(--surface2)' }}>
                <Row gap={8}><Icon n={r.icon} size={16} style={{ color: 'var(--brand)' }} /><b style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{r.titulo}</b></Row>
                <P size={12.5}>{r.texto}</P>
              </Col>
            ))}
          </div>
        </Card>
      </Col>

      {/* Barra fixa com Salvar */}
      <div style={{ position: 'sticky', bottom: 16, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '14px 20px', borderRadius: 16, background: 'linear-gradient(120deg,#241A52,#2E1F6A)', color: '#fff', boxShadow: '0 18px 40px -20px rgba(30,15,80,.6)' }}>
        <span style={{ fontSize: 13 }}>Você pode mudar essa escolha quando quiser. <b style={{ color: 'var(--gold)' }}>Nada do que você já estudou se perde.</b></span>
        <Row gap={10}>
          <Btn kind="ghostdark" href={R.curso(cursoId)}>Ver a área do curso</Btn>
          <Btn kind="gold" icon="check">Salvar a minha escolha</Btn>
        </Row>
      </div>
    </>
  )
}
