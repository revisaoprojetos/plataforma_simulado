// Meus Cadernos (novo) — CadernosRevisao. Tela de menu (sem caminho).
// DADOS REAIS do aluno: cadernos que ELE criou (simulado_aluno_cadernos + nº de questões) e contagens
// reais de Grifos (leitor da Biblioteca) e Salvos (questões favoritas). Antes a tela era o protótipo
// com 4 cadernos fictícios iguais para todos os alunos.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PageHeader, Card, Row, Col, H3, Muted, Tag, Tabs, GR } from '@/components/nova/ui'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { R } from '@/lib/nova/rotas'
import { CriarCadernoCard } from './criar-caderno'

export const dynamic = 'force-dynamic'

type CadernoAluno = { id: string; nome: string; criado_em: string | null; total: number }

const fmtData = (iso: string | null) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) } catch { return '' }
}

export default async function CadernosPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()
  const { tenantId, estudanteId } = sessao

  const [{ data: cads }, grifos, salvos] = await Promise.all([
    svc.from('simulado_aluno_cadernos').select('id, nome, criado_em')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).order('criado_em', { ascending: false }),
    svc.from('simulado_conteudo_grifos_pdf').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('aluno_id', estudanteId).then((r) => (r.error ? null : r.count ?? 0), () => null),
    svc.from('simulado_favoritos').select('questao_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).then((r) => (r.error ? null : r.count ?? 0), () => null),
  ])
  const ids = ((cads ?? []) as any[]).map((c) => c.id as string)
  const contagem: Record<string, number> = {}
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await svc.from('simulado_aluno_caderno_questoes').select('caderno_id').in('caderno_id', ids.slice(i, i + 100))
    for (const q of (data ?? []) as any[]) contagem[q.caderno_id] = (contagem[q.caderno_id] ?? 0) + 1
  }
  const cadernos: CadernoAluno[] = ((cads ?? []) as any[]).map((c) => ({ id: c.id, nome: c.nome, criado_em: c.criado_em ?? null, total: contagem[c.id] ?? 0 }))

  return (
    <>
      <PageHeader
        title="Meus Cadernos"
        sub="Os cadernos de questões que você montou, além dos seus grifos e questões salvas."
      />

      <Tabs
        items={['Cadernos', 'Grifos', 'Salvos']}
        active={0}
        counts={[cadernos.length, grifos, salvos]}
        links={[R.cadernos, R.painelGrifos, '/aluno/favoritos']}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))', gap: 16, alignItems: 'stretch' }}>
        <CriarCadernoCard />

        {cadernos.map((c) => (
          <Link key={c.id} href={`/aluno/cadernos/${c.id}`} style={{ display: 'flex' }}>
            <Card pad={0} style={{ overflow: 'hidden', gap: 0, width: '100%' }}>
              {/* capa/cabeçalho */}
              <div style={{ position: 'relative', background: GR.EXT, color: '#fff', padding: '16px 18px', minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '22px 22px' }} />
                <span style={{ position: 'relative', fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#E6DEFF' }}>Criado por você</span>
                <span style={{ position: 'relative', fontFamily: 'Montserrat, sans-serif', fontStyle: 'italic', fontWeight: 800, fontSize: 28, color: 'var(--gold)' }}>{c.total}</span>
              </div>
              {/* corpo */}
              <Col gap={12} style={{ padding: 18 }}>
                <H3>{c.nome}</H3>
                <Row gap={6}>
                  <Tag kind="green">{c.total === 1 ? '1 questão' : `${c.total} questões`}</Tag>
                </Row>
                <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                  <Muted size={12}>{c.total ? 'Abrir caderno' : 'Caderno vazio'}</Muted>
                  {c.criado_em && <Muted size={12}>criado em {fmtData(c.criado_em)}</Muted>}
                </Row>
              </Col>
            </Card>
          </Link>
        ))}
      </div>

      {cadernos.length === 0 && (
        <Muted size={13}>Você ainda não criou nenhum caderno. Os cadernos que você criar aparecem aqui.</Muted>
      )}
    </>
  )
}
