import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { InternaPageRoot } from '@/components/brand/interna/page-shell'
import { RevisaoFixoEmbed } from '@/components/brand/interna/cronograma/revisao-fixo-embed'
import { Btn, Card, Muted } from '@/components/nova/ui'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Cronograma REVISÃO (plano fixo) — renderizado no MESMO iframe/UI do Cronograma Adaptativo (modo `revisao-fixo`).
// Aqui só a checagem LEVE do dono (sem montar a grade): o iframe busca o plano em /api/aluno/cronograma/revisao-iframe.
export default async function EmissaoPage({ params }: { params: Promise<{ emissaoId: string }> }) {
  const { emissaoId } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const it = await resolverInterno()

  type Linha = { id: string; titulo: string | null; cronograma_nome: string; formulario: Record<string, unknown> | null }
  const emissao: Linha | null = UUID_RE.test(emissaoId)
    ? (((
        await createAdminClient()
          .from('simulado_cronograma_emissoes')
          .select('id, titulo, cronograma_nome, formulario')
          .eq('id', emissaoId)
          .eq('tenant_id', sessao.tenantId)
          .eq('estudante_id', sessao.estudanteId)
          .maybeSingle()
      ).data as Linha | null) ?? null)
    : null

  if (!emissao) {
    return (
      <InternaPageRoot brand={it.brand} theme={it.theme}>
        <Card pad={28} style={{ alignItems: 'center', textAlign: 'center' }}>
          <b style={{ fontSize: 16, color: 'var(--ink)' }}>Não encontramos este cronograma</b>
          <Muted>Ele pode ter sido removido.</Muted>
          <Btn kind="gold" href="/aluno/cronograma">Ir para meus cronogramas</Btn>
        </Card>
      </InternaPageRoot>
    )
  }

  return (
    <RevisaoFixoEmbed
      theme={it.theme}
      emissaoId={emissao.id}
      tituloInicial={emissao.titulo ?? ''}
      semDatas={!!emissao.formulario?.semDatas}
    />
  )
}
