import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { alunoTemAcessoMaratona, salvarEstadoMaratona, garantirNumeroCorredor, lerNumeroCorredor } from '@/lib/maratona/participacao'
import { MARATONA_LANCADA } from '@/lib/maratona/config'
import { carregarDesafioMaratona, carregarProgressoMaratona, carregarRankingMaratona, carregarSimuladosLinksMaratona, carregarTempoDecorridoMaratona } from '@/lib/maratona/carregar'
import { MaratonaInterno } from '@/components/aluno/maratona/maratona-interno'

export const dynamic = 'force-dynamic'

/**
 * Área interna da MARATONA DE SIMULADOS (desafio) — dentro do portal (mantém sidebar + top bar).
 * Gate: só Revisão, maratona lançada e aluno com acesso (Guru/Curseduca). Visitar = "iniciou" (o card
 * na Home passa a mostrar "Continuar"). As telas (Percurso/Painel/Ranking/Medalhas) são o porte do design.
 */
export default async function MaratonaPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const it = await resolverInterno()
  if (it.brand !== 'revisao' || !MARATONA_LANCADA) redirect('/aluno')
  const svc = createAdminClient()
  if (!(await alunoTemAcessoMaratona(svc, sessao.tenantId, sessao.estudanteId))) redirect('/aluno')
  // Entrou na área = aceitou/iniciou (idempotente). Best-effort: não bloqueia o render.
  void salvarEstadoMaratona(svc, sessao.estudanteId, { iniciado: true }).catch(() => {})
  const { config, pastaId } = await carregarDesafioMaratona(svc, sessao.tenantId)
  const [progresso, ranking, simulados, tempoDecorrido] = await Promise.all([
    carregarProgressoMaratona(svc, sessao.tenantId, sessao.estudanteId, pastaId),
    carregarRankingMaratona(svc, sessao.tenantId, pastaId),
    carregarSimuladosLinksMaratona(svc, sessao.tenantId, pastaId, sessao.estudanteId),
    carregarTempoDecorridoMaratona(svc, sessao.tenantId, sessao.estudanteId, pastaId),
  ])
  // NÚMERO DO CORREDOR: entregue na ORDEM DE CHEGADA ao 1º simulado ENCERRADO. Se já encerrou algum,
  // garante (idempotente, atômico) e fixa o número; senão só lê (null = ainda não corre).
  const jaCorreu = simulados.some((s) => s?.concluido)
  const numeroCorredor = pastaId
    ? (jaCorreu ? await garantirNumeroCorredor(svc, sessao.tenantId, pastaId, sessao.estudanteId)
                : await lerNumeroCorredor(svc, sessao.tenantId, pastaId, sessao.estudanteId))
    : null
  return <MaratonaInterno theme={it.theme} capaUrl={config.capaUrl} regulamento={config.regulamento} progresso={progresso} ranking={ranking} meuId={sessao.estudanteId} simulados={simulados} tempoDecorrido={tempoDecorrido} numeroCorredor={numeroCorredor} />
}
