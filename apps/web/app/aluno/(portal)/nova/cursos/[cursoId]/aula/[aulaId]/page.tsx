// Videoaula (VideoaulaRevisao) — player, atalhos da aula, anotações, lista de aulas, próxima aula.
// A plataforma NÃO tem modelo de vídeo/aula: o PLAYER e a lista de aulas do módulo ficam como EXEMPLO
// (// TODO(dados)). O que EXISTE é ligado: quando `aulaId` é um documento real da Biblioteca, usamos o
// TÍTULO real e o botão "PDF da aula" abre o leitor real (R.painelLeitor(aulaId)); breadcrumb usa o curso.
import { Crumbs, Card, Col, Row, H2, Bar, Btn, Muted, Eyebrow } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarLeitura } from '@/lib/conteudo/leitor'
import { carregarCurso } from '@/lib/nova/cursos'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// TODO(dados): aulas reais do módulo (não há modelo de "aula"/sequência de vídeo).
type Estado = 'done' | 'atual' | 'locked'
const AULAS_MODULO: { titulo: string; estado: Estado; tempo?: string }[] = [
  { titulo: 'Material anterior', estado: 'done' },
  { titulo: 'Este material', estado: 'atual' },
  { titulo: 'Próximo material', estado: 'locked' },
]

// TODO(dados): anotações do aluno com tempo de vídeo (sem player real, sem modelo de anotação por tempo).
const NOTAS = [
  { t: '06:40', txt: 'Exemplo de anotação vinculada ao tempo da videoaula.' },
]

function AulaMini({ a }: { a: { titulo: string; estado: Estado; tempo?: string } }) {
  const atual = a.estado === 'atual'
  const circulo = a.estado === 'locked'
    ? <span style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--line2)', boxSizing: 'border-box', flexShrink: 0 }} />
    : <span style={{ width: 24, height: 24, borderRadius: '50%', background: atual ? 'var(--brand)' : '#2EC77A', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n={atual ? 'play' : 'check'} size={atual ? 10 : 12} /></span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: atual ? 'var(--chip)' : 'transparent' }}>
      {circulo}
      <b style={{ flex: 1, fontSize: 13.5, fontWeight: atual ? 800 : 600, color: 'var(--ink)', lineHeight: 1.35 }}>{a.titulo}</b>
      {a.tempo ? <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, color: 'var(--muted)' }}>{a.tempo}</span> : null}
    </div>
  )
}

