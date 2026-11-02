import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { removerFlashcard, reordenarFlashcards } from './flashcards'

// FLASHCARDS › BARALHOS — camada de dados (I/O) do conceito de "baralho/deck" NOMEADO.
// REUSA o backend existente: a tabela de cartões continua sendo simulado_flashcards (agora com baralho_id,
// fonte, disciplina) e o SRS (simulado_flashcard_revisoes) é o mesmo. Aqui só o acesso ao banco dos
// baralhos + cartões do baralho. O service client (createAdminClient) e o tenantId vêm do chamador
// (server actions), que resolve a sessão admin. Migração: 20261031050000_flashcard_baralhos.sql.

const T_BARALHO = 'simulado_flashcard_baralhos'
const T_CARD = 'simulado_flashcards'
const T_BGRUPO = 'simulado_flashcard_baralho_grupos'
const T_REV = 'simulado_flashcard_revisoes'

/** Erros de "tabela/coluna ainda não migrada" — a tela não quebra; mostra aviso discreto. */
export const SCHEMA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist|column .* does not exist/i

export type BaralhoStatus = 'rascunho' | 'publicado'
export type BaralhoAlcance = 'todos' | 'grupos'

export interface Baralho {
  id: string
  nome: string
  descricao: string | null
  status: BaralhoStatus
  alcance: BaralhoAlcance
  published_at: string | null
  criado_em: string
}
export interface BaralhoLista extends Baralho { cartoes: number }
export interface BaralhoDetalhe extends Baralho {
  cartoes: CartaoBaralho[]
  grupoIds: string[]
  totalCartoes: number
  alunosUsando: number
}

export interface CartaoBaralho {
  id: string
  frente: string
  verso: string
  fonte: string | null
  disciplina: string | null
  ordem: number
  ativo: boolean
}

const B_COLS = 'id, nome, descricao, status, alcance, published_at, criado_em'
const C_COLS = 'id, frente, verso, fonte, disciplina, ordem, ativo'

function tally(rows: { baralho_id: string | null }[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows ?? []) { if (r.baralho_id) m.set(r.baralho_id, (m.get(r.baralho_id) ?? 0) + 1) }
  return m
}

