// Ajuda com a Plataforma (novo) — AjudaRevisao. Tela de menu (sem caminho).
// FAQ por tema (acordeão) + atalhos (reportar, requerimento, dicas) + espaço p/ tutoriais em vídeo.
// FAQ personalizável por tenant (tema.ajuda_faq) — lido via lerAjudaFaq, com fallback no padrão.
import { PageHeader, Card, Media, Col, H3, Muted, Btn, Field, Split } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { AjudaFaqAccordion } from '@/components/nova/ajuda-faq-accordion'
import { lerAjudaFaq } from '@/lib/ajuda/faq'
import { getCurrentTenant } from '@/lib/tenant'
import { R } from '@/lib/nova/rotas'

export const dynamic = 'force-dynamic'

export default async function AjudaPage() {
  const tenant = await getCurrentTenant()
  const faq = lerAjudaFaq(tenant?.tema)

  return (
    <>
      <PageHeader
        title="Ajuda com a Plataforma"
        sub="Respostas rápidas sobre como usar a plataforma. Para dúvidas de conteúdo, use a Central de Dúvidas."
      />

      {/* busca na base de ajuda (específica do módulo) */}
      <Field icon="search" placeholder="Procure: cronograma, grifo, senha…" />

      <Split
        main={<AjudaFaqAccordion faq={faq} />}
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
