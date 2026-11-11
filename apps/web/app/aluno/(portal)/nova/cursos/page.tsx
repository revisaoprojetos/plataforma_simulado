// Cursos (menu) — CursosRevisao. Porte fiel do canvas.
// DADO REAL (decisão de produto): um "curso" é um PRODUTO/desafio publicado a que o aluno tem acesso —
// hoje Lei Seca, Jurisprudência e a Maratona ENAP+AGU (lib/nova/cursos-reais.ts). As pastas da Biblioteca
// (Agrário, Civil…) são MATERIAL, não curso → não aparecem aqui (ficam na Biblioteca).
import Link from 'next/link'
import { PageHeader, Card, Grid, Row, Col, H2, Muted, Tag, Btn, Bar, Media, Cover, GR, SecHead, Aviso } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { carregarCursosReais, type CursoReal } from '@/lib/nova/cursos-reais'
import { centralEstudosLiberada } from '@/lib/nova/central-acesso'
import { extensivoAtalhoDoAluno } from '@/lib/nova/extensivos-aluno'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PALETA = Object.values(GR)
function gradDe(cor: string | null | undefined, i: number): string {
  if (cor) return `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 55%, var(--pn-0b0a1a,#0b0a1a)))`
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
// Grade compartilhada (Central de Estudos + Meus cursos): 5 por linha em tela larga, mín. 170px; mesmo tamanho nas duas seções.
const GRADE_CARDS = 'repeat(auto-fill, minmax(max(170px, calc((100% - 64px) / 5)), 1fr))'

const ATALHOS_FIXOS = [
  { line: 'JURISCLUB', sigla: 'JurisClub', grad: 'linear-gradient(135deg,var(--pn-241a52,#241A52),var(--pn-5b3fd0,#5B3FD0))', titulo: 'JurisClub', sub: 'Julgados do mês', href: R.jurisclub, img: '/nova/jurisclub-capa.png' },
  { line: 'QUESTÕES', sigla: 'Questões e Simulados', grad: 'linear-gradient(135deg,var(--pn-1e2a5c,#1E2A5C),var(--pn-3f5bd0,#3F5BD0))', titulo: 'Questões e Simulados', sub: 'Banco e provas', href: R.questoes },
]

export default async function CursosPage() {
  const sessao = await getSessaoAluno()
  // Carrega os cursos e, em paralelo, se a Central de Estudos (sub-regra de Cursos) está liberada p/ este
  // aluno. Bloqueada (padrão) → some o botão do aviso e toda a seção da Central (sem caminho morto).
  const [cursos, centralLiberada, extensivo] = sessao
    ? await Promise.all([
        carregarCursosReais(createAdminClient(), sessao.tenantId, sessao.estudanteId),
        centralEstudosLiberada(sessao.tenantId, sessao.estudanteId, sessao.email),
        extensivoAtalhoDoAluno(sessao.tenantId, sessao.estudanteId),
      ])
    : [[] as CursoReal[], false, null]
  // Extensivo só aparece se o aluno TEM extensivo (real); 1 → abre direto, 2+ → lista.
  const ATALHOS = [
    ...(extensivo ? [{ line: 'EXTENSIVO', sigla: extensivo.qtd > 1 ? 'Extensivos' : extensivo.titulo.slice(0, 22), grad: GR.EXT, titulo: extensivo.titulo, sub: extensivo.sub, href: extensivo.href, img: extensivo.capa ?? '/nova/extensivo-capa.jpg' }] : []),
    ...ATALHOS_FIXOS,
  ]
  const primeiroNome = (sessao?.nome || 'Aluno').split(' ')[0]

  return (
    <>
      <PageHeader
        eyebrow="Meus cursos"
        title="Cursos"
        sub="A Central de Estudos e os cursos que você tem acesso, num lugar só."
      />

      {/* Cronograma: gerar (sem plano) ou resumo + abrir (com plano). */}

      {/* Central de Estudos (navegação — materiais e ferramentas que acompanham os cursos).
          Sub-regra 'nova_cursos_central': só aparece p/ quem tem acesso liberado; caso contrário some
          por completo (junto com o botão do aviso abaixo) p/ não deixar caminho para uma área bloqueada. */}
      {centralLiberada && (
        <Col gap={14}>
          <SecHead title="Central de Estudos" sub="Materiais e ferramentas que acompanham os seus cursos." right={<Btn kind="link" href={R.central}>Abrir a Central de Estudos</Btn>} />
          {/* 5 por linha em tela larga (cai p/ menos em telas estreitas) */}
          <Grid gap={16} style={{ gridTemplateColumns: GRADE_CARDS }}>
            {ATALHOS.map((a) => (
              <Link key={a.titulo} href={a.href} style={{ display: 'block' }}>
                <Card pad={0} style={{ overflow: 'hidden', gap: 0, height: '100%' }}>
                  <Media ratio="16:9" img={'img' in a ? a.img : null} fallback={<Cover line={a.line} sigla={a.sigla} grad={a.grad} big={a.sigla.length > 10 ? 18 : 22} />} />
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
      )}

      {cursos.length === 0 ? (
        <Card>
          {/* Sem acesso à Central → mostra só o texto (sem o botão, p/ não levar a um caminho bloqueado). */}
          <Aviso icon="book" action={centralLiberada ? <Btn kind="secondary" icon="arrow" href={R.central}>Ir para a Central de Estudos</Btn> : undefined}>
            Você ainda não tem cursos liberados, {primeiroNome}. Assim que o Revisão liberar um curso (como o Desafio de Lei Seca, a Jurisprudência ou a Maratona), ele aparece aqui.
          </Aviso>
        </Card>
      ) : (
        <Col gap={14}>
          <H2>Meus cursos</H2>
          {/* Mesma grade da Central de Estudos: os cards de Meus cursos NUNCA ficam maiores que os da Central (nem com zoom). */}
          <Grid gap={16} style={{ gridTemplateColumns: GRADE_CARDS }}>
            {cursos.map((c, i) => <CursoCard key={c.id} c={c} i={i} />)}
          </Grid>
        </Col>
      )}
    </>
  )
}
