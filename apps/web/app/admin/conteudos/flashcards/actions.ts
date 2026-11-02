'use server'

// BARALHOS DE FLASHCARDS (Estúdio de Conteúdo). Server actions com o padrão de segurança admin:
// checkPermission (flashcards:*) + service role + tenant/ator da SESSÃO (nunca do host). REUSA o backend
// de flashcards (lib/flashcards) — só adiciona o conceito de BARALHO nomeado. Tolerante à migração
// 20261031050000 ausente (mostra aviso em vez de quebrar). Toda escrita chama registrarAudit.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import {
  listarBaralhos, getBaralho, criarBaralho, atualizarBaralho, publicarBaralho, despublicarBaralho,
  excluirBaralho, duplicarBaralho, definirBaralhoGrupos,
  criarCartaoBaralho, atualizarCartaoBaralho, removerCartao, reordenarCartoes,
  parseCsvCartoes, importarCartoes, SCHEMA_AUSENTE,
  type BaralhoLista, type BaralhoDetalhe, type BaralhoAlcance, type LinhaImportCartao,
} from '@/lib/flashcards/baralhos'

const T_BARALHO = 'simulado_flashcard_baralhos'
const T_CARD = 'simulado_flashcards'
const AVISO_MIGRACAO = 'Os baralhos ficam disponíveis após aplicar a migração 20261031050000_flashcard_baralhos.'

async function guard(acao: 'view' | 'create' | 'update') {
  const perm = acao === 'view' ? 'flashcards:view' : acao === 'create' ? 'flashcards:create' : 'flashcards:update'
  const access = await getCurrentAccess()
  const ok = access.isAdmin || access.permissions.includes(perm) || access.permissions.includes('flashcards:manage')
  if (!ok) return { ok: false as const, error: 'Sem permissão.' }
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido — recarregue a página.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

function erroDe(e: any, fallback: string): string {
  const msg = e?.message || e?.erro || ''
  return SCHEMA_AUSENTE.test(msg) ? AVISO_MIGRACAO : (msg || fallback)
}

// ───────────────────────────── Leitura ─────────────────────────────
export async function listarBaralhosAction(
  opts: { q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; perPage?: number } = {},
): Promise<{ ok: boolean; error?: string; aviso?: string; rows: BaralhoLista[]; total: number }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error, rows: [], total: 0 }
  try {
    const { rows, total } = await listarBaralhos(createAdminClient(), g.tenantId, opts)
    return { ok: true, rows, total }
  } catch (e: any) {
    if (SCHEMA_AUSENTE.test(e?.message || '')) return { ok: true, rows: [], total: 0, aviso: AVISO_MIGRACAO }
    return { ok: false, error: e?.message || 'Falha ao listar baralhos.', rows: [], total: 0 }
  }
}

export async function getBaralhoAction(id: string): Promise<{ ok: boolean; error?: string; aviso?: string; baralho?: BaralhoDetalhe }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error }
  try {
    const baralho = await getBaralho(createAdminClient(), g.tenantId, id)
    if (!baralho) return { ok: false, error: 'Baralho não encontrado.' }
    return { ok: true, baralho }
  } catch (e: any) {
    if (SCHEMA_AUSENTE.test(e?.message || '')) return { ok: true, aviso: AVISO_MIGRACAO }
    return { ok: false, error: e?.message || 'Falha ao carregar o baralho.' }
  }
}

/** Grupos de acesso do tenant (para o alcance "Somente grupos de acesso"). */
export async function listarGruposAction(): Promise<{ ok: boolean; grupos: { id: string; nome: string }[] }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, grupos: [] }
  const svc = createAdminClient()
  let res = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome')
  if (res.error) res = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).order('nome')
  return { ok: true, grupos: ((res.data ?? []) as any[]).map((r) => ({ id: r.id, nome: r.nome })) }
}

