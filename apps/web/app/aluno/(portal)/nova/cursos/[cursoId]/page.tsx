// Página do curso (CursoRevisao). Capa + progresso REAL, abas (Módulos/PDFs/LegProc/Questões),
// materiais reais da pasta e atalhos. DADO REAL: "curso" = pasta da Biblioteca acessível ao aluno.
//   • título/cor/progresso/contagens = lib/nova/cursos.ts (arvoreBibliotecaAluno + leitura_progresso)
//   • materiais → R.painelLeitor(docId) (leitor real) · subpastas = "módulos" (drill por ?pasta)
// EXEMPLO/TODO: "dias para a prova", órgão, selo "conciliado", videoaula (sem modelo de vídeo/edital).
import { Crumbs, Hero, Card, Col, Bar, GBAR, Btn, Media, Cover, GR, H3, Aviso } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { carregarCurso } from '@/lib/nova/cursos'
import { getSessaoAluno } from '@/lib/aluno-session'
import { redirect } from 'next/navigation'
import Conteudo from './_conteudo'

export const dynamic = 'force-dynamic'

const PALETA = Object.values(GR)
function gradDe(cor: string | null | undefined, i = 0): string {
  if (cor) return `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 55%, #0b0a1a))`
  return PALETA[i % PALETA.length]
}
function abreviar(txt: string, max = 10): string {
  const t = (txt || 'Curso').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export default async function Page({ params, searchParams }: { params: Promise<{ cursoId: string }>; searchParams: Promise<{ pasta?: string }> }) {
  const { cursoId } = await params
  const { pasta } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const curso = await carregarCurso(cursoId, pasta ?? null)

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

  const continuarHref = curso.continueDocId ? R.painelLeitor(curso.continueDocId) : R.curso(cursoId)

  // Materiais do curso (contagens reais) — atalhos para o conteúdo real da pasta.
  const MATERIAIS: { icon: IconName; titulo: string; sub: string; href: string }[] = [
    { icon: 'file', titulo: `${curso.pdfs.toLocaleString('pt-BR')} materiais`, sub: `${curso.lidos.toLocaleString('pt-BR')} lidos`, href: continuarHref },
    ...(curso.subpastas.length ? [{ icon: 'layers' as IconName, titulo: `${curso.subpastas.length.toLocaleString('pt-BR')} módulos`, sub: 'coleções de materiais', href: R.curso(cursoId) }] : []),
    { icon: 'scale', titulo: 'LegProc', sub: 'legislação anotada', href: R.legproc },
    { icon: 'qbook', titulo: 'Questões', sub: 'banco por disciplina', href: R.banco },
  ]

  return (
    <>
      <Crumbs items={[['Cursos', R.cursos], [curso.titulo, '#']]} />

      {/* Capa do curso */}
      <Hero style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
          <div style={{ width: 300, flexShrink: 0, padding: '18px 0 18px 18px' }}>
            <Media ratio="16:9" radius={14} fallback={<Cover line="CURSO" sigla={abreviar(curso.titulo)} grad={gradDe(curso.cor)} big={28} />} />
          </div>
          <div style={{ flex: 1, minWidth: 320, padding: '26px 30px', display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, maxWidth: 520, minWidth: 260 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.2em', color: 'var(--gold)' }}>CURSO · BIBLIOTECA DO REVISÃO</span>
              <b style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.045em', color: '#fff' }}>{curso.titulo}</b>
              <Bar pct={curso.pct} color={GBAR} style={{ background: 'rgba(255,255,255,.15)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#DCD3FF' }}>{curso.pct}% concluído · {curso.lidos.toLocaleString('pt-BR')} de {curso.pdfs.toLocaleString('pt-BR')} materiais</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14 }}>
              <div style={{ textAlign: 'right' }}>
                <b style={{ display: 'block', fontSize: 52, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, color: 'var(--gold)' }}>{curso.pct}%</b>
                <span style={{ fontSize: 12.5, color: '#CFC4FF' }}>concluído</span>
              </div>
              <Btn kind="gold" icon="play" href={continuarHref}>{curso.continueDocId ? 'Continuar de onde parou' : 'Começar o curso'}</Btn>
            </div>
          </div>
        </div>
      </Hero>

      {/* Conteúdo + lateral */}
      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24, alignItems: 'start' }}>
        <Conteudo cursoId={cursoId} documentos={curso.documentos} subpastas={curso.subpastas} breadcrumb={curso.breadcrumb} />

        <Col gap={16}>
          <Card pad={18}>
            <H3>Materiais do curso</H3>
            {MATERIAIS.map((mt) => (
              <a key={mt.titulo} href={mt.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--surface2)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n={mt.icon} size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{mt.titulo}</b>
                  <span style={{ display: 'block', fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>{mt.sub}</span>
                </div>
                <Icon n="chev" size={15} style={{ color: 'var(--muted)' }} />
              </a>
            ))}
          </Card>

          <Card pad={18}>
            <H3>Neste curso</H3>
            <Btn kind="secondary" size="sm" icon="info" href={R.duvidas} style={{ justifyContent: 'flex-start' }}>Tirar dúvida com o professor</Btn>
            <Btn kind="secondary" size="sm" icon="chart" href={R.desempenho} style={{ justifyContent: 'flex-start' }}>Ver meu desempenho</Btn>
            {/* TODO(dados): "mudar como estudo este edital" depende de conciliação edital→cronograma (sem modelo). */}
            <Btn kind="secondary" size="sm" icon="ext" href={R.cursoEdital(cursoId)} style={{ justifyContent: 'flex-start' }}>Como estudar este curso</Btn>
          </Card>
        </Col>
      </div>
    </>
  )
}
