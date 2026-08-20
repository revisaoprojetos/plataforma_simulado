'use server'

/**
 * Links de aula e o cadastro de PLATAFORMAS de curso.
 *
 * A tabela de links é global por tenant, não por cronograma: o link pertence ao par
 * (disciplina, aula) e vale para todo cronograma que citar aquela aula. É também o único
 * lugar onde o `tema` existe — e é ele que a ficha de desempenho usa como título.
 *
 * Cada aula tem N links, um por plataforma cadastrada. Antes eram duas colunas fixas
 * (QC e TEC), o que exigia migration para cada banco de questões novo.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { chaveLink } from '@/lib/cronograma/formato-meta'

export type PlataformaRow = {
  id: string
  nome: string
  slug: string
  cor: string | null
  ordem: number
  ativo: boolean
  /** Quantos links usam esta plataforma — evita excluir uma que está em uso sem saber. */
  usos: number
}

export type LinkAulaRow = {
  id: string
  disciplina: string
  aula: string
  tema: string | null
  urls: { plataforma_id: string; url: string }[]
  /** Quantas metas de questões citam este par. */
  usos: number
}

export type EntradaLink = {
  disciplina: string
  aula: string
  tema: string | null
  urls: { plataforma_id: string; url: string }[]
}

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

function gerarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Lista links, plataformas e os pares de questões que ainda não têm link nenhum. */
export async function listarLinks(): Promise<{
  ok: boolean
  itens?: LinkAulaRow[]
  plataformas?: PlataformaRow[]
  faltando?: { disciplina: string; aula: string; metas: number }[]
  error?: string
}> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const [links, urls, plataformas, metas] = await Promise.all([
    fetchAll<{ id: string; disciplina: string; aula: string; tema: string | null }>(() =>
      svc
        .from('simulado_cronograma_links')
        .select('id, disciplina, aula, tema')
        .eq('tenant_id', g.tenantId)
        .order('disciplina')
        .order('aula') as any,
    ),
    fetchAll<{ link_id: string; plataforma_id: string; url: string }>(() =>
      svc.from('simulado_cronograma_aula_links').select('link_id, plataforma_id, url').eq('tenant_id', g.tenantId).order('id') as any,
    ),
    fetchAll<{ id: string; nome: string; slug: string; cor: string | null; ordem: number; ativo: boolean }>(() =>
      svc
        .from('simulado_cronograma_plataformas')
        .select('id, nome, slug, cor, ordem, ativo')
        .eq('tenant_id', g.tenantId)
        .order('ordem')
        .order('nome') as any,
    ),
    // Só metas de questões: são as únicas em que o link aparece para o aluno (R11).
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

  const urlsPorLink = new Map<string, { plataforma_id: string; url: string }[]>()
  const usoPlataforma = new Map<string, number>()
  for (const u of urls) {
    const lista = urlsPorLink.get(u.link_id)
    if (lista) lista.push({ plataforma_id: u.plataforma_id, url: u.url })
    else urlsPorLink.set(u.link_id, [{ plataforma_id: u.plataforma_id, url: u.url }])
    usoPlataforma.set(u.plataforma_id, (usoPlataforma.get(u.plataforma_id) ?? 0) + 1)
  }

  // A contagem de uso passa pela MESMA chave do motor — se a tela normalizasse por
  // conta própria, discordaria do que o aluno enxerga na grade.
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
    return { ...l, urls: urlsPorLink.get(l.id) ?? [], usos: k ? (usoPorChave.get(k) ?? 0) : 0 }
  })

  const faltando = [...usoPorChave.entries()]
    .filter(([k]) => !comLink.has(k))
    .map(([k, n]) => ({ ...(exemplo.get(k) as { disciplina: string; aula: string }), metas: n }))
    .sort((a, b) => b.metas - a.metas)

  return {
    ok: true,
    itens,
    plataformas: plataformas.map((p) => ({ ...p, usos: usoPlataforma.get(p.id) ?? 0 })),
    faltando,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plataformas

export async function criarPlataforma(nome: string, cor: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe o nome da plataforma.' }
  const slug = gerarSlug(n)
  if (!slug) return { ok: false, error: 'O nome precisa ter ao menos uma letra ou número.' }

  const svc = createAdminClient()
  // Entra por último na ordem de exibição.
  const { data: ultima } = await svc
    .from('simulado_cronograma_plataformas')
    .select('ordem')
    .eq('tenant_id', g.tenantId)
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await svc
    .from('simulado_cronograma_plataformas')
    .insert({ tenant_id: g.tenantId, nome: n, slug, cor: cor || null, ordem: ((ultima as any)?.ordem ?? -1) + 1 })
    .select('id')
    .single()
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe uma plataforma com esse nome.' : error.message }
  }
  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_cronograma_plataformas',
    entidadeId: (data as any).id,
    depois: { nome: n, slug },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas/links')
  return { ok: true, id: (data as any).id }
}

