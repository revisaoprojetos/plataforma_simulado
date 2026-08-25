'use server'

/**
 * Grava as preferências de leitura do aluno numa emissão.
 *
 * O tipo e a normalização vivem em `lib/cronograma/preferencias.ts`: arquivo `'use server'`
 * só pode exportar função assíncrona, e o `tsc` não acusa isso — quebra em runtime.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { normalizarPreferencias, type PreferenciasEmissao } from '@/lib/cronograma/preferencias'

/**
 * Best-effort de verdade: falhar aqui não pode atrapalhar a leitura. O aluno continua com a
 * tela do jeito que deixou nesta sessão — só não persiste para a próxima.
 *
 * Sem auditoria: é estado de tela do próprio aluno, não ação administrativa.
 */
export async function salvarPreferencias(
  emissaoId: string,
  prefs: PreferenciasEmissao,
): Promise<{ ok: boolean; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou.' }

  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronograma_emissoes')
    .update({ preferencias: normalizarPreferencias(prefs) })
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId) // só as próprias
  if (error) {
    console.error('[cronograma] preferências não salvas:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
