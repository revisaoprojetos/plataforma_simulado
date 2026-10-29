// Requerimentos (novo) — RequerimentosRevisao. Subtela (com caminho) + barra de área (active=1).
// LIGADA AO BACKEND: lista real do aluno (listarRequerimentosAluno) + criação via server action.
// RUNTIME: a tabela só existe após a migração (20261027010000) — try/catch degrada p/ "nenhum".
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Crumbs, PageHeader, Card, Soft, Split, Seg, Row, Col, H2, H3, Muted, Tag } from '@/components/nova/ui'
import { R } from '@/lib/nova/rotas'
import { formatBrt } from '@/lib/brt'
import { listarRequerimentosAluno, STATUS_REQ_LABEL } from '@/lib/requerimentos/requerimentos'
import type { Requerimento } from '@/lib/requerimentos/tipos'
import { NovoRequerimento } from './_requerimentos'

export const dynamic = 'force-dynamic'

export default async function RequerimentosPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const svc = createAdminClient()
  // A migração pode ainda não ter sido aplicada → degrade silencioso p/ lista vazia.
  let reqs: Requerimento[] = []
  try {
    reqs = await listarRequerimentosAluno(svc, sessao.tenantId, sessao.estudanteId)
  } catch {
    reqs = []
  }

  return (
    <>
      <Crumbs items={[['Central de Dúvidas e Requerimentos', R.duvidas], ['Requerimentos', R.requerimentos]]} />

      <Seg items={['Dúvidas', 'Requerimentos']} active={1} links={[R.duvidas, R.requerimentos]} />

      <PageHeader
        title="Central de Dúvidas e Requerimentos"
        sub="Pedidos administrativos sobre o seu curso, com protocolo e resposta da equipe."
      />

      <Split
        right="360px"
        main={<NovoRequerimento />}
        aside={
          <Col gap={16}>
            <H2>Meus requerimentos</H2>
            {reqs.length === 0 ? (
              <Soft pad={20}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Você ainda não abriu requerimentos.</span>
                <Muted size={13}>Use o formulário ao lado para fazer o seu primeiro pedido. Ele aparece aqui com o protocolo e a resposta da equipe.</Muted>
              </Soft>
            ) : (
              reqs.map((r) => <ReqCard key={r.id} r={r} />)
            )}
          </Col>
        }
      />
    </>
  )
}

function ReqCard({ r }: { r: Requerimento }) {
  const st = STATUS_REQ_LABEL[r.status] ?? { label: r.status, kind: 'gray' as const }
  const aberto = formatBrt(r.criado_em)
  const meta = [r.contexto?.trim(), aberto ? `aberto em ${aberto}` : null].filter(Boolean).join(' · ')
  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color: 'var(--brand)' }}>{r.protocolo}</span>
        <Tag kind={st.kind}>{st.label}</Tag>
      </Row>
      <H3>{r.tipo}</H3>
      {r.descricao ? <Muted size={13}>{r.descricao}</Muted> : null}
      {meta ? <Muted size={12}>{meta}</Muted> : null}
      {r.resposta ? (
        <Soft pad={12}>
          <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)' }}><b>Resposta da equipe:</b> {r.resposta}</span>
        </Soft>
      ) : null}
    </Card>
  )
}