export async function atualizarPlataforma(id: string, nome: string, cor: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe o nome da plataforma.' }

  const svc = createAdminClient()
  // O slug NÃO muda ao renomear: ele é a chave que a importação usa, e trocá-lo
  // silenciosamente quebraria arquivos que já referenciam a plataforma.
  const { error } = await svc
    .from('simulado_cronograma_plataformas')
    .update({ nome: n, cor: cor || null, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe uma plataforma com esse nome.' : error.message }
  }
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_plataformas',
    entidadeId: id,
    depois: { nome: n, cor },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas/links')
  return { ok: true }
}

/** Excluir a plataforma leva junto os links dela (CASCADE) — a tela avisa quantos são. */
export async function excluirPlataforma(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_cronograma_plataformas').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({
    operacao: 'DELETE',
    entidade: 'simulado_cronograma_plataformas',
    entidadeId: id,
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas/links')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Links de aula

function validar(e: EntradaLink): string | null {
  if (!e.disciplina.trim()) return 'Informe a disciplina.'
  if (!e.aula.trim()) return 'Informe a aula.'
  const vistas = new Set<string>()
  for (const u of e.urls) {
    const url = u.url.trim()
    if (!url) continue
    if (!/^https?:\/\//i.test(url)) return 'Todo link precisa começar com http:// ou https://'
    if (vistas.has(u.plataforma_id)) return 'Há duas entradas para a mesma plataforma — deixe uma só.'
    vistas.add(u.plataforma_id)
  }
  return null
}

/** Substitui os links da aula pelo conjunto informado (apaga o que saiu, insere o que entrou). */
async function gravarUrls(svc: any, tenantId: string, linkId: string, urls: EntradaLink['urls']) {
  const validas = urls.filter((u) => u.url.trim())
  await svc.from('simulado_cronograma_aula_links').delete().eq('tenant_id', tenantId).eq('link_id', linkId)
  if (validas.length) {
    await svc.from('simulado_cronograma_aula_links').insert(
      validas.map((u) => ({ tenant_id: tenantId, link_id: linkId, plataforma_id: u.plataforma_id, url: u.url.trim() })),
    )
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
    .insert({ tenant_id: g.tenantId, disciplina: e.disciplina.trim(), aula: e.aula.trim(), tema: e.tema?.trim() || null })
    .select('id')
    .single()
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe link para essa disciplina e aula.' : error.message }
  }
  await gravarUrls(svc, g.tenantId, (data as any).id, e.urls)
  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_cronograma_links',
    entidadeId: (data as any).id,
    depois: { disciplina: e.disciplina, aula: e.aula, links: e.urls.filter((u) => u.url.trim()).length },
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
    .select('disciplina, aula, tema')
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .maybeSingle()
  if (!antes) return { ok: false, error: 'Link não encontrado.' }

  const { error } = await svc
    .from('simulado_cronograma_links')
    .update({
      disciplina: e.disciplina.trim(),
      aula: e.aula.trim(),
      tema: e.tema?.trim() || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe link para essa disciplina e aula.' : error.message }
  }
  await gravarUrls(svc, g.tenantId, id, e.urls)
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_links',
    entidadeId: id,
    antes: antes as Record<string, unknown>,
    depois: { disciplina: e.disciplina, aula: e.aula, links: e.urls.filter((u) => u.url.trim()).length },
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
  // As urls saem por CASCADE, mas apagamos explicitamente para não depender disso.
  await svc.from('simulado_cronograma_aula_links').delete().eq('tenant_id', g.tenantId).eq('link_id', id)
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
