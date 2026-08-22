'use server'

/**
 * CRUD dos tipos de meta.
 *
 * Diferente de categoria e plataforma, que são só rótulos, o tipo carrega SETE
 * comportamentos do gerador. Por isso cada um é uma coluna explícita, e criar um tipo
 * novo é responder seis perguntas — em vez de o motor reconhecer um slug conhecido.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { listarTiposMeta } from '@/lib/cronograma/carregar-tipos'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'

export type TipoComUso = TipoMetaDef & { ativo: boolean; usos: number }

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

/** Lista os tipos (inclusive inativos) com quantas metas usam cada um. */
export async function listarTipos(): Promise<{ ok: boolean; itens?: TipoComUso[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const [tipos, { data: metas }] = await Promise.all([
    listarTiposMeta(g.tenantId, true),
    svc.from('simulado_cronograma_metas').select('tipo').eq('tenant_id', g.tenantId),
  ])

  const conta = new Map<string, number>()
  for (const m of (metas ?? []) as any[]) conta.set(m.tipo, (conta.get(m.tipo) ?? 0) + 1)
  return { ok: true, itens: tipos.map((t) => ({ ...(t as any), usos: conta.get(t.slug) ?? 0 })) }
}

export type EntradaTipo = {
  nome: string
  rotulo_docx: string
  cor: string | null
  mostra_links: boolean
  prefixo_aula: boolean
  aula_no_titulo: boolean
  quebra_conteudo: boolean
  conta_atividade: boolean
  destaque_docx: boolean
  sempre_no_docx: boolean
}

export async function criarTipo(e: EntradaTipo): Promise<{ ok: boolean; id?: string; slug?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const nome = e.nome.trim()
  if (!nome) return { ok: false, error: 'Informe o nome do tipo.' }
  const slug = gerarSlug(nome)
  if (!slug) return { ok: false, error: 'O nome precisa ter ao menos uma letra ou número.' }

  const svc = createAdminClient()
  const { data: ultimo } = await svc
    .from('simulado_cronograma_tipos_meta')
    .select('ordem')
    .eq('tenant_id', g.tenantId)
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await svc
    .from('simulado_cronograma_tipos_meta')
    .insert({
      tenant_id: g.tenantId,
      slug,
      nome,
      rotulo_docx: e.rotulo_docx.trim() || nome.toUpperCase(),
      ordem: ((ultimo as any)?.ordem ?? -1) + 1,
      cor: e.cor || null,
      mostra_links: e.mostra_links,
      prefixo_aula: e.prefixo_aula,
      aula_no_titulo: e.aula_no_titulo,
      quebra_conteudo: e.quebra_conteudo,
      conta_atividade: e.conta_atividade,
      destaque_docx: e.destaque_docx,
      sempre_no_docx: e.sempre_no_docx,
    })
    .select('id, slug')
    .single()
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe um tipo com esse nome.' : error.message }
  }
  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_cronograma_tipos_meta',
    entidadeId: (data as any).id,
    depois: { nome, slug },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  return { ok: true, id: (data as any).id, slug: (data as any).slug }
}

/** O slug NÃO muda ao editar: é a chave gravada nas metas e usada pela importação. */
export async function atualizarTipo(id: string, e: EntradaTipo): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const nome = e.nome.trim()
  if (!nome) return { ok: false, error: 'Informe o nome do tipo.' }

  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronograma_tipos_meta')
    .update({
      nome,
      rotulo_docx: e.rotulo_docx.trim() || nome.toUpperCase(),
      cor: e.cor || null,
      mostra_links: e.mostra_links,
      prefixo_aula: e.prefixo_aula,
      aula_no_titulo: e.aula_no_titulo,
      quebra_conteudo: e.quebra_conteudo,
      conta_atividade: e.conta_atividade,
      destaque_docx: e.destaque_docx,
      sempre_no_docx: e.sempre_no_docx,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe um tipo com esse nome.' : error.message }
  }
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_tipos_meta',
    entidadeId: id,
    depois: { ...e },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  return { ok: true }
}

/** Reordena — é a ordem R10, que decide a sequência das metas dentro do dia. */
export async function reordenarTipos(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  for (const [i, id] of ids.entries()) {
    await svc
      .from('simulado_cronograma_tipos_meta')
      .update({ ordem: i, atualizado_em: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', g.tenantId)
  }
  return { ok: true }
}

/**
 * Tipo em uso NÃO é excluído — é desativado.
 *
 * Excluir deixaria metas apontando um slug inexistente, e elas cairiam no comportamento
 * padrão sem ninguém perceber. Desativar tira da lista de escolha e preserva as metas.
 */
export async function alternarAtivoTipo(id: string, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronograma_tipos_meta')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({
    operacao: ativo ? 'LIBERAR' : 'BLOQUEAR',
    entidade: 'simulado_cronograma_tipos_meta',
    entidadeId: id,
    depois: { ativo },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  return { ok: true }
}

export async function excluirTipo(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const { data: tipo } = await svc
    .from('simulado_cronograma_tipos_meta')
    .select('slug')
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .maybeSingle()
  if (!tipo) return { ok: false, error: 'Tipo não encontrado.' }

  const { data: emUso } = await svc
    .from('simulado_cronograma_metas')
    .select('id')
    .eq('tenant_id', g.tenantId)
    .eq('tipo', (tipo as any).slug)
    .limit(1)
  if ((emUso ?? []).length) {
    return { ok: false, error: 'Este tipo está em uso por metas. Desative-o em vez de excluir, para não deixar metas órfãs.' }
  }

  const { error } = await svc.from('simulado_cronograma_tipos_meta').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({
    operacao: 'DELETE',
    entidade: 'simulado_cronograma_tipos_meta',
    entidadeId: id,
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  return { ok: true }
}