// ───────────────────────────── Baralho (CRUD) ─────────────────────────────
export async function criarBaralhoAction(input: { nome: string; descricao?: string | null; alcance?: BaralhoAlcance }): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('create'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await criarBaralho(svc, { tenantId: g.tenantId, nome: input.nome, descricao: input.descricao, alcance: input.alcance, criadoPor: g.atorId })
  if ('erro' in r) return { ok: false, error: erroDe(r, 'Falha ao criar o baralho.') }
  await registrarAudit({ operacao: 'INSERT', entidade: T_BARALHO, entidadeId: r.id, depois: { nome: input.nome, alcance: input.alcance ?? 'todos' }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true, id: r.id }
}

export async function atualizarBaralhoAction(id: string, patch: { nome?: string; descricao?: string | null; alcance?: BaralhoAlcance }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await atualizarBaralho(createAdminClient(), g.tenantId, id, patch)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao salvar o baralho.') }
  await registrarAudit({ operacao: 'UPDATE', entidade: T_BARALHO, entidadeId: id, depois: patch as Record<string, unknown>, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true }
}

export async function definirAlcanceGruposAction(id: string, grupoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  await definirBaralhoGrupos(createAdminClient(), g.tenantId, id, grupoIds)
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true }
}

export async function publicarBaralhoAction(id: string, _avisarAlunos = false): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await publicarBaralho(createAdminClient(), g.tenantId, id)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao publicar.') }
  await registrarAudit({ operacao: 'LIBERAR', entidade: T_BARALHO, entidadeId: id, depois: { status: 'publicado', avisar: _avisarAlunos }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true }
}

export async function despublicarBaralhoAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await despublicarBaralho(createAdminClient(), g.tenantId, id)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao despublicar.') }
  await registrarAudit({ operacao: 'BLOQUEAR', entidade: T_BARALHO, entidadeId: id, depois: { status: 'rascunho' }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true }
}

export async function excluirBaralhoAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await excluirBaralho(createAdminClient(), g.tenantId, id, g.atorId)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao excluir.') }
  await registrarAudit({ operacao: 'DELETE', entidade: T_BARALHO, entidadeId: id, antes: { id }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true }
}

export async function excluirBaralhosLoteAction(ids: string[]): Promise<{ ok: boolean; error?: string; excluidos: number }> {
  const g = await guard('update'); if (!g.ok) return { ...g, excluidos: 0 }
  const svc = createAdminClient()
  let n = 0
  for (const id of [...new Set((ids ?? []).filter(Boolean))]) {
    const r = await excluirBaralho(svc, g.tenantId, id, g.atorId)
    if (r.ok) { n++; await registrarAudit({ operacao: 'DELETE', entidade: T_BARALHO, entidadeId: id, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {}) }
  }
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true, excluidos: n }
}

export async function duplicarBaralhoAction(id: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('create'); if (!g.ok) return g
  const r = await duplicarBaralho(createAdminClient(), g.tenantId, id, g.atorId)
  if ('erro' in r) return { ok: false, error: erroDe(r, 'Falha ao duplicar.') }
  await registrarAudit({ operacao: 'INSERT', entidade: T_BARALHO, entidadeId: r.id, depois: { duplicado_de: id }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true, id: r.id }
}

// ───────────────────────────── Cartões ─────────────────────────────
export async function criarCartaoAction(baralhoId: string, input: { frente: string; verso: string; fonte?: string | null; disciplina?: string | null }): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await criarCartaoBaralho(createAdminClient(), { tenantId: g.tenantId, baralhoId, ...input, criadoPor: g.atorId })
  if ('erro' in r) return { ok: false, error: erroDe(r, 'Falha ao criar o cartão.') }
  await registrarAudit({ operacao: 'INSERT', entidade: T_CARD, entidadeId: r.id, depois: { baralho_id: baralhoId, frente: input.frente }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true, id: r.id }
}

export async function atualizarCartaoAction(id: string, patch: { frente?: string; verso?: string; fonte?: string | null; disciplina?: string | null; ativo?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await atualizarCartaoBaralho(createAdminClient(), g.tenantId, id, patch)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao salvar o cartão.') }
  await registrarAudit({ operacao: patch.ativo === undefined ? 'UPDATE' : patch.ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: T_CARD, entidadeId: id, depois: patch as Record<string, unknown>, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true }
}

export async function removerCartaoAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await removerCartao(createAdminClient(), g.tenantId, id)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao remover o cartão.') }
  await registrarAudit({ operacao: 'DELETE', entidade: T_CARD, entidadeId: id, antes: { id }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true }
}

export async function reordenarCartoesAction(itens: { id: string; ordem: number }[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await reordenarCartoes(createAdminClient(), g.tenantId, itens)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao reordenar.') }
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true }
}

// ───────────────────────────── Importação CSV ─────────────────────────────
export async function analisarImportCartoesAction(csvTexto: string): Promise<{ ok: boolean; error?: string; linhas: LinhaImportCartao[]; resumo: { total: number; validas: number; invalidas: number } }> {
  const g = await guard('update'); if (!g.ok) return { ...g, linhas: [], resumo: { total: 0, validas: 0, invalidas: 0 } }
  if (!csvTexto?.trim()) return { ok: false, error: 'Arquivo vazio.', linhas: [], resumo: { total: 0, validas: 0, invalidas: 0 } }
  const linhas = parseCsvCartoes(csvTexto)
  if (!linhas.length) return { ok: false, error: 'Nenhum cartão encontrado. Confira o cabeçalho (frente, verso, fonte, disciplina) e ao menos uma linha.', linhas: [], resumo: { total: 0, validas: 0, invalidas: 0 } }
  const validas = linhas.filter((l) => l.ok).length
  return { ok: true, linhas, resumo: { total: linhas.length, validas, invalidas: linhas.length - validas } }
}

export async function confirmarImportCartoesAction(baralhoId: string, linhas: LinhaImportCartao[]): Promise<{ ok: boolean; error?: string; inseridos?: number }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await importarCartoes(createAdminClient(), g.tenantId, baralhoId, linhas, g.atorId)
  if (r.erro) return { ok: false, error: erroDe(r, 'Falha ao importar os cartões.') }
  await registrarAudit({ operacao: 'INSERT', entidade: T_CARD, entidadeId: baralhoId, depois: { importados: r.inseridos }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/flashcards')
  return { ok: true, inseridos: r.inseridos }
}
