'use server'

/**
 * Salva as preferências do perfil do aluno (Meta diária + toggles) em simulado_estudantes.perfil_prefs.
 * Tipos/normalização vivem em `lib/aluno/perfil-prefs.ts` (arquivo 'use server' só exporta função async).
 * Best-effort: é estado do próprio aluno, sem auditoria.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { lerPerfilPrefs, normalizarPrefs, type PerfilPrefs } from '@/lib/aluno/perfil-prefs'

export async function salvarPerfilPrefs(patch: Partial<PerfilPrefs>): Promise<{ ok: boolean; prefs?: PerfilPrefs; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou.' }

  const svc = createAdminClient()
  // Mescla com o que já existe (atualização parcial de um toggle/meta sem apagar os demais).
  const atual = await lerPerfilPrefs(svc, sessao.estudanteId)
  const prefs = normalizarPrefs({ ...atual, ...patch })

  const { error } = await svc
    .from('simulado_estudantes')
    .update({ perfil_prefs: prefs })
    .eq('id', sessao.estudanteId)
    .eq('tenant_id', sessao.tenantId)
  if (error) {
    console.error('[perfil] prefs não salvas:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, prefs }
}
