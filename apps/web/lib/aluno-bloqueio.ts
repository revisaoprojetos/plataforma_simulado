import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { remember } from '@/lib/cache/relatorio-cache'

/** Chave do cache de bloqueio (invalidada em CS › Membros ao bloquear/desbloquear). */
export const chaveBloqueioAluno = (estudanteId: string) => `aluno-bloq:${estudanteId}`

/**
 * Aluno com acesso BLOQUEADO pelo admin (CS › Membros)? Memoizado por request (React cache) e 60 s no Redis —
 * barato o bastante para rodar em getSessaoAluno e derrubar sessões já abertas (cookie de 7 dias).
 * Tolerante: coluna ausente/erro → não bloqueia.
 */
export const alunoBloqueado = cache(async (estudanteId: string): Promise<boolean> => {
  try {
    return await remember(chaveBloqueioAluno(estudanteId), 60, async () => {
      const r = await createAdminClient().from('simulado_estudantes').select('acesso_bloqueado').eq('id', estudanteId).maybeSingle()
      return !r.error && (r.data as { acesso_bloqueado?: boolean } | null)?.acesso_bloqueado === true
    })
  } catch { return false }
})
