// Ajuda com a Plataforma (novo) — AjudaRevisao. Tela de menu (sem caminho).
// FAQ por tema + atalhos (reportar, requerimento, dicas) + espaço p/ tutoriais em vídeo.
// CONTEÚDO DE EXEMPLO — marcado com TODO(dados). Layout fiel ao canvas.
import { PageHeader, Card, Media, Row, Col, H2, H3, P, Muted, Btn, Field, Split } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'

export const dynamic = 'force-dynamic'

// ——— FAQ (TODO(dados): ligar à base de artigos de ajuda por tenant) ———
type Pergunta = { q: string; a?: string }
type Tema = { titulo: string; perguntas: Pergunta[] }
const FAQ: Tema[] = [
  { titulo: 'Primeiros passos', perguntas: [
    { q: 'Como monto o meu cronograma?', a: 'Em Meu painel de estudos, toque em Montar meu cronograma. São três perguntas rápidas e depois você escolhe dias, horas, disciplinas e metas.' },
    { q: 'O que aparece no Início?' },
    { q: 'Onde estão os meus cursos?' },
  ] },
  { titulo: 'Cronograma e metas', perguntas: [
    { q: 'Atrasei metas. E agora?' },
    { q: 'Posso mudar as horas de estudo depois?' },
    { q: 'Parei no meio de uma aula. Perco o que li?' },
  ] },
  { titulo: 'Materiais, grifos e cadernos', perguntas: [
    { q: 'Os meus grifos ficam salvos?' },
    { q: 'Como mando um trecho para o caderno?' },
    { q: 'Posso baixar o PDF?' },
  ] },
  { titulo: 'Conta e acesso', perguntas: [
    { q: 'Como troco a minha senha?' },
    { q: 'Meu acesso vai vencer. O que faço?' },
  ] },
]

export default function AjudaPage() {
  return (
    <>
      <PageHeader
        title="Ajuda com a Plataforma"
        sub="Respostas rápidas sobre como usar a plataforma. Para dúvidas de conteúdo, use a Central de Dúvidas."
      />

      {/* busca na base de ajuda (específica do módulo) */}
      <Field icon="search" placeholder="Procure: cronograma, grifo, senha…" />

      <Split
        main={
          <Col gap={16}>
            {FAQ.map((tema) => (
              <Card key={tema.titulo}>
                <H2>{tema.titulo}</H2>
                <Col gap={0}>
                  {tema.perguntas.map((p, i) => (
                    <div key={i} style={{ padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                      <Row gap={10} style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
                        <Icon n="chev" size={16} style={{ color: 'var(--muted2)', flexShrink: 0 }} />
                        <b style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{p.q}</b>
                      </Row>
                      {p.a ? <P size={13}><span style={{ display: 'block', paddingLeft: 26, marginTop: 6 }}>{p.a}</span></P> : null}
                    </div>
                  ))}
                </Col>
              </Card>
            ))}
          </Col>
        }
        aside={
          <Col gap={16}>
            <Card>
              <H3>Ainda precisa de ajuda?</H3>
              <Btn kind="primary" icon="alert" style={{ width: '100%' }}>Reportar um problema</Btn>
              <Btn kind="secondary" icon="file" href={R.requerimentos} style={{ width: '100%' }}>Abrir um requerimento</Btn>
              <Btn kind="secondary" icon="spark" href={R.comoEstudar} style={{ width: '100%' }}>Dicas em Como Estudar</Btn>
            </Card>
            <Card>
              <H3>Tutoriais em vídeo</H3>
              <Muted size={12.5}>Vídeos curtos mostrando cada parte da plataforma. Em breve.</Muted>
              {/* TODO(dados): grade de tutoriais quando os vídeos estiverem disponíveis */}
              <Media ratio="16:9" radius={14} fallback={
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--line2)', borderRadius: 14, color: 'var(--muted2)' }}>
                  <Icon n="video" size={28} />
                </div>
              } />
            </Card>
          </Col>
        }
      />
    </>
  )
}
