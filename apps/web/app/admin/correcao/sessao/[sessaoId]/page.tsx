import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { carregarQuestoesCorrecao } from '@/lib/correcao/carregar-questoes'
import { CorrecaoSessao } from '@/components/admin/correcao-sessao'
import { ArrowLeft, User } from 'lucide-react'

export const dynamic = 'force-dynamic'
const ZERO = '00000000-0000-0000-0000-000000000000'

/** Correção UNIFICADA de UMA tentativa: todas as questões discursivas da sessão, juntas na mesa. */
export default async function CorrecaoSessaoPage({ params }: { params: Promise<{ sessaoId: string }> }) {
  const { sessaoId } = await params
  const access = await getCurrentAccess()
  const svc = createAdminClient()
  const tenantId = access.tenantId ?? ZERO

  const { data: sessao } = await svc.from('simulado_sessoes_prova')
    .select('id, estudante_id, simulado_id, tentativa_num').eq('id', sessaoId).eq('tenant_id', tenantId).maybeSingle()
  if (!sessao) notFound()

  const [{ data: estudante }, { data: sim }, { data: respRows }, { data: ordemRows }] = await Promise.all([
    svc.from('simulado_estudantes').select('nome, email').eq('id', sessao.estudante_id).maybeSingle(),
    svc.from('simulado_simulados').select('id, titulo').eq('id', sessao.simulado_id).maybeSingle(),
    svc.from('simulado_respostas_discursivas').select('id, questao_id, status, feedback').eq('sessao_id', sessaoId).eq('tenant_id', tenantId),
    svc.from('simulado_prova_questoes').select('questao_id, ordem').eq('simulado_id', sessao.simulado_id),
  ])
  const respostas = respRows ?? []
  if (!respostas.length) notFound()

  const ordem = new Map((ordemRows ?? []).map((o: any) => [o.questao_id, o.ordem ?? 0]))
  respostas.sort((a: any, b: any) => (ordem.get(a.questao_id) ?? 999) - (ordem.get(b.questao_id) ?? 999))

  const questoes = await carregarQuestoesCorrecao(svc, tenantId, respostas.map((r: any) => ({ id: r.id, questao_id: r.questao_id, status: r.status, feedback: r.feedback })))
  const voltarUrl = `/admin/correcao/simulado/${sessao.simulado_id}/aluno/${sessao.estudante_id}`

  return (
    <div className="mx-auto max-w-[110rem] space-y-4">
      <Link href={voltarUrl} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {estudante?.nome ?? 'Voltar'}{sessao.tentativa_num ? ` · tentativas` : ''}
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{estudante?.nome ?? 'Aluno'}{sessao.tentativa_num ? ` — tentativa ${sessao.tentativa_num}` : ''}</h1>
          <p className="text-sm text-muted-foreground">{sim?.titulo ?? ''} · {questoes.length} questão(ões) discursiva(s)</p>
        </div>
      </div>

      <CorrecaoSessao questoes={questoes} voltarUrl={voltarUrl} />
    </div>
  )
}
