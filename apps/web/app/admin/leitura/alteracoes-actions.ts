'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { diffDocumentos, reverterBlocoHtml } from '@/lib/leitura/diff'
import { salvarConteudoHtml } from '@/app/admin/leitura/upload-actions'
import type { AncoraBloco, DiffDoc, VersaoInfo } from '@/lib/leitura/diff-tipos'

async function guard() {
  if (!(await checkPermission('leitura:view'))) return { ok: false as const, error: 'Sem permissão.' }
  const a = await getCurrentAccess()
  if (!a.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: a.tenantId }
}

/** Todas as versões do conteúdo do documento (para os seletores antes/depois). */
export async function listarVersoesDocumento(
  documentoId: string,
): Promise<{ ok: boolean; versoes?: VersaoInfo[]; publicada?: number; rascunho?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: doc } = await svc
    .from('simulado_documentos')
    .select('versao, versao_publicada, versao_rascunho')
    .eq('id', documentoId)
    .eq('tenant_id', g.tenantId)
    .maybeSingle()
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const pub = (doc as any).versao_publicada ?? (doc as any).versao ?? 1
  const rasc = (doc as any).versao_rascunho ?? pub
  const { data: conts } = await svc
    .from('simulado_documento_conteudos')
    .select('versao, estado, publicado_em')
    .eq('documento_id', documentoId)
    .eq('tenant_id', g.tenantId)
    .order('versao', { ascending: false })
  // Nome de cada versão = a descrição informada no relatório da atualização (se houver).
  const { data: ups } = await svc
    .from('simulado_lei_atualizacoes')
    .select('versao, descricao')
    .eq('documento_id', documentoId)
    .eq('tenant_id', g.tenantId)
  const nomePorV = new Map<number, string>()
  for (const u of (ups ?? []) as any[]) if (u.descricao) nomePorV.set(u.versao, u.descricao)
  const versoes: VersaoInfo[] = (conts ?? []).map((c: any) => ({
    versao: c.versao,
    estado: c.estado ?? 'publicada',
    publicadoEm: c.publicado_em ?? null,
    atual: c.versao === pub,
    rascunho: c.versao === rasc && rasc > pub,
    nome: nomePorV.get(c.versao) ?? null,
  }))
  return { ok: true, versoes, publicada: pub, rascunho: rasc }
}

/** Diff entre duas versões (HTML já sanitizado no banco). */
export async function carregarDiffDocumento(
  documentoId: string,
  vAntes: number,
  vDepois: number,
): Promise<{ ok: boolean; diff?: DiffDoc; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_documento_conteudos')
    .select('versao, html')
    .eq('documento_id', documentoId)
    .eq('tenant_id', g.tenantId)
    .in('versao', [...new Set([vAntes, vDepois])])
  const porV = new Map<number, string>((data ?? []).map((c: any) => [c.versao, (c.html ?? '') as string]))
  return { ok: true, diff: diffDocumentos(porV.get(vAntes) ?? '', porV.get(vDepois) ?? '') }
}

/** Renomeia uma versão (grava na descrição do relatório da atualização — o nome que aparece na lista). */
export async function renomearVersao(documentoId: string, versao: number, nome: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('leitura:update'))) return { ok: false, error: 'Sem permissão.' }
  const a = await getCurrentAccess()
  if (!a.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const nomeT = (nome ?? '').trim().slice(0, 120)
  const { data: ex } = await svc
    .from('simulado_lei_atualizacoes')
    .select('id')
    .eq('documento_id', documentoId).eq('tenant_id', a.tenantId).eq('versao', versao)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle()
  if (ex) {
    await svc.from('simulado_lei_atualizacoes').update({ descricao: nomeT || null }).eq('id', (ex as any).id)
  } else {
    await svc.from('simulado_lei_atualizacoes').insert({ tenant_id: a.tenantId, documento_id: documentoId, versao, tipo: 'correcao_editorial', descricao: nomeT || null })
  }
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true }
}

const RESUMO_ZERO = { mod: 0, add: 0, rem: 0, igual: 0 }

/**
 * Diff PADRÃO da aba Alterações: compara a última versão com a versão anterior mais recente que
 * REALMENTE difere (pula versões idênticas — ex.: republicações sem mudança de texto). Assim a
 * barra sempre mostra a última alteração de verdade, em vez de um "nada mudou" enganoso.
 */
export async function carregarDiffPadrao(
  documentoId: string,
): Promise<{ ok: boolean; vAntes?: number; vDepois?: number; diff?: DiffDoc; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_documento_conteudos')
    .select('versao, html')
    .eq('documento_id', documentoId)
    .eq('tenant_id', g.tenantId)
    .order('versao', { ascending: false })
  const rows = (data ?? []) as { versao: number; html: string | null }[]
  if (rows.length === 0) return { ok: true, vAntes: 1, vDepois: 1, diff: { blocos: [], resumo: RESUMO_ZERO } }
  const dep = rows[0].versao
  const htmlDep = rows[0].html ?? ''
  if (rows.length === 1) return { ok: true, vAntes: dep, vDepois: dep, diff: { blocos: [], resumo: RESUMO_ZERO } }
  // Fallback: versão imediatamente anterior. Depois procura (até 12 atrás) a 1ª que difere.
  let vAntes = rows[1].versao
  let diff = diffDocumentos(rows[1].html ?? '', htmlDep)
  for (const r of rows.slice(1, 13)) {
    const d = diffDocumentos(r.html ?? '', htmlDep)
    if (d.resumo.mod + d.resumo.add + d.resumo.rem > 0) { vAntes = r.versao; diff = d; break }
  }
  return { ok: true, vAntes, vDepois: dep, diff }
}

/**
 * Reverte UMA alteração do RASCUNHO ao texto da versão anterior (o aluno nunca vê a mudança, pois
 * ela é desfeita antes de publicar). Só opera quando o "depois" é o rascunho pendente (não mexe em
 * versão já publicada/imutável). Reaproveita salvarConteudoHtml → re-sanitiza e grava no rascunho.
 */
export async function reverterAlteracao(
  documentoId: string,
  vAntes: number,
  vDepois: number,
  anchor: AncoraBloco,
  estado: 'mod' | 'add' | 'rem',
): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('leitura:update'))) return { ok: false, error: 'Sem permissão para editar.' }
  const a = await getCurrentAccess()
  if (!a.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()

  const { data: doc } = await svc
    .from('simulado_documentos')
    .select('versao, versao_publicada, versao_rascunho')
    .eq('id', documentoId)
    .eq('tenant_id', a.tenantId)
    .maybeSingle()
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const pub = (doc as any).versao_publicada ?? (doc as any).versao ?? 1
  const rasc = (doc as any).versao_rascunho ?? pub
  if (!(rasc > pub) || vDepois !== rasc) {
    return { ok: false, error: 'Só dá para reverter alterações do rascunho ainda não publicado.' }
  }

  const { data } = await svc
    .from('simulado_documento_conteudos')
    .select('versao, html')
    .eq('documento_id', documentoId)
    .eq('tenant_id', a.tenantId)
    .in('versao', [...new Set([vAntes, vDepois])])
  const porV = new Map<number, string>((data ?? []).map((c: any) => [c.versao, (c.html ?? '') as string]))
  const novo = reverterBlocoHtml(porV.get(vDepois) ?? '', porV.get(vAntes) ?? '', anchor, estado)
  if (novo == null) return { ok: false, error: 'Não foi possível localizar o trecho para reverter.' }

  const r = await salvarConteudoHtml(documentoId, novo)
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}
