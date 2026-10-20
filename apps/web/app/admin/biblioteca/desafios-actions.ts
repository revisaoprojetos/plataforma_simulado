'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { criarDesafio, listarDesafios } from '@/lib/conteudo/vinculos'
import { criarRegra, listarRegrasAdmin, removerRegra, type AcaoRegra } from '@/lib/conteudo/desafios-regras'

async function guard(acao: 'view' | 'update') {
  const perm = acao === 'view' ? 'configuracoes:view' : 'configuracoes:update'
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Trechos de uma versão (uid + rótulo + texto) — para o admin escolher as âncoras das regras. */
export async function trechosDaVersao(versaoId: string): Promise<{ ok: boolean; error?: string; trechos: { uid: string; ordem: number; tipo: string; rotulo: string | null; texto: string }[] }> {
  const g = await guard('view')
  if (!g.ok) return { ok: false, error: g.error, trechos: [] }
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from('simulado_conteudo_trechos')
    .select('uid, ordem, tipo, rotulo, texto').eq('tenant_id', g.tenantId).eq('versao_id', versaoId).order('ordem', { ascending: true }))
  return { ok: true, trechos: (rows ?? []).map((t) => ({ uid: t.uid, ordem: t.ordem, tipo: t.tipo, rotulo: t.rotulo, texto: t.texto })) }
}

export async function criarDesafioAction(vinculoId: string, titulo: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  if (!titulo.trim()) return { ok: false, error: 'Título obrigatório.' }
  const r = await criarDesafio({ vinculoId, titulo, criadoPor: g.atorId })
  if ('erro' in r) return { ok: false, error: r.erro }
  revalidatePath('/admin/biblioteca')
  return { ok: true, id: r.id }
}

export async function listarDesafiosAction(vinculoId: string) {
  const g = await guard('view')
  if (!g.ok) return { ok: false as const, error: g.error, desafios: [] }
  return { ok: true as const, desafios: await listarDesafios(vinculoId) }
}

export async function listarRegrasAction(desafioId: string) {
  const g = await guard('view')
  if (!g.ok) return { ok: false as const, error: g.error, regras: [] }
  // NÃO devolve gabarito ao front: strip server-side
  const regras = (await listarRegrasAdmin(desafioId)).map((r) => ({ ...r, gabarito: r.gabarito ? '•••' : null }))
  return { ok: true as const, regras }
}

export async function criarRegraAction(input: {
  desafioId: string; acao: AcaoRegra; trechoUidInicio: string; trechoUidFim?: string | null
  inicioOffset?: number | null; fimOffset?: number | null; textoAncora?: string | null; gabarito?: string | null
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const r = await criarRegra(input)
  if ('erro' in r) return { ok: false, error: r.erro }
  revalidatePath('/admin/biblioteca')
  return { ok: true, id: r.id }
}

export async function removerRegraAction(id: string): Promise<{ ok: boolean }> {
  const g = await guard('update')
  if (!g.ok) return { ok: false }
  await removerRegra(id)
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}
