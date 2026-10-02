'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { criarPastaFolder } from '@/app/admin/banco-questoes/actions'
import { hospedarAudioBase64 } from '@/lib/storage/hospedar-base64'
import type { DesafioJogo } from '@/lib/jurisprudencia/conteudo'

/**
 * Admin do Desafio de Jurisprudência (JurisClub). O desafio é uma PASTA
 * (simulado_pastas, folder_area='jurisprudencia'); todo o conteúdo do jogo mora no
 * jsonb `desafio_jogo` = { config, materias, final, dias, imagens }. Cada ação faz MERGE
 * nesse jsonb (preserva as demais chaves).
 */

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Lê o desafio_jogo atual da pasta (p/ merge). Retorna {} se vazio; null se a pasta não é válida. */
async function lerJogoParaMerge(
  svc: ReturnType<typeof createAdminClient>,
  tenantId: string,
  id: string,
): Promise<DesafioJogo | null> {
  const { data } = await svc
    .from('simulado_pastas')
    .select('desafio_jogo, folder_area')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!data || (data as any).folder_area !== 'jurisprudencia') return null
  const dj = (data as any).desafio_jogo
  return dj && typeof dj === 'object' ? (dj as DesafioJogo) : {}
}

/** Grava o desafio_jogo mesclado + audita + revalida. */
async function salvarMerge(
  tenantId: string,
  atorId: string | null,
  id: string,
  patch: Partial<DesafioJogo>,
): Promise<{ ok: boolean; error?: string }> {
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const merged: DesafioJogo = { ...atual, ...patch }
  const { error } = await svc
    .from('simulado_pastas')
    .update({ desafio_jogo: merged })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('folder_area', 'jurisprudencia')
  if (error) return { ok: false, error: /desafio_jogo|column|schema cache/i.test(error.message) ? 'Aplique a migração 20260929000005 (desafio_jogo).' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { desafio_jogo: Object.keys(patch) }, atorId, tenantId })
  revalidatePath('/admin/jurisprudencia')
  return { ok: true }
}

export interface DesafioListagem { id: string; nome: string; imagens: Record<string, any> }

/** Lista os desafios (pastas jurisprudencia) do tenant. */
export async function listarDesafios(): Promise<DesafioListagem[]> {
  const g = await guard('leitura:view'); if (!g.ok) return []
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_pastas')
    .select('id, nome, desafio_jogo')
    .eq('tenant_id', g.tenantId)
    .eq('folder_area', 'jurisprudencia')
    .eq('is_folder', true)
    .order('nome', { ascending: true })
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    nome: p.nome,
    imagens: (p.desafio_jogo && typeof p.desafio_jogo === 'object' ? (p.desafio_jogo.imagens ?? {}) : {}) as Record<string, any>,
  }))
}

/** Cria um novo desafio (pasta jurisprudencia) — reusa criarPastaFolder. */
export async function criarDesafio(nome: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const r = await criarPastaFolder(nome, null, 'jurisprudencia')
  if (r.ok) revalidatePath('/admin/jurisprudencia')
  return r
}

/** Lê o conteúdo completo do desafio p/ o editor admin. */
export async function lerDesafio(id: string): Promise<{ ok: boolean; desafio?: Required<DesafioJogo>; error?: string }> {
  const g = await guard('leitura:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dj = await lerJogoParaMerge(svc, g.tenantId, id)
  if (dj === null) return { ok: false, error: 'Desafio não encontrado.' }
  return {
    ok: true,
    desafio: {
      config: dj.config ?? {},
      materias: Array.isArray(dj.materias) ? dj.materias : [],
      final: dj.final ?? null,
      dias: dj.dias && typeof dj.dias === 'object' ? dj.dias : {},
      imagens: dj.imagens && typeof dj.imagens === 'object' ? dj.imagens : {},
      aparencia: dj.aparencia && typeof dj.aparencia === 'object' ? dj.aparencia : {},
    } as Required<DesafioJogo>,
  }
}

/** Salva a config do jogo (liberação, vidas, tempo, pontos, storageKey…). */
export async function salvarConfigDesafio(id: string, config: any): Promise<{ ok: boolean; error?: string; musicaFundo?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const cfg = config && typeof config === 'object' ? { ...config } : {}
  // Música de fundo importada (data:audio base64) → sobe pro storage (bucket pdfs aceita áudio) e guarda
  // só a URL (não incha o banco). Se nenhum bucket aceitar, mantém base64 (toca embutido).
  if (typeof cfg.musicaFundo === 'string' && cfg.musicaFundo.startsWith('data:audio')) {
    cfg.musicaFundo = (await hospedarAudioBase64(cfg.musicaFundo, createAdminClient(), { tenantId: g.tenantId, criadoPor: g.atorId })) ?? ''
  }
  const r = await salvarMerge(g.tenantId, g.atorId, id, { config: cfg })
  return r.ok ? { ...r, musicaFundo: cfg.musicaFundo ?? '' } : r
}

/** Salva as matérias + o selo final. */
export async function salvarMateriasDesafio(id: string, materias: any[], final: any): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  return salvarMerge(g.tenantId, g.atorId, id, { materias: Array.isArray(materias) ? materias : [], final: final ?? null })
}

