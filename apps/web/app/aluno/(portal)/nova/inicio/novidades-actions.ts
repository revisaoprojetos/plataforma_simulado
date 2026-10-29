'use server'
import { revalidatePath } from 'next/cache'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { marcarLida as _lida, marcarTodasLidas as _todas } from '@/lib/novidades/novidades'

// Ações do aluno na área de Novidades da Início nova. Sessão define tenant/estudante (nunca o host).
export async function marcarNovidadeLida(novidadeId: string): Promise<{ ok: boolean }> {
  const s = await getSessaoAluno()
  if (!s) return { ok: false }
  const r = await _lida(createAdminClient(), s.tenantId, s.estudanteId, novidadeId)
  if (r.ok) revalidatePath('/aluno/nova/inicio')
  return { ok: r.ok }
}

export async function marcarTodasNovidadesLidas(): Promise<{ ok: boolean }> {
  const s = await getSessaoAluno()
  if (!s) return { ok: false }
  const r = await _todas(createAdminClient(), s.tenantId, s.estudanteId)
  if (r.ok) revalidatePath('/aluno/nova/inicio')
  return { ok: r.ok }
}
