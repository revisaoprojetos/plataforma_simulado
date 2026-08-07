'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { BuilderV3, PreviewQuestao } from '@/lib/caderno-teste/tipos'

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']
const TABELA = 'simulado_cadernos_teste'

/** Salva o builder do caderno de TESTE (config.builderV3 + bancoId). Sincroniza o nome com o título. */
export async function salvarBuilderTeste(id: string, builder: BuilderV3): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { data: atual } = await svc.from(TABELA).select('config').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle()
  if (!atual) return { ok: false, error: 'Caderno não encontrado.' }
  const config = { ...(((atual as any).config ?? {}) as Record<string, unknown>), builderV3: builder, bancoId: builder.bancoId }
  const nome = (builder.ajustes.titulo || '').trim()
  const patch: Record<string, unknown> = { config, atualizado_em: new Date().toISOString() }
  if (nome) patch.nome = nome
  const { error } = await svc.from(TABELA).update(patch).eq('id', id).eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: TABELA, entidadeId: id, depois: { modalidade: builder.modalidade, modelo: builder.modelo } })
  revalidatePath('/admin/cadernos-teste')
  return { ok: true }
}

/** Questões de um banco (para a prévia). Limitado — é só preview. */
export async function previewQuestoesBanco(bancoId: string): Promise<{ ok: boolean; questoes?: PreviewQuestao[] }> {
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false }
  if (!bancoId) return { ok: true, questoes: [] }
  const svc = createAdminClient()
  const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', access.tenantId!).order('questao_id', { ascending: true }))
  const ids = vinc.map((v) => v.questao_id).slice(0, 80) // teto para a prévia (não é a geração final)
  if (!ids.length) return { ok: true, questoes: [] }
  const { data: qs } = await svc.from('simulado_questoes').select('id, enunciado, tipo').in('id', ids).eq('tenant_id', access.tenantId)
  const { data: alts } = await svc.from('simulado_alternativas').select('questao_id, texto, ordem, correta, comentario').in('questao_id', ids).eq('tenant_id', access.tenantId)
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }
  const ordem = new Map(ids.map((id, i) => [id, i]))
  const questoes: PreviewQuestao[] = (qs ?? [])
    .sort((x: any, y: any) => (ordem.get(x.id) ?? 0) - (ordem.get(y.id) ?? 0))
    .map((q: any, i: number) => ({
      id: q.id, numero: i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo,
      alternativas: (altMap.get(q.id) ?? []).sort((m, n) => m.ordem - n.ordem).map((al, j) => ({ letra: LETRAS[j] ?? '?', texto: al.texto ?? '', correta: !!al.correta, comentario: al.comentario ?? '' })),
    }))
  return { ok: true, questoes }
}
