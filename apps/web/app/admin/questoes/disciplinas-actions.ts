'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'

const NADA = '00000000-0000-0000-0000-000000000000'

export type DisciplinaContagem = { id: string; nome: string; questoes: number; assuntos: number }

/**
 * Disciplinas do tenant + contagem de questões e assuntos. Alimenta a aba de
 * unificação (mesclar disciplinas duplicadas — mesmo nome escrito de formas
 * diferentes na criação/import CSV, que poluem o filtro).
 */
export async function listarDisciplinasContagem(): Promise<{ ok: boolean; itens?: DisciplinaContagem[]; error?: string }> {
  if (!(await checkPermission('questoes:view'))) return { ok: false, error: 'Sem permissão.' }
  const tid = (await getCurrentTenantId()) ?? NADA
  const svc = createAdminClient()

  const { data: disc, error } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tid).order('nome')
  if (error) return { ok: false, error: error.message }

  const qCount = new Map<string, number>()
  const aCount = new Map<string, number>()
  if ((disc ?? []).length) {
    // conta por disciplina puxando só a coluna disciplina_id (paginado). Admin, sob demanda.
    const qs = await fetchAll<{ disciplina_id: string }>(() => svc.from('simulado_questoes').select('disciplina_id').eq('tenant_id', tid).eq('deletado', false).not('disciplina_id', 'is', null))
    for (const r of qs) qCount.set(r.disciplina_id, (qCount.get(r.disciplina_id) ?? 0) + 1)
    const as = await fetchAll<{ disciplina_id: string }>(() => svc.from('simulado_assuntos').select('disciplina_id').eq('tenant_id', tid).not('disciplina_id', 'is', null))
    for (const r of as) aCount.set(r.disciplina_id, (aCount.get(r.disciplina_id) ?? 0) + 1)
  }

  return { ok: true, itens: (disc ?? []).map((d: any) => ({ id: d.id, nome: d.nome, questoes: qCount.get(d.id) ?? 0, assuntos: aCount.get(d.id) ?? 0 })) }
}

/**
 * Unifica disciplinas: move questões, assuntos e vínculos de cronograma das
 * DUPLICADAS para a CANÔNICA (a manter) e apaga as duplicadas. Repointar antes
 * de apagar é obrigatório: `questoes.disciplina_id` é ON DELETE SET NULL e
 * `assuntos.disciplina_id` é ON DELETE CASCADE — apagar sem mover perderia o
 * vínculo. `assuntos` não tem UNIQUE(tenant,disciplina,nome) → repoint em massa
 * é seguro (não colide).
 */
export async function unificarDisciplinas(canonicaId: string, duplicadaIds: string[]): Promise<{ ok: boolean; error?: string; questoes?: number; assuntos?: number; removidas?: number; mantida?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const tid = (await getCurrentTenantId()) ?? NADA
  const svc = createAdminClient()

  const dups = [...new Set((duplicadaIds ?? []).filter((x) => x && x !== canonicaId))]
  if (!canonicaId || !dups.length) return { ok: false, error: 'Escolha a disciplina a manter e ao menos uma duplicada.' }

  // Todas devem ser do tenant (evita merge cross-tenant por id forjado).
  const { data: donas } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tid).in('id', [canonicaId, ...dups])
  const validas = new Set((donas ?? []).map((d: any) => d.id))
  if (!validas.has(canonicaId) || dups.some((d) => !validas.has(d))) return { ok: false, error: 'Disciplina inválida.' }

  // Impacto (antes de mover).
  const { count: nQ } = await svc.from('simulado_questoes').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('deletado', false).in('disciplina_id', dups)
  const { count: nA } = await svc.from('simulado_assuntos').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).in('disciplina_id', dups)

  // Repoint questões + assuntos.
  const upQ = await svc.from('simulado_questoes').update({ disciplina_id: canonicaId }).eq('tenant_id', tid).in('disciplina_id', dups)
  if (upQ.error) return { ok: false, error: upQ.error.message }
  const upA = await svc.from('simulado_assuntos').update({ disciplina_id: canonicaId }).eq('tenant_id', tid).in('disciplina_id', dups)
  if (upA.error) return { ok: false, error: upA.error.message }
  // Cronograma (best-effort — tabelas podem não existir / módulo dormente).
  await svc.from('simulado_cronograma_links').update({ disciplina_id: canonicaId }).eq('tenant_id', tid).in('disciplina_id', dups)
  await svc.from('simulado_cronograma_metas').update({ disciplina_id: canonicaId }).eq('tenant_id', tid).in('disciplina_id', dups)

  // Apaga as duplicadas (já sem referências).
  const del = await svc.from('simulado_disciplinas').delete().eq('tenant_id', tid).in('id', dups)
  if (del.error) return { ok: false, error: del.error.message }

  const mantida = (donas ?? []).find((d: any) => d.id === canonicaId)?.nome as string | undefined
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_disciplinas', entidadeId: canonicaId, depois: { unificou: dups.length, questoes: nQ ?? 0, assuntos: nA ?? 0, mantida } })
  revalidatePath('/admin/questoes')
  return { ok: true, questoes: nQ ?? 0, assuntos: nA ?? 0, removidas: dups.length, mantida }
}
