'use server'

// NOVIDADES ("O que mudou") — autoria/gestão do changelog por tenant (admin). Envolve a lib PRONTA
// (lib/novidades/novidades.ts) com o padrão de SEGURANÇA das server actions admin: checkPermission +
// service role + tenant/ator resolvidos da SESSÃO ADMIN (nunca do host) + auditoria + revalidate.
// NÃO edita a lib nem a migração (20261028000000_novidades.sql).
//
// Permissão: reusa o resource `configuracoes` do catálogo RBAC (lib/rbac-catalogo.ts) — Novidades é
// Comunicação, mesma área de "Banners & Pop-ups". `view` p/ listar, `manage` p/ criar/editar/excluir
// (ambos concedíveis no RBAC; `configuracoes` só expõe view/manage).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import {
  listarNovidadesAdmin, criarNovidade, atualizarNovidade, removerNovidade,
  type Novidade, type CategoriaNovidade,
} from '@/lib/novidades/novidades'

export type NovidadeAdmin = Novidade & { ativo: boolean; criado_em: string }

/** Campos do formulário (criar/editar). `publicadoEm` já vem em ISO (convertido no client via @/lib/brt). */
export type NovidadeInput = {
  categoria: CategoriaNovidade
  titulo: string
  descricao?: string | null
  destaque?: boolean
  coverUrl?: string | null
  ctaLabel?: string | null
  ctaUrl?: string | null
  cta2Label?: string | null
  cta2Url?: string | null
  publicadoEm?: string | null
  ativo?: boolean
}

const T = 'simulado_novidades'
// A migração 20261028000000 pode ainda NÃO estar aplicada: a tela não pode quebrar — detecta a
// tabela ausente e devolve lista vazia + aviso discreto (em vez de propagar o erro do Postgres).
const TABELA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist/i
const AVISO_MIGRACAO = 'Rode a migração 20261028000000 (novidades).'

async function guard(acao: 'view' | 'manage') {
  const perm = acao === 'view' ? 'configuracoes:view' : 'configuracoes:manage'
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Lista TODAS as novidades do tenant (inclui inativas) para a tela de gestão. */
export async function listarNovidadesAction(): Promise<{ ok: boolean; error?: string; aviso?: string; itens: NovidadeAdmin[] }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error, itens: [] }
  const svc = createAdminClient()
  try {
    const itens = await listarNovidadesAdmin(svc, g.tenantId)
    return { ok: true, itens }
  } catch (e: any) {
    if (TABELA_AUSENTE.test(e?.message || '')) {
      return { ok: true, itens: [], aviso: 'As novidades ficam disponíveis após a migração 20261028000000 ser aplicada.' }
    }
    return { ok: false, error: e?.message || 'Falha ao carregar as novidades.', itens: [] }
  }
}

/** Cria uma novidade. */
export async function criarNovidadeAction(input: NovidadeInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('manage'); if (!g.ok) return g
  if (!input.titulo?.trim()) return { ok: false, error: 'Informe o título.' }
  const svc = createAdminClient()
  const r = await criarNovidade(svc, {
    tenantId: g.tenantId,
    categoria: input.categoria,
    titulo: input.titulo,
    descricao: input.descricao ?? null,
    destaque: !!input.destaque,
    coverUrl: input.coverUrl ?? null,
    ctaLabel: input.ctaLabel ?? null,
    ctaUrl: input.ctaUrl ?? null,
    cta2Label: input.cta2Label ?? null,
    cta2Url: input.cta2Url ?? null,
    publicadoEm: input.publicadoEm ?? null,
    criadoPor: g.atorId,
  })
  if ('erro' in r) {
    return { ok: false, error: TABELA_AUSENTE.test(r.erro) ? AVISO_MIGRACAO : r.erro }
  }
  // `criarNovidade` nasce ativa; se o admin escolheu "inativa", aplica logo após inserir.
  if (input.ativo === false) await atualizarNovidade(svc, g.tenantId, r.id, { ativo: false }).catch(() => {})
  await registrarAudit({ operacao: 'INSERT', entidade: T, entidadeId: r.id, depois: { categoria: input.categoria, titulo: input.titulo.trim(), destaque: !!input.destaque }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/configuracoes/novidades')
  return { ok: true, id: r.id }
}

/** Atualiza uma novidade (campos omitidos = não mexe). */
export async function atualizarNovidadeAction(id: string, patch: NovidadeInput): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('manage'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await atualizarNovidade(svc, g.tenantId, id, {
    categoria: patch.categoria,
    titulo: patch.titulo,
    descricao: patch.descricao,
    destaque: patch.destaque,
    coverUrl: patch.coverUrl,
    ctaLabel: patch.ctaLabel,
    ctaUrl: patch.ctaUrl,
    cta2Label: patch.cta2Label,
    cta2Url: patch.cta2Url,
    publicadoEm: patch.publicadoEm ?? undefined,
    ativo: patch.ativo,
  })
  if (!r.ok) return { ok: false, error: r.erro && TABELA_AUSENTE.test(r.erro) ? AVISO_MIGRACAO : r.erro }
  const op = patch.ativo === undefined ? 'UPDATE' : patch.ativo ? 'LIBERAR' : 'BLOQUEAR'
  await registrarAudit({ operacao: op, entidade: T, entidadeId: id, depois: patch as Record<string, unknown>, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/configuracoes/novidades')
  return { ok: true }
}

/** Liga/desliga a exibição de uma novidade para os alunos. */
export async function alternarNovidadeAtivaAction(id: string, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('manage'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await atualizarNovidade(svc, g.tenantId, id, { ativo })
  if (!r.ok) return { ok: false, error: r.erro && TABELA_AUSENTE.test(r.erro) ? AVISO_MIGRACAO : r.erro }
  await registrarAudit({ operacao: ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: T, entidadeId: id, depois: { ativo }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/configuracoes/novidades')
  return { ok: true }
}

/** Remove uma novidade (cascata apaga as marcações de leitura dos alunos). */
export async function removerNovidadeAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('manage'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await removerNovidade(svc, g.tenantId, id)
  if (!r.ok) return { ok: false, error: r.erro && TABELA_AUSENTE.test(r.erro) ? AVISO_MIGRACAO : r.erro }
  await registrarAudit({ operacao: 'DELETE', entidade: T, entidadeId: id, antes: { id }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/configuracoes/novidades')
  return { ok: true }
}
