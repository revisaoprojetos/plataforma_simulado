'use server'
// CS › Calendário de eventos — criar/apagar evento. O evento aparece no calendário do Início de quem está no
// grupo escolhido (lib/home/snapshot.ts lê simulado_eventos_calendario); aqui só invalidamos os snapshots.
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { guardCs, isUuid, invalidarInicioAlunos } from '@/lib/admin-revisao/cs-server'
import { EVENTO_TIPOS } from '@/lib/admin-revisao/cs-tipos'

type R = { ok: boolean; error?: string; id?: string }

export async function criarEventoAction(i: { titulo: string; tipo: string; data: string; hora: string; grupoId?: string | null; link?: string | null; lembrete: boolean }): Promise<R> {
  const g = await guardCs('estudantes:update'); if (!g.ok) return g
  const titulo = (i.titulo ?? '').trim()
  if (!titulo) return { ok: false, error: 'Dê um nome ao evento.' }
  if (titulo.length > 140) return { ok: false, error: 'Nome muito longo (máx. 140).' }
  if (!EVENTO_TIPOS.some((t) => t.k === i.tipo)) return { ok: false, error: 'Tipo inválido.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.data ?? '')) return { ok: false, error: 'Dia inválido.' }
  if (!/^\d{2}:\d{2}$/.test(i.hora ?? '')) return { ok: false, error: 'Horário inválido.' }
  if (i.grupoId && !isUuid(i.grupoId)) return { ok: false, error: 'Grupo inválido.' }
  const link = (i.link ?? '').trim()
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: 'O link precisa começar com https://' }
  const svc = createAdminClient()
  if (i.grupoId) {
    const { data: gr } = await svc.from('simulado_grupos').select('id').eq('tenant_id', g.tenantId).eq('id', i.grupoId).eq('deletado', false).maybeSingle()
    if (!gr) return { ok: false, error: 'Grupo não encontrado.' }
  }
  const { data, error } = await svc.from('simulado_eventos_calendario').insert({
    tenant_id: g.tenantId, titulo, tipo: i.tipo, data: i.data, hora: i.hora, grupo_id: i.grupoId || null, link: link || null, lembrete_1h: !!i.lembrete,
  }).select('id').single()
  if (error) return { ok: false, error: /relation|schema cache|does not exist/i.test(error.message) ? 'Aplique a migração 20261112040000 (calendário de eventos) e tente de novo.' : error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_eventos_calendario', entidadeId: data.id, depois: { titulo, tipo: i.tipo, data: i.data, hora: i.hora, grupo_id: i.grupoId ?? null } })
  await invalidarInicioAlunos(g.tenantId, i.grupoId || null)
  revalidatePath('/admin/revisao/calendario')
  return { ok: true, id: data.id }
}

export async function excluirEventoAction(id: string): Promise<R> {
  const g = await guardCs('estudantes:update'); if (!g.ok) return g
  if (!isUuid(id)) return { ok: false, error: 'Evento inválido.' }
  const svc = createAdminClient()
  const { data: ev } = await svc.from('simulado_eventos_calendario').select('titulo, tipo, data, hora, grupo_id').eq('tenant_id', g.tenantId).eq('id', id).maybeSingle()
  if (!ev) return { ok: false, error: 'Evento não encontrado.' }
  const { error } = await svc.from('simulado_eventos_calendario').delete().eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_eventos_calendario', entidadeId: id, antes: ev as Record<string, unknown> })
  await invalidarInicioAlunos(g.tenantId, (ev as any).grupo_id ?? null)
  revalidatePath('/admin/revisao/calendario')
  return { ok: true }
}
