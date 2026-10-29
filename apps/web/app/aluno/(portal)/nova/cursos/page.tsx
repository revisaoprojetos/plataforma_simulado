// Cursos (menu) — CursosRevisao. Porte fiel do canvas.
// DADO REAL (decisão de produto): um "curso" é um PRODUTO/desafio publicado a que o aluno tem acesso —
// hoje Lei Seca, Jurisprudência e a Maratona ENAP+AGU (lib/nova/cursos-reais.ts). As pastas da Biblioteca
// (Agrário, Civil…) são MATERIAL, não curso → não aparecem aqui (ficam na Biblioteca).
import Link from 'next/link'
import { PageHeader, Card, Grid, Row, Col, H2, Muted, Tag, Btn, Bar, Media, Cover, GR, SecHead, Aviso } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { carregarCursosReais, type CursoReal } from '@/lib/nova/cursos-reais'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PALETA = Object.values(GR)
function gradDe(cor: string | null | undefined, i: number): string {
  if (cor) return `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 55%, #0b0a1a))`
  return PALETA[i % PALETA.length]
}
function abreviar(txt: string, max = 18): string {
  const t = (txt || 'Curso').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
function seloDe(c: CursoReal): { t: string; k: 'brand' | 'gold' | 'green' | 'gray'; icon?: 'check' } {
  const concluido = c.total > 0 && c.feitos >= c.total
  if (c.encerrado) return { t: concluido ? 'Concluído · Encerrado' : 'Encerrado', k: 'gray', icon: concluido ? 'check' : undefined }
  if (concluido) return { t: 'Concluído', k: 'green', icon: 'check' }
  if (c.pct > 0) return { t: 'Em andamento', k: 'brand' }
  return { t: 'Comece agora', k: 'gold' }
}

function CursoCard({ c, i }: { c: CursoReal; i: number }) {
  const selo = seloDe(c)
  const emAndamento = c.pct > 0 && !c.encerrado && !(c.total > 0 && c.feitos >= c.total)
  return (
    <Card pad={0} style={{ overflow: 'hidden', gap: 0, border: emAndamento ? '1px solid var(--brand)' : '1px solid var(--line)' }}>
      {/* Imagem MAIOR (4:3) com o selo de situação sobreposto no canto superior esquerdo. */}
      <div style={{ position: 'relative' }}>
        <Media ratio="16:9" img={c.capa} style={{ aspectRatio: '4 / 3' }} fallback={<Cover line="CURSO" sigla={abreviar(c.titulo)} grad={gradDe(c.cor, i)} big={abreviar(c.titulo).length > 10 ? 20 : 26} />} />
        <span style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}><Tag kind={selo.k} icon={selo.icon}>{selo.t}</Tag></span>
      </div>
      {/* Rodapé enxuto (menos altura) */}
      <Col gap={8} style={{ padding: 14, flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{c.titulo}</div>
        <Muted size={12}>{c.sub}</Muted>
        <Row gap={10} style={{ flexWrap: 'nowrap' }}>
          <Bar pct={c.pct} style={{ flex: 1 }} />
          <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{c.pct}%</b>
        </Row>
        <Btn kind="primary" icon="play" size="sm" href={c.href} style={{ marginTop: 2 }}>{c.acao}</Btn>
      </Col>
    </Card>
  )
}

// Atalhos para a Central de Estudos (navegação — não são cursos).
const ATALHOS = [
  { line: 'EXTENSIVO', sigla: 'Advocacia Pública', grad: GR.EXT, titulo: 'Extensivo', sub: 'Base para PGEs e PGMs', href: R.extensivo },
  { line: 'LEGPROC', sigla: 'LegProc', grad: 'linear-gradient(135deg,#3A1E5C,#7A3DB0)', titulo: 'LegProc', sub: 'Legislação anotada', href: R.legproc },
  { line: 'JURISCLUB', sigla: 'JurisClub', grad: 'linear-gradient(135deg,#241A52,#5B3FD0)', titulo: 'JurisClub', sub: 'Julgados do mês', href: R.jurisclub },
  { line: 'QUESTÕES', sigla: 'Questões e Simulados', grad: 'linear-gradient(135deg,#1E2A5C,#3F5BD0)', titulo: 'Questões e Simulados', sub: 'Banco e provas', href: R.questoes },
]

export default async function CursosPage() {
  const sessao = await getSessaoAluno()
  const cursos = sessao ? await carregarCursosReais(createAdminClient(), sessao.tenantId, sessao.estudanteId) : []
  const primeiroNome = (sessao?.nome || 'Aluno').split(' ')[0]

  return (
    <>
      <PageHeader
        eyebrow="Meus cursos"
        title="Cursos"
        sub="Os cursos que você tem acesso e a Central de Estudos, num lugar só."
      />

      {cursos.length === 0 ? (
        <Card>
          <Aviso icon="book" action={<Btn kind="secondary" icon="arrow" href={R.central}>Ir para a Central de Estudos</Btn>}>
            Você ainda não tem cursos liberados, {primeiroNome}. Assim que o Revisão liberar um curso (como o Desafio de Lei Seca, a Jurisprudência ou a Maratona), ele aparece aqui.
          </Aviso>
        </Card>
      ) : (
        <Col gap={14}>
          <H2>Meus cursos</H2>
          {/* Grade padrão da área de Cursos: ~4 colunas, adaptando ao monitor (auto-fill por largura mín.). */}
          <Grid min={280} gap={16}>
            {cursos.map((c, i) => <CursoCard key={c.id} c={c} i={i} />)}
          </Grid>
        </Col>
      )}

      {/* Central de Estudos (navegação — materiais e ferramentas que acompanham os cursos) */}
      <Col gap={14}>
        <SecHead title="Central de Estudos" sub="Materiais e ferramentas que acompanham os seus cursos." right={<Btn kind="link" href={R.central}>Abrir a Central de Estudos</Btn>} />
        <Grid min={280} gap={16}>
          {ATALHOS.map((a) => (
            <Link key={a.titulo} href={a.href} style={{ display: 'block' }}>
              <Card pad={0} style={{ overflow: 'hidden', gap: 0, height: '100%' }}>
                <Media ratio="16:9" fallback={<Cover line={a.line} sigla={a.sigla} grad={a.grad} big={a.sigla.length > 10 ? 18 : 22} />} />
                <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap', padding: 14 }}>
                  <Col gap={2} style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{a.titulo}</b>
                    <Muted size={12}>{a.sub}</Muted>
                  </Col>
                  <Icon n="chev" size={16} style={{ color: 'var(--muted2)', flexShrink: 0 }} />
                </Row>
              </Card>
            </Link>
          ))}
        </Grid>
      </Col>
    </>
  )
}
