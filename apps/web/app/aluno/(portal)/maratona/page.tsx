import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { alunoTemAcessoMaratona, salvarEstadoMaratona } from '@/lib/maratona/participacao'
import { MARATONA_LANCADA } from '@/lib/maratona/config'
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
  return <MaratonaInterno theme={it.theme} />
}
