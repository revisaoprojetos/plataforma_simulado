'use server'
import { revalidatePath } from 'next/cache'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { criarReporte as _reportar, avaliarMaterial as _avaliar } from '@/lib/demandas/demandas'
import type { TipoReporte } from '@/lib/demandas/tipos'

// Ações do aluno no Leitor: reportar problema + avaliar o material (0–5). Alimentam a Central de Demandas (admin).
// A sessão define tenant/estudante (nunca o host) — padrão /nova.

export async function reportarMaterial(input: {
  documentoId: string; tipo: TipoReporte; descricao: string; pagina?: number | null; versaoId?: string | null
}): Promise<{ ok: boolean; erro?: string }> {
  const s = await getSessaoAluno()
  if (!s) return { ok: false, erro: 'sessão inválida' }
  const r = await _reportar(createAdminClient(), {
    tenantId: s.tenantId, estudanteId: s.estudanteId, documentoId: input.documentoId,
    tipo: input.tipo, descricao: input.descricao, pagina: input.pagina ?? null, versaoId: input.versaoId ?? null,
  })
  if ('erro' in r) return { ok: false, erro: r.erro }
  revalidatePath('/nova/painel/leitor/' + input.documentoId)
  return { ok: true }
}

export async function avaliarMaterialAction(input: {
  documentoId: string; nota: number; comentario?: string | null
}): Promise<{ ok: boolean; erro?: string }> {
  const s = await getSessaoAluno()
  if (!s) return { ok: false, erro: 'sessão inválida' }
  const r = await _avaliar(createAdminClient(), {
    tenantId: s.tenantId, estudanteId: s.estudanteId, documentoId: input.documentoId,
    nota: input.nota, comentario: input.comentario ?? null,
  })
  if (r.ok) revalidatePath('/nova/painel/leitor/' + input.documentoId)
  return r
}