// Estados de publicação de um dia (espelha o modelo da Leitura/Lei Seca).
export type DiaEstado = 'publicada' | 'visualizavel' | 'rascunho'
type DiaPub = { estado?: DiaEstado; publicarEm?: string | null }
type DiaJogo = { titulo?: string; teses?: any[]; materia?: string | null; ordem?: number; pub?: DiaPub }

const diasObj = (atual: DesafioJogo): Record<string, DiaJogo> => ({ ...(atual.dias && typeof atual.dias === 'object' ? atual.dias : {}) }) as any
// Ordena as chaves de dias por .ordem (fallback: chave numérica) — a ordem de exibição.
function ordenarChaves(dias: Record<string, DiaJogo>): string[] {
  return Object.keys(dias).sort((a, b) => ((dias[a]?.ordem ?? Number(a)) - (dias[b]?.ordem ?? Number(b))) || (Number(a) - Number(b)))
}

/** Salva um dia (título + teses + matéria). PRESERVA ordem/pub existentes. numeroDia é a chave em `dias`. */
export async function salvarDiaDesafio(
  id: string,
  numeroDia: number | string,
  dia: { titulo: string; teses: any[]; materia?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const chave = String(Number(numeroDia))
  const dias = diasObj(atual)
  const prev = dias[chave] ?? {}
  dias[chave] = {
    ...prev,
    titulo: dia?.titulo ?? '',
    teses: Array.isArray(dia?.teses) ? dia.teses : [],
    materia: dia?.materia !== undefined ? dia.materia : (prev.materia ?? null),
  }
  return salvarMerge(g.tenantId, g.atorId, id, { dias })
}

/** Cria um novo dia (próximo slot livre; cap de 15 por causa do mapa do labirinto). Começa em rascunho. */
export async function criarDiaDesafio(id: string): Promise<{ ok: boolean; error?: string; chave?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const dias = diasObj(atual)
  const keys = Object.keys(dias).map(Number).filter((k) => !isNaN(k))
  if (keys.length >= 15) return { ok: false, error: 'Máximo de 15 dias (limite do mapa do jogo).' }
  const chave = String((keys.length ? Math.max(...keys) : 0) + 1)
  dias[chave] = { titulo: '', teses: [], materia: null, ordem: keys.length, pub: { estado: 'rascunho', publicarEm: null } }
  const r = await salvarMerge(g.tenantId, g.atorId, id, { dias })
  return r.ok ? { ok: true, chave } : r
}

/** Exclui um dia (remove a chave). Reindexa `ordem` dos restantes; a chave estável NÃO é reusada. */
export async function excluirDiaDesafio(id: string, numeroDia: number | string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const dias = diasObj(atual)
  const chave = String(Number(numeroDia))
  if (!(chave in dias)) return { ok: false, error: 'Dia não encontrado.' }
  delete dias[chave]
  ordenarChaves(dias).forEach((k, i) => { dias[k] = { ...dias[k], ordem: i } })
  return salvarMerge(g.tenantId, g.atorId, id, { dias })
}

/** Reordena os dias: `chaves` na nova ordem → grava `ordem` por índice (chaves estáveis preservam o progresso). */
export async function reordenarDiasDesafio(id: string, chaves: (number | string)[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const dias = diasObj(atual)
  chaves.map(String).forEach((k, i) => { if (dias[k]) dias[k] = { ...dias[k], ordem: i } })
  return salvarMerge(g.tenantId, g.atorId, id, { dias })
}

/** Define a publicação (estado/agendamento) de um ou vários dias de uma vez. */
export async function definirPublicacaoDiasDesafio(
  id: string,
  numerosDia: (number | string)[],
  patch: { estado: DiaEstado; publicarEm?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const dias = diasObj(atual)
  const pub: DiaPub = { estado: patch.estado, publicarEm: patch.publicarEm ?? null }
  for (const n of numerosDia.map(String)) if (dias[n]) dias[n] = { ...dias[n], pub }
  return salvarMerge(g.tenantId, g.atorId, id, { dias })
}

/** Salva as imagens anexadas (ticket, capa…) — base64/URL por chave. */
export async function salvarImagensDesafio(id: string, imagens: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  // MESCLA com as imagens já salvas (ticket/capa vêm da aba Config; selos/personagens da aba Medalhas)
  // para que uma aba não apague as chaves da outra.
  const svc = createAdminClient()
  const atual = await lerJogoParaMerge(svc, g.tenantId, id)
  if (atual === null) return { ok: false, error: 'Desafio não encontrado.' }
  const base = atual.imagens && typeof atual.imagens === 'object' ? atual.imagens : {}
  const mescladas = { ...base, ...(imagens && typeof imagens === 'object' ? imagens : {}) }
  return salvarMerge(g.tenantId, g.atorId, id, { imagens: mescladas })
}

/** Salva a APARÊNCIA (cores/opções) — o bootstrap injeta as CSS vars no jogo (recolorir sem tocar no motor). */
export async function salvarAparenciaDesafio(id: string, aparencia: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  return salvarMerge(g.tenantId, g.atorId, id, { aparencia: aparencia && typeof aparencia === 'object' ? aparencia : {} })
}
