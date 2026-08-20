import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { carregarQuestoesCorrecao } from '@/lib/correcao/carregar-questoes'
import { carregarEntregaBanco } from '@/lib/caderno-teste/entrega-aluno'
import { extrairTextoPdf } from '@/lib/ia/pdf-texto'
import { CorrecaoSessao } from '@/components/admin/correcao-sessao'

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
    svc.from('simulado_simulados').select('id, titulo, regras').eq('id', sessao.simulado_id).maybeSingle(),
    svc.from('simulado_respostas_discursivas').select('id, questao_id, status, feedback').eq('sessao_id', sessaoId).eq('tenant_id', tenantId),
    svc.from('simulado_prova_questoes').select('questao_id, ordem').eq('simulado_id', sessao.simulado_id),
  ])
  const respostas = respRows ?? []
  if (!respostas.length) notFound()

  const ordem = new Map((ordemRows ?? []).map((o: any) => [o.questao_id, o.ordem ?? 0]))
  respostas.sort((a: any, b: any) => (ordem.get(a.questao_id) ?? 999) - (ordem.get(b.questao_id) ?? 999))

  const questoes = await carregarQuestoesCorrecao(svc, tenantId, respostas.map((r: any) => ({ id: r.id, questao_id: r.questao_id, status: r.status, feedback: r.feedback })))
  const voltarUrl = `/admin/correcao/simulado/${sessao.simulado_id}/aluno/${sessao.estudante_id}`

  // ESPELHO = PDF do gabarito colocado no BANCO (caderno_entrega.gabarito) do simulado.
  const bancoId = (sim?.regras as any)?.banco_base_id as string | undefined
  const entrega = bancoId ? await carregarEntregaBanco(svc, tenantId, bancoId) : null
  const espelhoPdfUrl = (entrega?.gabarito?.pdfUrl as string | undefined) ?? null
  // Texto do espelho extraído do PDF (camada de texto) — p/ ler/copiar o gabarito por questão.
  let espelhoTexto = ''
  if (espelhoPdfUrl) { try { const resp = await fetch(espelhoPdfUrl); if (resp.ok) espelhoTexto = await extrairTextoPdf(Buffer.from(await resp.arrayBuffer())) } catch { /* sem texto */ } }

  return (
    <CorrecaoSessao
      aluno={estudante?.nome ?? 'Aluno'}
      email={estudante?.email ?? ''}
      tentativa={sessao.tentativa_num ?? null}
      simuladoTitulo={sim?.titulo ?? ''}
      questoes={questoes}
      espelhoPdfUrl={espelhoPdfUrl}
      espelhoTexto={espelhoTexto}
      voltarUrl={voltarUrl}
    />
  )
}
