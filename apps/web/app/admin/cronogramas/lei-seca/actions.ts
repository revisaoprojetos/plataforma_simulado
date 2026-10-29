'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { medirPaginasPendentes } from '@/lib/cronograma/adaptativo/paginas-pdf'

// Lei seca (WLP) do Cronograma Adaptativo: blocos de texto por SEMANA
// (ex.: "CF - Preâmbulo ao art. 5º, XXVI"). Tabela simulado_cronograma_adaptativo_legproc.

const T = 'simulado_cronograma_adaptativo_legproc'

async function acesso(acao: 'view' | 'update') {
  const a = await getCurrentAccess()
  const permitido = a.isAdmin || a.permissions.includes('*') || a.permissions.includes(`cronogramas:${acao}`)
  if (!a.tenantId || !permitido) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}

export type SemanaLegproc = { semana: number; blocos: string[] }

export async function listarLegproc(): Promise<{ ok: boolean; semanas?: SemanaLegproc[]; error?: string }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from(T).select('semana, ordem, texto').eq('tenant_id', g.tenantId).order('semana').order('ordem')
  if (error) return { ok: false, error: error.message }
  const map = new Map<number, string[]>()
  for (const r of (data ?? []) as Array<{ semana: number; texto: string }>) { const arr = map.get(r.semana) ?? []; arr.push(r.texto); map.set(r.semana, arr) }
  const semanas = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([semana, blocos]) => ({ semana, blocos }))
  return { ok: true, semanas }
}

/** Substitui os blocos de UMA semana (delete + insert ordenado). Blocos vazios são ignorados. */
export async function salvarSemanaLegproc(semana: number, blocos: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const s = Math.round(Number(semana))
  if (!Number.isFinite(s) || s < 1) return { ok: false, error: 'Semana inválida.' }
  const svc = createAdminClient()
  const limpos = (blocos ?? []).map((b) => String(b || '').trim()).filter(Boolean).slice(0, 50)
  const del = await svc.from(T).delete().eq('tenant_id', g.tenantId).eq('semana', s)
  if (del.error) return { ok: false, error: del.error.message }
  if (limpos.length) {
    const rows = limpos.map((texto, ordem) => ({ tenant_id: g.tenantId, semana: s, ordem, texto }))
    const ins = await svc.from(T).insert(rows)
    if (ins.error) return { ok: false, error: ins.error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: T, entidadeId: null, depois: { semana: s, blocos: limpos.length } })
  revalidatePath('/admin/cronogramas/lei-seca')
  return { ok: true }
}

/** Dispara a medição de páginas dos PDFs publicados (backfill manual). */
export async function medirPaginasBibliotecaAction(): Promise<{ ok: boolean; medidos?: number; falhas?: number; error?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const r = await medirPaginasPendentes(svc, g.tenantId, 100)
  return { ok: true, medidos: r.medidos, falhas: r.falhas }
}
