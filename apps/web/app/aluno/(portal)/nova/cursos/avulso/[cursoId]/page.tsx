// Área do curso avulso (AreaCursoRevisao) — capa + trilha de materiais em sequência.
// DADO REAL: "curso" = pasta da Biblioteca acessível ao aluno. A trilha são os MATERIAIS reais da pasta
// (lido = concluído; 1º não lido = atual), cada um abrindo no leitor real (R.painelLeitor).
// EXEMPLO/TODO: "dias para a prova", avisos do professor, simulados do curso, Passaporte (sem modelo).
import { Crumbs, Hero, Card, Col, Row, H2, H3, Muted, P, Tag, Btn, Bar, Aviso } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { carregarCurso, type DocCurso } from '@/lib/nova/cursos'
import { getSessaoAluno } from '@/lib/aluno-session'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Estado = 'done' | 'atual' | 'aberto'

function Bolinha({ estado, num }: { estado: Estado; num: number }) {
  if (estado === 'done') return <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--ok)', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n="check" size={18} /></span>
  if (estado === 'atual') return <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--brand)', color: '#FFFFFF', boxShadow: '0 0 0 5px var(--chip)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>{num}</span>
  return <span style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--line2)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0, boxSizing: 'border-box' }}>{num}</span>
}

function EtapaRow({ d, num, estado }: { d: DocCurso; num: number; estado: Estado }) {
  const atual = estado === 'atual'
  return (
    <Row gap={16} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
      <Bolinha estado={estado} num={num} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px', borderRadius: 18, border: atual ? '2px solid var(--brand)' : '1px solid var(--line)', background: 'var(--surface)' }}>
        <Row gap={8}>
          <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>Etapa {num}</b>
          {estado === 'done' ? <Tag kind="green" icon="check">Concluído</Tag> : atual ? <Tag kind="brand">Em andamento</Tag> : <Tag kind="gray">A fazer</Tag>}
        </Row>
        <b style={{ fontSize: 16, color: 'var(--ink)' }}>{d.titulo}</b>
        <Row gap={8}>
          <Btn kind={atual ? 'primary' : 'secondary'} size="sm" icon="play" href={R.painelLeitor(d.id)}>{estado === 'done' ? 'Rever material' : atual ? 'Continuar etapa' : 'Abrir material'}</Btn>
        </Row>
      </div>
    </Row>
  )
}