// ───────────────────────────── Baralhos (lista paginada server-driven) ─────────────────────────────
export async function listarBaralhos(
  svc: SupabaseClient, tenantId: string,
  opts: { q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; perPage?: number } = {},
): Promise<{ rows: BaralhoLista[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.max(1, Math.min(50, opts.perPage ?? 10))
  const sort = ['nome', 'status', 'criado_em'].includes(opts.sort ?? '') ? opts.sort! : 'criado_em'
  const asc = opts.dir === 'asc'
  let query = svc.from(T_BARALHO).select(B_COLS, { count: 'exact' })
    .eq('tenant_id', tenantId).eq('deletado', false)
    .order(sort, { ascending: asc }).order('id', { ascending: true })
    .range((page - 1) * perPage, page * perPage - 1)
  const q = (opts.q ?? '').trim()
  if (q) query = query.ilike('nome', `%${q}%`)
  const { data, count, error } = await query
  if (error) throw new Error(error.message)
  const baralhos = (data ?? []) as Baralho[]
  // Contagem de cartões ativos por baralho (só os da página — barato).
  const ids = baralhos.map((b) => b.id)
  let cartoesPorBaralho = new Map<string, number>()
  if (ids.length) {
    const { data: cards } = await svc.from(T_CARD).select('baralho_id').eq('tenant_id', tenantId).eq('ativo', true).in('baralho_id', ids)
    cartoesPorBaralho = tally(cards as any)
  }
  return {
    rows: baralhos.map((b) => ({ ...b, cartoes: cartoesPorBaralho.get(b.id) ?? 0 })),
    total: count ?? 0,
  }
}

/** Baralho + cartões + grupos + contagens (cartões/alunos usando). null se não existe no tenant. */
export async function getBaralho(svc: SupabaseClient, tenantId: string, id: string): Promise<BaralhoDetalhe | null> {
  const { data: b, error } = await svc.from(T_BARALHO).select(B_COLS).eq('tenant_id', tenantId).eq('id', id).eq('deletado', false).maybeSingle()
  if (error) throw new Error(error.message)
  if (!b) return null
  const cartoes = await listarCartoesBaralho(svc, tenantId, id)
  let grupoIds: string[] = []
  try {
    const { data: g } = await svc.from(T_BGRUPO).select('grupo_id').eq('tenant_id', tenantId).eq('baralho_id', id)
    grupoIds = (g ?? []).map((r: any) => r.grupo_id).filter(Boolean)
  } catch { /* tabela de grupos ausente → sem grupos */ }
  // Alunos usando = estudantes distintos com alguma revisão nos cartões do baralho (tolerante).
  let alunosUsando = 0
  try {
    const cardIds = cartoes.map((c) => c.id)
    if (cardIds.length) {
      const { data: revs } = await svc.from(T_REV).select('estudante_id').eq('tenant_id', tenantId).in('flashcard_id', cardIds)
      alunosUsando = new Set((revs ?? []).map((r: any) => r.estudante_id)).size
    }
  } catch { /* sem revisões */ }
  return { ...(b as Baralho), cartoes, grupoIds, totalCartoes: cartoes.length, alunosUsando }
}

export async function criarBaralho(
  svc: SupabaseClient,
  input: { tenantId: string; nome: string; descricao?: string | null; alcance?: BaralhoAlcance; criadoPor?: string | null },
): Promise<{ id: string } | { erro: string }> {
  const nome = (input.nome ?? '').trim()
  if (!input.tenantId) return { erro: 'tenant obrigatório' }
  if (!nome) return { erro: 'Informe o nome do baralho.' }
  const { data, error } = await svc.from(T_BARALHO).insert({
    tenant_id: input.tenantId, nome, descricao: input.descricao?.trim() || null,
    alcance: input.alcance === 'grupos' ? 'grupos' : 'todos', status: 'rascunho', criado_por: input.criadoPor ?? null,
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao criar' }
  return { id: data.id }
}

export async function atualizarBaralho(
  svc: SupabaseClient, tenantId: string, id: string,
  patch: { nome?: string; descricao?: string | null; alcance?: BaralhoAlcance },
): Promise<{ ok: boolean; erro?: string }> {
  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (patch.nome != null) { const n = patch.nome.trim(); if (!n) return { ok: false, erro: 'Informe o nome do baralho.' }; upd.nome = n }
  if (patch.descricao !== undefined) upd.descricao = patch.descricao?.trim() || null
  if (patch.alcance != null) upd.alcance = patch.alcance === 'grupos' ? 'grupos' : 'todos'
  const { error } = await svc.from(T_BARALHO).update(upd).eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

export async function publicarBaralho(svc: SupabaseClient, tenantId: string, id: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await svc.from(T_BARALHO).update({ status: 'publicado', published_at: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

export async function despublicarBaralho(svc: SupabaseClient, tenantId: string, id: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await svc.from(T_BARALHO).update({ status: 'rascunho', atualizado_em: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Soft delete (Lixeira). simulado_flashcard_baralhos tem deletado/deletado_em/deletado_por. */
export async function excluirBaralho(svc: SupabaseClient, tenantId: string, id: string, deletadoPor?: string | null): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await svc.from(T_BARALHO).update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: deletadoPor ?? null }).eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

export async function duplicarBaralho(svc: SupabaseClient, tenantId: string, id: string, criadoPor?: string | null): Promise<{ id: string } | { erro: string }> {
  const origem = await getBaralho(svc, tenantId, id)
  if (!origem) return { erro: 'Baralho não encontrado.' }
  const novo = await criarBaralho(svc, { tenantId, nome: `${origem.nome} (cópia)`, descricao: origem.descricao, alcance: origem.alcance, criadoPor })
  if ('erro' in novo) return novo
  if (origem.cartoes.length) {
    const rows = origem.cartoes.map((c) => ({
      tenant_id: tenantId, baralho_id: novo.id, documento_id: null,
      frente: c.frente, verso: c.verso, fonte: c.fonte, disciplina: c.disciplina, ordem: c.ordem, ativo: c.ativo, criado_por: criadoPor ?? null,
    }))
    await svc.from(T_CARD).insert(rows)
  }
  return { id: novo.id }
}

/** Substitui os grupos de alcance do baralho (quando alcance='grupos'). */
export async function definirBaralhoGrupos(svc: SupabaseClient, tenantId: string, baralhoId: string, grupoIds: string[]): Promise<void> {
  try {
    await svc.from(T_BGRUPO).delete().eq('tenant_id', tenantId).eq('baralho_id', baralhoId)
    const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
    if (ids.length) await svc.from(T_BGRUPO).insert(ids.map((grupo_id) => ({ tenant_id: tenantId, baralho_id: baralhoId, grupo_id })))
  } catch { /* tabela ausente → ignora */ }
}

// ───────────────────────────── Cartões do baralho ─────────────────────────────
export async function listarCartoesBaralho(svc: SupabaseClient, tenantId: string, baralhoId: string): Promise<CartaoBaralho[]> {
  if (!tenantId || !baralhoId) return []
  const rows = await fetchAll<CartaoBaralho>(() => svc.from(T_CARD)
    .select(C_COLS).eq('tenant_id', tenantId).eq('baralho_id', baralhoId)
    .order('ordem', { ascending: true }).order('id', { ascending: true }))
  return rows ?? []
}

export async function criarCartaoBaralho(
  svc: SupabaseClient,
  input: { tenantId: string; baralhoId: string; frente: string; verso: string; fonte?: string | null; disciplina?: string | null; ordem?: number; criadoPor?: string | null },
): Promise<{ id: string } | { erro: string }> {
  const frente = input.frente?.trim(); const verso = input.verso?.trim()
  if (!input.tenantId || !input.baralhoId) return { erro: 'tenant/baralho obrigatórios' }
  if (!frente || !verso) return { erro: 'Frente e verso são obrigatórios.' }
  let ordem = input.ordem
  if (ordem == null) {
    const { data: ult } = await svc.from(T_CARD).select('ordem').eq('tenant_id', input.tenantId).eq('baralho_id', input.baralhoId)
      .order('ordem', { ascending: false }).limit(1).maybeSingle()
    ordem = ((ult?.ordem as number | undefined) ?? -1) + 1
  }
  const { data, error } = await svc.from(T_CARD).insert({
    tenant_id: input.tenantId, baralho_id: input.baralhoId, documento_id: null,
    frente, verso, fonte: input.fonte?.trim() || null, disciplina: input.disciplina?.trim() || null,
    ordem, criado_por: input.criadoPor ?? null,
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao criar' }
  return { id: data.id }
}

export async function atualizarCartaoBaralho(
  svc: SupabaseClient, tenantId: string, id: string,
  patch: { frente?: string; verso?: string; fonte?: string | null; disciplina?: string | null; ordem?: number; ativo?: boolean },
): Promise<{ ok: boolean; erro?: string }> {
  if (!tenantId || !id) return { ok: false, erro: 'parâmetros inválidos' }
  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (patch.frente != null) upd.frente = patch.frente.trim()
  if (patch.verso != null) upd.verso = patch.verso.trim()
  if (patch.fonte !== undefined) upd.fonte = patch.fonte?.trim() || null
  if (patch.disciplina !== undefined) upd.disciplina = patch.disciplina?.trim() || null
  if (patch.ordem != null) upd.ordem = patch.ordem
  if (patch.ativo != null) upd.ativo = patch.ativo
  const { error } = await svc.from(T_CARD).update(upd).eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

// Remover/reordenar são iguais aos do material (tenant + id) — REUSO da lib existente.
export { removerFlashcard as removerCartao, reordenarFlashcards as reordenarCartoes }

// ───────────────────────────── Importação CSV (frente, verso, fonte, disciplina) ─────────────────────────────
export interface LinhaImportCartao { linha: number; frente: string; verso: string; fonte: string | null; disciplina: string | null; ok: boolean; motivo?: string }

/** Parser CSV simples e robusto: detecta delimitador (`,` ou `;`), respeita aspas, 1 linha por cartão. */
export function parseCsvCartoes(texto: string): LinhaImportCartao[] {
  const linhasBrutas = dividirLinhas(texto)
  if (!linhasBrutas.length) return []
  const delim = detectarDelimitador(linhasBrutas[0])
  const matriz = linhasBrutas.map((l) => dividirCampos(l, delim))
  // Cabeçalho: se a 1ª linha tiver "frente"/"verso", usa os nomes; senão assume posicional.
  const header = matriz[0].map((c) => c.trim().toLowerCase())
  const temHeader = header.some((h) => h === 'frente' || h === 'verso' || h === 'pergunta' || h === 'resposta')
  const idx = {
    frente: temHeader ? acharCol(header, ['frente', 'pergunta']) : 0,
    verso: temHeader ? acharCol(header, ['verso', 'resposta']) : 1,
    fonte: temHeader ? acharCol(header, ['fonte', 'fonte (opcional)']) : 2,
    disciplina: temHeader ? acharCol(header, ['disciplina', 'disciplina (opcional)', 'materia', 'matéria']) : 3,
  }
  const corpo = temHeader ? matriz.slice(1) : matriz
  const offset = temHeader ? 2 : 1
  const out: LinhaImportCartao[] = []
  corpo.forEach((campos, i) => {
    if (campos.every((c) => !c.trim())) return // pula linhas vazias
    const frente = (idx.frente >= 0 ? campos[idx.frente] : '')?.trim() ?? ''
    const verso = (idx.verso >= 0 ? campos[idx.verso] : '')?.trim() ?? ''
    const fonte = (idx.fonte >= 0 ? campos[idx.fonte] : '')?.trim() || null
    const disciplina = (idx.disciplina >= 0 ? campos[idx.disciplina] : '')?.trim() || null
    const ok = !!frente && !!verso
    out.push({ linha: i + offset, frente, verso, fonte, disciplina, ok, motivo: ok ? undefined : 'Frente e verso são obrigatórios.' })
  })
  return out
}

function dividirLinhas(texto: string): string[] {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n')
  while (linhas.length && linhas[linhas.length - 1].trim() === '') linhas.pop()
  return linhas
}
function detectarDelimitador(linha: string): string {
  const v = (linha.match(/;/g) ?? []).length
  const c = (linha.match(/,/g) ?? []).length
  return v > c ? ';' : ','
}
function dividirCampos(linha: string, delim: string): string[] {
  const out: string[] = []; let cur = ''; let dentroAspas = false
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]
    if (ch === '"') {
      if (dentroAspas && linha[i + 1] === '"') { cur += '"'; i++ } else dentroAspas = !dentroAspas
    } else if (ch === delim && !dentroAspas) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out
}
function acharCol(header: string[], nomes: string[]): number {
  for (const n of nomes) { const i = header.indexOf(n); if (i >= 0) return i }
  return -1
}

/** Insere os cartões válidos no baralho (ordem após os já existentes). */
export async function importarCartoes(
  svc: SupabaseClient, tenantId: string, baralhoId: string, linhas: LinhaImportCartao[], criadoPor?: string | null,
): Promise<{ inseridos: number; erro?: string }> {
  const validas = (linhas ?? []).filter((l) => l.ok && l.frente && l.verso)
  if (!validas.length) return { inseridos: 0, erro: 'Nenhum cartão válido para importar.' }
  const { data: ult } = await svc.from(T_CARD).select('ordem').eq('tenant_id', tenantId).eq('baralho_id', baralhoId).order('ordem', { ascending: false }).limit(1).maybeSingle()
  let ordem = ((ult?.ordem as number | undefined) ?? -1) + 1
  const rows = validas.map((l) => ({
    tenant_id: tenantId, baralho_id: baralhoId, documento_id: null,
    frente: l.frente.trim(), verso: l.verso.trim(), fonte: l.fonte?.trim() || null, disciplina: l.disciplina?.trim() || null,
    ordem: ordem++, criado_por: criadoPor ?? null,
  }))
  const { error } = await svc.from(T_CARD).insert(rows)
  if (error) return { inseridos: 0, erro: error.message }
  return { inseridos: rows.length }
}
