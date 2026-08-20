'use server'

/**
 * CRUD dos links de aula (spec §8, "Também precisa de CRUD: os links de aula").
 *
 * A tabela é global por tenant, não por cronograma: o link pertence ao par
 * (disciplina, aula) e vale para todo cronograma que citar aquela aula. É também o único
 * lugar onde o `tema` existe — e é ele que a ficha de desempenho usa como título da linha.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { chaveLink } from '@/lib/cronograma/formato-meta'

export type LinkAulaRow = {
  id: string
  disciplina: string
  aula: string
  tema: string | null
  url_qc: string | null
  url_tec: string | null
  /** Quantas metas de questões citam este par — 0 significa link sem uso. */
  usos: number
}

export type EntradaLink = {
  disciplina: string
  aula: string
  tema: string | null
  url_qc: string | null
  url_tec: string | null
}

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/**
 * Lista os links e, junto, os pares de questões que AINDA NÃO têm link.
 *
 * Os dois lados importam: link sem uso é dado morto, e questão sem link faz o aluno ver
 * "Não há link do QC" na grade (R11).
 */
export async function listarLinks(): Promise<{
  ok: boolean
  itens?: LinkAulaRow[]
  faltando?: { disciplina: string; aula: string; metas: number }[]
  error?: string
}> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const [links, metas] = await Promise.all([
    fetchAll<{ id: string; disciplina: string; aula: string; tema: string | null; url_qc: string | null; url_tec: string | null }>(
      () =>
        svc
          .from('simulado_cronograma_links')
          .select('id, disciplina, aula, tema, url_qc, url_tec')
          .eq('tenant_id', g.tenantId)
          .order('disciplina')
          .order('aula') as any,
    ),
    // Só as metas de questões: são as únicas em que o link aparece (R11).
    fetchAll<{ disciplina: string; aula: string | null }>(() =>
      svc
        .from('simulado_cronograma_metas')
        .select('disciplina, aula')
        .eq('tenant_id', g.tenantId)
        .eq('tipo', 'quest')
        .not('aula', 'is', null)
        .order('disciplina')
        .order('aula') as any,
    ),
  ])

  // Uso por par, pela MESMA função de chave do motor — se cada um normalizasse do seu
  // jeito, a contagem discordaria do que o aluno vê na grade.
  const usoPorChave = new Map<string, number>()
  const exemplo = new Map<string, { disciplina: string; aula: string }>()
  for (const m of metas) {
    const k = chaveLink(m.disciplina, m.aula)
    if (!k) continue
    usoPorChave.set(k, (usoPorChave.get(k) ?? 0) + 1)
    if (!exemplo.has(k)) exemplo.set(k, { disciplina: m.disciplina, aula: m.aula as string })
  }

  const comLink = new Set<string>()
  const itens = links.map((l) => {
    const k = chaveLink(l.disciplina, l.aula)
    if (k) comLink.add(k)
    return { ...l, usos: k ? (usoPorChave.get(k) ?? 0) : 0 }
  })

  const faltando = [...usoPorChave.entries()]
    .filter(([k]) => !comLink.has(k))
    .map(([k, metas]) => ({ ...(exemplo.get(k) as { disciplina: string; aula: string }), metas }))
    .sort((a, b) => b.metas - a.metas)

  return { ok: true, itens, faltando }
}

function validar(e: EntradaLink): string | null {
  if (!e.disciplina.trim()) return 'Informe a disciplina.'
  if (!e.aula.trim()) return 'Informe a aula.'
  for (const [rotulo, url] of [
    ['QC', e.url_qc],
    ['TEC', e.url_tec],
  ] as const) {
    const u = url?.trim()
    if (u && !/^https?:\/\//i.test(u)) return `O link do ${rotulo} precisa começar com http:// ou https://`
  }
  return null
}

/** `aula` é gravada como TEXTO, sem coerção: "01" e "1" são aulas diferentes (R11). */
function normalizar(e: EntradaLink) {
  return {
    disciplina: e.disciplina.trim(),
    aula: e.aula.trim(),
    tema: e.tema?.trim() || null,
    url_qc: e.url_qc?.trim() || null,
    url_tec: e.url_tec?.trim() || null,
  }
}

export async function criarLink(e: EntradaLink): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const erro = validar(e)
  if (erro) return { ok: false, error: erro }

  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_cronograma_links')
    .insert({ tenant_id: g.tenantId, ...normalizar(e) })
    .select('id')
    .single()
  if (error) {
    return {
      ok: false,
      error: /duplicate|unique/i.test(error.message) ? 'Já existe link para essa disciplina e aula.' : error.message,
    }
  }
  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_cronograma_links',
    entidadeId: (data as any).id,
    depois: normalizar(e),
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas/links')
  return { ok: true, id: (data as any).id }
}

export async function atualizarLink(id: string, e: EntradaLink): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const erro = validar(e)
  if (erro) return { ok: false, error: erro }

  const svc = createAdminClient()
  const { data: antes } = await svc
    .from('simulado_cronograma_links')
    .select('disciplina, aula, tema, url_qc, url_tec')
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .maybeSingle()
  if (!antes) return { ok: false, error: 'Link não encontrado.' }

  const { error } = await svc
    .from('simulado_cronograma_links')
    .update({ ...normalizar(e), atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) {
    return {
      ok: false,
      error: /duplicate|unique/i.test(error.message) ? 'Já existe link para essa disciplina e aula.' : error.message,
    }
  }
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_links',
    entidadeId: id,
    antes: antes as Record<string, unknown>,
    depois: normalizar(e),
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas/links')
  return { ok: true }
}

export async function excluirLink(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_cronograma_links').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({
    operacao: 'DELETE',
    entidade: 'simulado_cronograma_links',
    entidadeId: id,
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas/links')
  return { ok: true }
}
