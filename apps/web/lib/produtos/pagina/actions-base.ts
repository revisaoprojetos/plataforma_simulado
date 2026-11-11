'use server'

// AÇÕES BASE do editor visual da página do extensivo (P4 estende: histórico, restaurar, presets, preview).
// Toda mutação: permissão produtos:manage + service role + tenant_id + auditoria + revalidate. Leitura: produtos:view|manage.
// Tolerante à migração ausente (20261113130000): devolve erro amigável em vez de quebrar; leitura cai no legado.
// 'use server': só funções async exportadas (tipos ficam em tipos.ts).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { accessCan, getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { carregarPaginaProduto } from './loader'
import { MAX_BLOCOS, normalizarPagina } from './normalizar'
import type { PaginaV1 } from './tipos'

const MSG_MIGRACAO = 'Recurso indisponível até aplicar a migração 20261113130000 (pnpm migracoes aplicar).'
const tabelaAusente = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? ''))

async function guard(manage: boolean) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'produtos:manage') && !(!manage && accessCan(access, 'produtos:view'))) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId, userId: access.userId }
}

async function produtoExiste(svc: ReturnType<typeof createAdminClient>, tenantId: string, produtoId: string) {
  const { data } = await svc.from('simulado_produtos').select('id').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle()
  return !!data
}

/** Rascunho do produto; sem rascunho ⇒ cópia do publicado; sem nada ⇒ SEED (derivação atual). NÃO grava. */
export async function lerRascunhoOuSeed(produtoId: string) {
  const g = await guard(false); if ('error' in g) return { error: g.error }
  if (!(await produtoExiste(createAdminClient(), g.tenantId, produtoId))) return { error: 'Produto não encontrado.' }
  const r = await carregarPaginaProduto(produtoId, { estado: 'rascunho', tenantId: g.tenantId })
  return { ok: true as const, pagina: r.pagina, origem: r.origem, estado: r.estado, versaoId: r.versaoId, semRascunho: !!r.semRascunho }
}

/** Grava (cria ou substitui) o ÚNICO rascunho do produto. `pagina` é normalizada/sanitizada no servidor. */
export async function salvarRascunho(produtoId: string, pagina: unknown) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  if (!(await produtoExiste(svc, g.tenantId, produtoId))) return { error: 'Produto não encontrado.' }
  const lista = Array.isArray((pagina as any)?.blocos) ? (pagina as any).blocos : []
  if (lista.length > MAX_BLOCOS) return { error: 'Quantidade de blocos inválida.' }
  const p: PaginaV1 = normalizarPagina(pagina)

  // Módulos só do próprio produto, sem repetir em 2 seções, 1 única seção “restantes” (mesma regra do construtor v0).
  try {
    const mods = await fetchAll<any>(() => svc.from('simulado_produto_modulos').select('id')
      .eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).order('id', { ascending: true }) as any, 1000, 'pagina:valid')
    const validos = new Set(mods.map((m) => m.id as string)); const usados = new Set<string>(); let restantes = false
    for (const b of p.blocos) if (b.tipo === 'modulos') {
      b.conteudo.modulo_ids = b.conteudo.modulo_ids.filter((id) => validos.has(id) && !usados.has(id)); b.conteudo.modulo_ids.forEach((id) => usados.add(id))
      if (b.conteudo.restantes) { if (restantes) b.conteudo.restantes = false; else restantes = true }
    }
  } catch { /* sem validação extra se a leitura falhar */ }

  const campos = { blocos: p.blocos as any, tema: (p.tema ?? {}) as any }
  const ex = await svc.from('simulado_produto_pagina_versoes').select('id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('estado', 'rascunho').maybeSingle()
  if (ex.error) return { error: tabelaAusente(ex.error) ? MSG_MIGRACAO : ex.error.message }
  let id = (ex.data as any)?.id as string | undefined
  if (id) {
    const { error } = await svc.from('simulado_produto_pagina_versoes').update(campos).eq('id', id).eq('tenant_id', g.tenantId)
    if (error) return { error: error.message }
  } else {
    const ins = await svc.from('simulado_produto_pagina_versoes').insert({ tenant_id: g.tenantId, produto_id: produtoId, estado: 'rascunho', criado_por: g.userId, ...campos }).select('id').maybeSingle()
    if (ins.error) return { error: tabelaAusente(ins.error) ? MSG_MIGRACAO : ins.error.message }
    id = (ins.data as any)?.id
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_pagina_versoes', entidadeId: id ?? produtoId, depois: { produto_id: produtoId, estado: 'rascunho', blocos: p.blocos.length }, tenantId: g.tenantId })
  revalidatePath(`/admin/conteudos/produtos/${produtoId}`)
  return { ok: true as const, versaoId: id ?? null, pagina: p }
}

/** Promove o rascunho a PUBLICADO (o publicado anterior vira ARQUIVADO = histórico) e invalida a página do aluno. */
export async function publicarRascunho(produtoId: string, rotulo?: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const T = 'simulado_produto_pagina_versoes'
  const r = await svc.from(T).select('id, blocos').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('estado', 'rascunho').maybeSingle()
  if (r.error) return { error: tabelaAusente(r.error) ? MSG_MIGRACAO : r.error.message }
  if (!r.data) return { error: 'Não há rascunho para publicar.' }
  const rasc = r.data as any
  const antigo = await svc.from(T).select('id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('estado', 'publicado').maybeSingle()
  const antigoId = (antigo.data as any)?.id as string | undefined
  if (antigoId) {
    const a = await svc.from(T).update({ estado: 'arquivado' }).eq('id', antigoId).eq('tenant_id', g.tenantId)
    if (a.error) return { error: a.error.message }
  }
  const pub = await svc.from(T).update({ estado: 'publicado', publicado_em: new Date().toISOString(), rotulo: rotulo?.trim().slice(0, 120) || null }).eq('id', rasc.id).eq('tenant_id', g.tenantId)
  if (pub.error) {
    if (antigoId) await svc.from(T).update({ estado: 'publicado' }).eq('id', antigoId).eq('tenant_id', g.tenantId) // compensa
    return { error: pub.error.message }
  }
  await registrarAudit({ operacao: 'LIBERAR', entidade: T, entidadeId: rasc.id, antes: antigoId ? { publicado_anterior: antigoId } : null, depois: { produto_id: produtoId, estado: 'publicado', rotulo: rotulo ?? null, blocos: Array.isArray(rasc.blocos) ? rasc.blocos.length : 0 }, tenantId: g.tenantId })
  revalidatePath('/admin/produtos'); revalidatePath(`/admin/conteudos/produtos/${produtoId}`); revalidatePath('/aluno/extensivos', 'layout')
  return { ok: true as const, versaoId: rasc.id as string }
}
