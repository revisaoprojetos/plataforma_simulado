import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { temAcessoDesafio } from '@/lib/jurisprudencia/conteudo'
import { docAcessivelAluno, carregarQuizAluno } from '@/lib/leitura/acesso'
import { JURISPRUDENCIA_ATIVA } from '@/lib/flags'
import { LeituraQuestoesStep } from '@/components/aluno/leitura-questoes-step'

export const dynamic = 'force-dynamic'

/**
 * QUESTÕES do Desafio de Jurisprudência (modo "questoes" da config) — reusa a MESMA tela de responder do
 * Lei Seca (`LeituraQuestoesStep`): questões uma a uma, navegador, finalizar, pop-up de nota. As questões
 * do dia são as TESES do documento (simulado_documento_quiz_questoes), carregadas por `carregarQuizAluno`.
 * Abre num overlay DENTRO do arcade (embed=1): "Voltar" sinaliza o fechamento via hash (#fechar-leitura),
 * o arcade fica congelado atrás. Ao FINALIZAR, o quiz-tentativa (com `desafio`) credita o dia (libera o
 * JOGAR + sequência + pontos das teses) — igual a leitura rápida fazia.
 */
export default async function JurisQuestoesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ desafio?: string; embed?: string }> }) {
  if (!JURISPRUDENCIA_ATIVA) redirect('/aluno')
  const { id } = await params
  const { desafio, embed } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  if (desafio && !(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafio))) notFound()
  const svc = createAdminClient()
  const doc = await docAcessivelAluno(svc, sessao.tenantId, id, sessao.estudanteId, 'id, titulo')
  if (!doc) notFound()
  const questoes = await carregarQuizAluno(id, sessao.estudanteId, sessao.tenantId)
  const ehEmbed = embed === '1'
  const voltar = ehEmbed
    ? '#fechar-leitura'
    : (desafio ? `/aluno/jurisprudencia?desafio=${encodeURIComponent(desafio)}` : '/aluno/jurisprudencia')
  // Renderiza o step DIRETO (igual ao Lei Seca) — ele já é `fixed inset-0 z-[130]` e cobre o shell. NÃO
  // embrulhar num container com z-index próprio: o pop-up de conclusão é portado p/ document.body com
  // z-[140]; um wrapper z-200 ficaria ACIMA do pop-up e o esconderia (o "finalizar não mostra a nota").
  return <LeituraQuestoesStep doc={{ id, titulo: (doc as any).titulo ?? 'Questões' }} questoes={questoes} trilhaHref={voltar} desafio={desafio}
    voltarLabel="Desafio" voltarCta="Voltar ao desafio" avisoConclusao="Você concluiu as questões do dia — volte e jogue o labirinto." />
}