export default async function Page({ params }: { params: Promise<{ cursoId: string; aulaId: string }> }) {
  const { cursoId, aulaId } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  // Se aulaId for um documento real da Biblioteca → título + PDF reais; senão, exemplo.
  const [leitura, curso] = await Promise.all([
    carregarLeitura(aulaId, sessao.estudanteId).catch(() => null),
    carregarCurso(cursoId).catch(() => null),
  ])
  const temDoc = !!leitura
  const tituloAula = leitura?.titulo ?? 'Aula do curso'
  const cursoTitulo = curso?.titulo ?? 'Curso'
  const pdfHref = temDoc ? R.painelLeitor(aulaId) : R.curso(cursoId)

  // Atalhos "Nesta aula" — "PDF da aula" é REAL quando há documento; os demais são atalhos de área.
  const ATALHOS: { icon: IconName; titulo: string; sub: string; href: string; bg: string; fg: string }[] = [
    { icon: 'file', titulo: 'PDF da aula', sub: temDoc ? 'abrir no leitor' : 'material do curso', href: pdfHref, bg: 'var(--dangerBg)', fg: 'var(--danger)' },
    { icon: 'scale', titulo: 'LegProc', sub: 'legislação anotada', href: R.legproc, bg: 'var(--peachBg)', fg: 'var(--accentInk)' },
    { icon: 'gavel', titulo: 'JurisClub', sub: 'julgados do mês', href: R.jurisclub, bg: 'var(--infoBg)', fg: 'var(--info)' },
    { icon: 'qbook', titulo: 'Questões', sub: 'banco por disciplina', href: R.banco, bg: 'var(--okBg)', fg: 'var(--ok)' },
  ]

  return (
    <>
      <Crumbs items={[['Cursos', R.cursos], [cursoTitulo, R.curso(cursoId)], [tituloAula, '#']]} />

      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 330px', gap: 24, alignItems: 'start' }}>
        {/* Coluna principal */}
        <Col gap={18}>
          {/* Player — EXEMPLO (sem modelo de vídeo na plataforma). TODO(dados): player/stream real. */}
          <div style={{ position: 'relative', height: 430, borderRadius: 22, overflow: 'hidden', background: 'radial-gradient(120% 120% at 70% 30%,#4A31B8,#241A52 50%,#100A26)', color: '#FFFFFF', padding: '44px 50px', display: 'flex', flexDirection: 'column' }}>
            <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)', backgroundSize: '44px 44px' }} />
            <span style={{ position: 'relative', fontSize: 11, fontWeight: 800, letterSpacing: '.2em', color: '#E1D9FF' }}>{cursoTitulo.toUpperCase()}</span>
            <b style={{ position: 'relative', marginTop: 12, fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.15 }}>{tituloAula}</b>
            <span style={{ position: 'relative', marginTop: 10, maxWidth: 440, fontSize: 13, color: '#DCD3FF' }}>Pré-visualização de exemplo — a plataforma ainda não tem videoaula. Use o PDF da aula abaixo.</span>
            <button type="button" aria-label="Reproduzir (exemplo)" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 84, height: 84, borderRadius: '50%', border: 0, background: 'var(--gold)', color: 'var(--goldInk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 0 0 12px rgba(241,194,50,.2)' }}><Icon n="play" size={30} /></button>
          </div>

          {/* Título da aula + ações */}
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{tituloAula}</h2>
              <Muted size={13}>{cursoTitulo}</Muted>
            </div>
            <Row gap={8}>
              {temDoc ? <Btn kind="secondary" size="sm" icon="book" href={pdfHref}>Abrir no leitor</Btn> : null}
              <Btn kind="primary" size="sm" icon="arrow" href={R.banco}>Fazer questões</Btn>
            </Row>
          </Row>

          {/* Nesta aula */}
          <Col gap={12}>
            <H2>Nesta aula</H2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
              {ATALHOS.map((at) => (
                <a key={at.titulo} href={at.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, background: at.bg, color: at.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n={at.icon} size={18} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 14, color: 'var(--ink)' }}>{at.titulo}</b>
                    <span style={{ display: 'block', fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>{at.sub}</span>
                  </div>
                </a>
              ))}
            </div>
          </Col>

          {/* Anotações — EXEMPLO (sem modelo de anotação por tempo de vídeo). */}
          <Card pad={18}>
            <nav aria-label="Seções" style={{ display: 'flex', gap: 26, borderBottom: '1px solid var(--line)' }}>
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 4px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
                Minhas anotações
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, borderRadius: '3px 3px 0 0', background: 'var(--gold)' }} />
              </span>
              <a href={R.duvidas} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 4px', fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>
                Dúvidas da aula
              </a>
            </nav>
            {NOTAS.map((n) => (
              <Row key={n.t} gap={12} style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--surface2)', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{n.t}</span>
                <span style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>{n.txt}</span>
              </Row>
            ))}
            <Muted size={12}>As anotações por tempo de vídeo ficam disponíveis quando a videoaula existir.</Muted>
          </Card>
        </Col>

        {/* Lateral */}
        <Col gap={14}>
          {/* TODO(dados): progresso e aulas reais do módulo (sem modelo de módulo/aula de vídeo). */}
          <Card pad={16}>
            <div>
              <Eyebrow color="var(--muted)">{cursoTitulo.toUpperCase()}</Eyebrow>
              <b style={{ display: 'block', marginTop: 4, fontSize: 16, color: 'var(--ink)' }}>Materiais do curso</b>
            </div>
            <Row gap={10} style={{ flexWrap: 'nowrap' }}>
              <Bar pct={curso?.pct ?? 0} style={{ flex: 1 }} />
              <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{curso?.pct ?? 0}%</b>
            </Row>
            <Col gap={2}>
              {AULAS_MODULO.map((a) => <AulaMini key={a.titulo} a={a} />)}
            </Col>
            <Btn kind="secondary" size="sm" icon="arrow" href={R.curso(cursoId)} style={{ alignSelf: 'flex-start' }}>Ver todos os materiais</Btn>
          </Card>
        </Col>
      </div>
    </>
  )
}
