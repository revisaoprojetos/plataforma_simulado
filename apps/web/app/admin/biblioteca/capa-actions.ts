'use server'
import type { AlvoCP, DadosCP, EstadoCP } from './capa-actions-tipos'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import {
  mapaPastas, resolverCapaDoc, resolverPaginaInicialDoc, normalizarPagina, normalizarModo,
  type ModoCP, type PastaCP, type Resolvido,
} from '@/lib/conteudo/capa-pagina'

// CAPA + PÁGINA INICIAL (pasta → documentos, com override por documento). Ver lib/conteudo/capa-pagina.ts.
// Migração: supabase/migrations/20261105010000_biblioteca_capa_pagina_inicial.sql (as ações toleram a ausência).

const MIGRACAO = '20261105010000_biblioteca_capa_pagina_inicial.sql'
const colunaAusente = (msg: string) => /column .* does not exist|schema cache|42703|PGRST204/i.test(msg || '')

const VAZIO: DadosCP = { capaUrl: null, capaModo: 'lote', paginaInicial: null, paginaInicialModo: 'lote' }
const SEM_HERANCA = { capa: { valor: null, origem: null }, pagina: { valor: null, origem: null } } as EstadoCP['herdado']

async function guard(acao: 'view' | 'update') {
  if (!(await checkPermission(acao === 'view' ? 'configuracoes:view' : 'configuracoes:update'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

async function carregarPastas(tenantId: string): Promise<{ pastas: PastaCP[]; migrado: boolean }> {
  const svc = createAdminClient()
  const sel = (cols: string) => () => svc.from('simulado_pastas').select(cols).eq('tenant_id', tenantId).eq('folder_area', 'conteudo').eq('is_folder', true).eq('deletado', false).order('id', { ascending: true })
  try {
    const rows = (await fetchAll<any>(sel('id, nome, pai_id, capa_url, capa_modo, pagina_inicial, pagina_inicial_modo'))) ?? []
    return { pastas: rows as PastaCP[], migrado: true }
  } catch {
    try { return { pastas: ((await fetchAll<any>(sel('id, nome, pai_id'))) ?? []) as PastaCP[], migrado: false } }
    catch { return { pastas: [], migrado: false } }
  }
}

/** Valores atuais + o que o item herda da árvore (p/ o diálogo mostrar "herdada de …"). */
export async function obterCapaPagina(alvo: AlvoCP): Promise<EstadoCP> {
  const g = await guard('view')
  const base: EstadoCP = { ok: false, migrado: true, titulo: '', atual: { ...VAZIO }, herdado: SEM_HERANCA }
  if (!g.ok) return { ...base, error: g.error }
  const svc = createAdminClient()
  const { pastas, migrado } = await carregarPastas(g.tenantId)
  const porId = mapaPastas(pastas)

  if (alvo.tipo === 'pasta') {
    const p = porId.get(alvo.id)
    if (!p) return { ...base, error: 'Pasta não encontrada.' }
    // alcance do "lote": documentos nesta pasta e em todas as subpastas (contagem leve)
    const ids = new Set<string>([p.id]); let mudou = true
    while (mudou) { mudou = false; for (const q of pastas) if (q.pai_id && ids.has(q.pai_id) && !ids.has(q.id)) { ids.add(q.id); mudou = true } }
    let alcance = 0
    try {
      const { count } = await svc.from('simulado_conteudo_documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('deletado', false).in('pasta_id', [...ids])
      alcance = count ?? 0
    } catch { /* best-effort */ }
    return {
      ok: true, migrado, titulo: p.nome ?? 'Pasta', alcance,
      atual: { capaUrl: p.capa_url ?? null, capaModo: normalizarModo(p.capa_modo), paginaInicial: p.pagina_inicial ?? null, paginaInicialModo: normalizarModo(p.pagina_inicial_modo) },
      herdado: { capa: resolverCapaDoc(null, p.pai_id, porId), pagina: resolverPaginaInicialDoc(null, p.pai_id, porId) },
    }
  }

  // documento (colunas novas podem não existir → cai no legado)
  let doc: any = null
  const r1 = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, capa_url, pagina_inicial').eq('tenant_id', g.tenantId).eq('id', alvo.id).maybeSingle()
  if (r1.error && colunaAusente(r1.error.message)) {
    const r2 = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id').eq('tenant_id', g.tenantId).eq('id', alvo.id).maybeSingle()
    doc = r2.data
    return { ...base, ok: !!doc, migrado: false, titulo: doc?.titulo ?? '', error: doc ? undefined : 'Documento não encontrado.', herdado: doc ? { capa: resolverCapaDoc(null, doc.pasta_id, porId), pagina: resolverPaginaInicialDoc(null, doc.pasta_id, porId) } : SEM_HERANCA }
  }
  doc = r1.data
  if (!doc) return { ...base, error: 'Documento não encontrado.' }
  return {
    ok: true, migrado, titulo: doc.titulo ?? 'Documento',
    atual: { capaUrl: doc.capa_url ?? null, capaModo: 'lote', paginaInicial: doc.pagina_inicial ?? null, paginaInicialModo: 'lote' },
    herdado: { capa: resolverCapaDoc(null, doc.pasta_id, porId), pagina: resolverPaginaInicialDoc(null, doc.pasta_id, porId) },
  }
}

/** Salva capa/página (pasta ou documento). `capaUrl: null` remove; `paginaInicial: null` remove. */
export async function salvarCapaPagina(alvo: AlvoCP, dados: Partial<DadosCP>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const svc = createAdminClient()

  const patch: Record<string, unknown> = {}
  if (dados.capaUrl !== undefined) {
    const u = (dados.capaUrl ?? '').toString().trim()
    // só URL http(s) ou caminho do próprio app (a imagem sobe pelo CampoImagem → /api/admin/imagem → URL pública)
    if (u && !/^(https?:\/\/|\/)/i.test(u)) return { ok: false, error: 'URL de capa inválida.' }
    patch.capa_url = u || null
  }
  if (dados.paginaInicial !== undefined) patch.pagina_inicial = normalizarPagina(dados.paginaInicial)
  if (alvo.tipo === 'pasta') {
    if (dados.capaModo !== undefined) patch.capa_modo = normalizarModo(dados.capaModo)
    if (dados.paginaInicialModo !== undefined) patch.pagina_inicial_modo = normalizarModo(dados.paginaInicialModo)
  }
  if (!Object.keys(patch).length) return { ok: true }

  const tabela = alvo.tipo === 'pasta' ? 'simulado_pastas' : 'simulado_conteudo_documentos'
  const { data: antes } = await svc.from(tabela).select('*').eq('tenant_id', g.tenantId).eq('id', alvo.id).maybeSingle()
  if (!antes) return { ok: false, error: alvo.tipo === 'pasta' ? 'Pasta não encontrada.' : 'Documento não encontrado.' }
  const { error } = await svc.from(tabela).update(patch).eq('tenant_id', g.tenantId).eq('id', alvo.id)
  if (error) return { ok: false, error: colunaAusente(error.message) ? `Aplique a migração ${MIGRACAO} no Supabase para usar capa e página inicial.` : error.message }

  registrarAudit({
    operacao: 'UPDATE', entidade: tabela, entidadeId: alvo.id, tenantId: g.tenantId, atorId: g.atorId,
    antes: { capa_url: (antes as any).capa_url ?? null, capa_modo: (antes as any).capa_modo ?? null, pagina_inicial: (antes as any).pagina_inicial ?? null, pagina_inicial_modo: (antes as any).pagina_inicial_modo ?? null },
    depois: patch,
  } as any).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}