export default async function Page({ params }: { params: Promise<{ cursoId: string }> }) {
  const { cursoId } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const curso = await carregarCurso(cursoId)

  if (!curso) {
    return (
      <>
        <Crumbs items={[['Cursos', R.cursos], ['Curso', '#']]} />
        <Card>
          <Aviso icon="lock" action={<Btn kind="secondary" icon="back" href={R.cursos}>Voltar aos cursos</Btn>}>
            Este curso não está disponível para você, ou ainda não tem conteúdo publicado.
          </Aviso>
        </Card>
      </>
    )
  }

  // Trilha = materiais diretos do curso; 1º não lido = etapa "atual".
  const docs = curso.documentos
  const idxAtual = docs.findIndex((d) => !d.lido)
  const etapaDe = (i: number): Estado => (docs[i].lido ? 'done' : i === idxAtual ? 'atual' : 'aberto')
  const feitos = docs.filter((d) => d.lido).length

  return (
    <>
      <Crumbs items={[['Cursos', R.cursos], [curso.titulo, '#']]} />

      {/* Capa */}
      <Hero>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Col gap={8} style={{ maxWidth: 560 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.2em', color: 'var(--gold)' }}>CURSO · BIBLIOTECA DO REVISÃO</span>
            <b style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.045em', color: '#fff' }}>{curso.titulo}</b>
            <P size={14}><span style={{ color: '#E6DEFF' }}>Os materiais deste curso, organizados em sequência para você avançar do começo ao fim.</span></P>
            <Row gap={8}>
              <span style={{ height: 28, padding: '0 11px', borderRadius: 99, background: 'rgba(255,255,255,.12)', fontSize: 12, fontWeight: 800, color: '#fff', display: 'inline-flex', alignItems: 'center' }}>{curso.pdfs.toLocaleString('pt-BR')} materiais</span>
              <span style={{ height: 28, padding: '0 11px', borderRadius: 99, background: 'rgba(255,255,255,.12)', fontSize: 12, fontWeight: 800, color: '#fff', display: 'inline-flex', alignItems: 'center' }}>{feitos.toLocaleString('pt-BR')} concluídos</span>
            </Row>
          </Col>
          <Col gap={8} style={{ alignItems: 'flex-end' }}>
            <b style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, color: '#fff' }}>{curso.pct}%</b>
            <span style={{ fontSize: 12.5, color: '#E6DEFF' }}>do curso concluído</span>
            {curso.continueDocId ? <Btn kind="gold" icon="play" href={R.painelLeitor(curso.continueDocId)}>Continuar de onde parei</Btn> : null}
          </Col>
        </Row>
      </Hero>

      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24, alignItems: 'start' }}>
        {/* Trilha */}
        <Card pad={22}>
          <div>
            <H2>Sua trilha de estudo</H2>
            <Muted size={12.5}>{feitos.toLocaleString('pt-BR')} de {curso.pdfs.toLocaleString('pt-BR')} materiais concluídos</Muted>
          </div>
          {docs.length ? (
            <Col gap={12}>
              {docs.map((d, i) => <EtapaRow key={d.id} d={d} num={i + 1} estado={etapaDe(i)} />)}
            </Col>
          ) : curso.subpastas.length ? (
            <Col gap={10}>
              {/* Curso organizado em módulos: abra cada módulo na página do curso. */}
              {curso.subpastas.map((m) => (
                <a key={m.id} href={`${R.curso(cursoId)}?pasta=${encodeURIComponent(m.id)}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface)' }}>
                  <Icon n="layers" size={16} style={{ color: 'var(--brand)' }} />
                  <b style={{ flex: 1, fontSize: 14, color: 'var(--ink)' }}>{m.nome}</b>
                  <Muted size={12}>{m.totalDocs.toLocaleString('pt-BR')} materiais</Muted>
                  <Icon n="chev" size={16} style={{ color: 'var(--muted2)' }} />
                </a>
              ))}
            </Col>
          ) : (
            <Muted size={13}>Este curso ainda não tem materiais publicados.</Muted>
          )}
        </Card>

        {/* Lateral */}
        <Col gap={14}>
          <Card pad={18}>
            <Row gap={14} style={{ alignItems: 'center' }}>
              <b style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--brand)' }}>{curso.pct}%</b>
              <div>
                <b style={{ fontSize: 14.5, color: 'var(--ink)' }}>concluído</b>
                <Muted size={12.5}>{curso.lidos.toLocaleString('pt-BR')} de {curso.pdfs.toLocaleString('pt-BR')} materiais</Muted>
              </div>
            </Row>
            <Bar pct={curso.pct} />
          </Card>

          {/* TODO(dados): avisos do professor por curso não existem como dado. */}
          <Card pad={18}>
            <H3>Avisos do professor</H3>
            <Muted size={12.5}>Sem avisos por aqui ainda. Quando a coordenação publicar um recado, ele aparece neste espaço.</Muted>
          </Card>

          {/* TODO(dados): vínculo curso→simulados não existe; simulados ficam na Central de Estudos. */}
          <Card pad={18}>
            <H3>Simulados</H3>
            <Muted size={12.5}>Faça simulados relacionados na Central de Estudos.</Muted>
            <Btn kind="secondary" size="sm" icon="arrow" href={R.questoes} style={{ alignSelf: 'flex-start' }}>Ir para Simulados</Btn>
          </Card>
        </Col>
      </div>

      {/* TODO(dados): Passaporte/conciliação com cronograma — sem modelo de vínculo edital→curso. */}
      <Aviso icon="star" action={<Btn kind="secondary" size="sm" href={R.central}>Conhecer a Central</Btn>}>
        <b style={{ color: 'var(--ink)' }}>Você tem acesso a este curso.</b> Pratique a legislação, as questões e os simulados na Central de Estudos para fixar o conteúdo.
      </Aviso>
    </>
  )
}
