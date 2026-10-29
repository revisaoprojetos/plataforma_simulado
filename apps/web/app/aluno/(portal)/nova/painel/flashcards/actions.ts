'use server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarRevisao, type ResultadoRevisao } from '@/lib/flashcards/flashcards'

// Ação do aluno: registra o resultado de UM flashcard (SRS Leitner). Chamada pelo runner (_flashcards.tsx).
// Sessão do aluno define tenant/estudante (nunca o host) — padrão das telas /nova.
export async function salvarRevisaoFlashcard(
  flashcardId: string, resultado: ResultadoRevisao,
): Promise<{ ok: boolean; erro?: string; caixa?: number; proximaRevisao?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, erro: 'sessão inválida' }
  const svc = createAdminClient()
  return registrarRevisao(svc, {
    tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, flashcardId, resultado,
  })
}
