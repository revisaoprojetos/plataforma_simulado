import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import * as vc from './client'
import { carregarEmpresa } from './dados'
import {
  MAX_TENTATIVAS, chaveSync, diferencaSync, erroDefinitivo, externalRefDe, outraRegraAindaConcede, paraIso,
  proximaTentativaMs, type Desejado, type Existente,
} from './puro'

/**
 * SINCRONIZAÇÃO DE ACESSO (liberação -> video-api). Fonte da verdade = grants/regras da plataforma;
 * `video_matriculas_sync` é fila + estado (1 linha por regra+aluno+curso, UPSERT => idempotente).
 *   - enfileirarSync / enfileirarPorGrant : chamados pelo gancho da liberação (ver docs/video/INTEGRACAO-LIBERACAO.md)
 *   - processarFila                       : worker/cron (claim otimista, backoff exponencial, falha definitiva)
 *   - reconciliarTenant                   : compara grants ativos x fila e enfileira o que falta (autocura)
 * Nada aqui lança para o chamador de liberação: o gancho nunca pode derrubar a concessão de acesso.
 */

type Svc = ReturnType<typeof createAdminClient>
const log = (e: unknown, ctx: string) => console.error(`[video/sync] ${ctx}:`, e instanceof Error ? e.message : e)

const STALE_MS = 10 * 60_000
const CHUNK_UPSERT = 500

// ─────────────────────────────────────────────────────────────────────────────
// Enfileirar
// ─────────────────────────────────────────────────────────────────────────────

export interface PedidoSync {
  tenantId: string
  /** regra de liberação; sem regra (grant manual) usar o produtoId. */
  regraId: string
  estudanteId: string
  acao: 'enroll' | 'revoke'
  inicioEm?: string | null
  fimEm?: string | null
  /** cursos alvo explícitos; senão, os cursos do produto. */
  cursoIds?: string[]
  produtoId?: string | null
}

async function cursosDoProduto(svc: Svc, tenantId: string, produtoId: string): Promise<string[]> {
  const { data } = await svc.from('video_cursos').select('id').eq('tenant_id', tenantId).eq('produto_id', produtoId).limit(50)
  return (data ?? []).map((r: any) => r.id as string)
}

/** Enfileira enroll/revoke (idempotente). Retorna quantas linhas foram (re)enfileiradas. Nunca lança. */
export async function enfileirarSync(p: PedidoSync, svc: Svc = createAdminClient()): Promise<{ enfileirados: number; motivo?: string }> {
  try {
    const empresa = await carregarEmpresa(p.tenantId, svc)
    if (!empresa?.ativo) return { enfileirados: 0, motivo: 'video_nao_habilitado' }
    const todos = p.cursoIds?.length ? p.cursoIds : p.produtoId ? await cursosDoProduto(svc, p.tenantId, p.produtoId) : []
    const cursoIds = todos.slice(0, 80) // teto = 1 chunk de .in()
    if (!cursoIds.length) return { enfileirados: 0, motivo: 'sem_cursos_de_video' }

    const inicio = paraIso(p.inicioEm), fim = paraIso(p.fimEm)
    const { data: atuais } = await svc.from('video_matriculas_sync')
      .select('curso_id, acao, estado, inicio_em, fim_em')
      .eq('tenant_id', p.tenantId).eq('regra_id', p.regraId).eq('estudante_id', p.estudanteId).in('curso_id', cursoIds)
    const porCurso = new Map((atuais ?? []).map((r: any) => [r.curso_id as string, r]))

    const agora = new Date().toISOString()
    const linhas: Record<string, unknown>[] = []
    for (const cursoId of cursoIds) {
      const a: any = porCurso.get(cursoId)
      if (p.acao === 'revoke' && !a) continue // nada a revogar
      if (a && a.acao === p.acao && (a.estado === 'sincronizado' || a.estado === 'pendente' || a.estado === 'processando')
        && (p.acao === 'revoke' || ((a.inicio_em ? +new Date(a.inicio_em) : null) === (inicio ? +new Date(inicio) : null)
          && (a.fim_em ? +new Date(a.fim_em) : null) === (fim ? +new Date(fim) : null)))) continue // já no estado desejado
      linhas.push({
        tenant_id: p.tenantId, regra_id: p.regraId, estudante_id: p.estudanteId, curso_id: cursoId,
        external_ref: externalRefDe(p.regraId, p.estudanteId), acao: p.acao, estado: 'pendente',
        ...(p.acao === 'enroll' ? { inicio_em: inicio, fim_em: fim } : {}),
        tentativas: 0, proxima_tentativa_em: agora, ultimo_erro: null, atualizado_em: agora,
      })
    }
    if (!linhas.length) return { enfileirados: 0, motivo: 'ja_sincronizado' }
    const { error } = await svc.from('video_matriculas_sync').upsert(linhas, { onConflict: 'tenant_id,regra_id,estudante_id,curso_id' })
    if (error) { log(error, 'enfileirarSync/upsert'); return { enfileirados: 0, motivo: 'erro_upsert' } }
    return { enfileirados: linhas.length }
  } catch (e) { log(e, 'enfileirarSync'); return { enfileirados: 0, motivo: 'erro' } }
}

/** Atalho para o gancho da liberação: grant (ativo ou não) => enroll/revoke dos cursos do produto. */
export async function enfileirarPorGrant(g: {
  tenantId: string; estudanteId: string; produtoId: string; regraId?: string | null
  ativo: boolean; inicioEm?: string | null; fimEm?: string | null
}) {
  return enfileirarSync({
    tenantId: g.tenantId, estudanteId: g.estudanteId, produtoId: g.produtoId, regraId: g.regraId ?? g.produtoId,
    acao: g.ativo ? 'enroll' : 'revoke', inicioEm: g.inicioEm ?? null, fimEm: g.fimEm ?? null,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Processar a fila
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumoFila { reclamados: number; sincronizados: number; reagendados: number; falhas: number; ignorados: number }

interface RowSync {
  id: string; tenant_id: string; regra_id: string; estudante_id: string; curso_id: string; external_ref: string
  acao: 'enroll' | 'revoke'; inicio_em: string | null; fim_em: string | null; tentativas: number; enrollment_id: string | null
}
const COLS_SYNC = 'id, tenant_id, regra_id, estudante_id, curso_id, external_ref, acao, inicio_em, fim_em, tentativas, enrollment_id'

async function pool<T>(itens: T[], conc: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(conc, itens.length) }, async () => {
    while (i < itens.length) { const x = itens[i++]; await fn(x) }
  }))
}

export async function processarFila(opts: { tenantId?: string; limite?: number; agora?: Date; concorrencia?: number } = {}): Promise<ResumoFila> {
  const svc = createAdminClient()
  const agora = opts.agora ?? new Date()
  const agoraIso = agora.toISOString()
  const limite = Math.min(Math.max(opts.limite ?? 50, 1), 200)
  const res: ResumoFila = { reclamados: 0, sincronizados: 0, reagendados: 0, falhas: 0, ignorados: 0 }

  // 1) devolve à fila o que ficou "processando" (worker morreu).
  try {
    let q = svc.from('video_matriculas_sync').update({ estado: 'pendente', atualizado_em: agoraIso })
      .eq('estado', 'processando').lt('atualizado_em', new Date(+agora - STALE_MS).toISOString())
    if (opts.tenantId) q = q.eq('tenant_id', opts.tenantId)
    await q
  } catch (e) { log(e, 'reclaim-stale') }

  // 2) candidatos (índice parcial idx_video_sync_fila).
  let q = svc.from('video_matriculas_sync').select('id').eq('estado', 'pendente').lte('proxima_tentativa_em', agoraIso)
    .order('proxima_tentativa_em', { ascending: true }).order('id', { ascending: true }).limit(limite)
  if (opts.tenantId) q = q.eq('tenant_id', opts.tenantId)
  const { data: cand, error } = await q
  if (error) { log(error, 'candidatos'); return res }

  // 3) claim otimista (só um worker fica com cada linha).
  const rows: RowSync[] = []
  for (const c of cand ?? []) {
    const { data } = await svc.from('video_matriculas_sync').update({ estado: 'processando', atualizado_em: agoraIso })
      .eq('id', c.id).eq('estado', 'pendente').select(COLS_SYNC).maybeSingle()
    if (data) rows.push(data as RowSync)
  }
  res.reclamados = rows.length
  if (!rows.length) return res

  const slugs = new Map<string, string | null>()
  const slugDe = async (tenantId: string) => {
    if (!slugs.has(tenantId)) { const e = await carregarEmpresa(tenantId, svc); slugs.set(tenantId, e?.ativo ? e.slug : null) }
    return slugs.get(tenantId) ?? null
  }

  await pool(rows, opts.concorrencia ?? 4, async (row) => {
    try {
      const slug = await slugDe(row.tenant_id)
      if (!slug) { // empresa desligada/removida: devolve à fila com backoff longo (não conta como falha).
        res.ignorados++
        await svc.from('video_matriculas_sync').update({ estado: 'pendente', proxima_tentativa_em: new Date(+agora + 15 * 60_000).toISOString(), ultimo_erro: 'empresa de vídeo inativa', atualizado_em: agoraIso }).eq('id', row.id)
        return
      }
      const r = await processarUm(svc, row, slug, agora)
      if (r === 'ok') res.sincronizados++
    } catch (e) {
      const status = e instanceof vc.VideoApiError ? e.status : null
      const tent = row.tentativas + 1
      const definitivo = erroDefinitivo(status) || tent >= MAX_TENTATIVAS
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400) + (e instanceof vc.VideoApiError ? ` [cid ${e.correlationId}${status ? ` http ${status}` : ''}]` : '')
      await svc.from('video_matriculas_sync').update({
        estado: definitivo ? 'falhou' : 'pendente', tentativas: tent, ultimo_erro: msg,
        proxima_tentativa_em: new Date(+agora + proximaTentativaMs(tent)).toISOString(), atualizado_em: new Date().toISOString(),
      }).eq('id', row.id)
      if (definitivo) res.falhas++; else res.reagendados++
    }
  })

  if (res.sincronizados || res.falhas) {
    await registrarAudit({
      operacao: 'LIBERAR', entidade: 'video_matriculas_sync', atorTipo: 'sistema', tenantId: opts.tenantId ?? rows[0].tenant_id,
      depois: { ...res },
    }).catch(() => {})
  }
  return res
}

async function processarUm(svc: Svc, row: RowSync, slug: string, agora: Date): Promise<'ok'> {
  const { data: curso } = await svc.from('video_cursos').select('course_id').eq('id', row.curso_id).eq('tenant_id', row.tenant_id).maybeSingle()
  if (!curso) throw new vc.VideoApiError('curso de vídeo inexistente', 404, 'local')

  const concluir = async (extra: Record<string, unknown> = {}) => {
    await svc.from('video_matriculas_sync').update({
      estado: 'sincronizado', tentativas: 0, ultimo_erro: null, sincronizado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), ...extra,
    }).eq('id', row.id)
  }

  if (row.acao === 'revoke') {
    // outra regra ainda concede o mesmo curso? então só encerra a linha local (não derruba o acesso no serviço).
    const { data: outras } = await svc.from('video_matriculas_sync').select('acao, estado, fim_em')
      .eq('tenant_id', row.tenant_id).eq('estudante_id', row.estudante_id).eq('curso_id', row.curso_id).neq('id', row.id).limit(50)
    if (outraRegraAindaConcede((outras ?? []).map((o: any) => ({ acao: o.acao, estado: o.estado, fimEm: o.fim_em })), agora)) {
      await concluir(); return 'ok'
    }
    try {
      await vc.revogar(slug, { externalId: row.estudante_id, courseId: curso.course_id })
    } catch (e) {
      if (!(e instanceof vc.VideoApiError && e.status === 404)) throw e // 404 = aluno/matrícula inexistente => já está revogado
    }
    await concluir(); return 'ok'
  }

  // enroll
  if (row.fim_em && +new Date(row.fim_em) <= +agora && !row.enrollment_id) { await concluir(); return 'ok' } // já vencida: nada a conceder
  const { data: est } = await svc.from('simulado_estudantes').select('email, nome').eq('id', row.estudante_id).eq('tenant_id', row.tenant_id).maybeSingle()
  const email = (est?.email as string | undefined)?.trim().toLowerCase()
  if (!email) throw new vc.VideoApiError('estudante sem e-mail', 422, 'local')
  const r = await vc.matricular(slug, {
    email, name: ((est?.nome as string | undefined) || email.split('@')[0]).slice(0, 120), externalId: row.estudante_id, courseId: curso.course_id,
    ...(row.inicio_em ? { startsAt: row.inicio_em } : {}), ...(row.fim_em ? { endsAt: row.fim_em } : {}),
    // 1ª vez: externalRef (idempotência). Renovação (já matriculado): SEM externalRef — com ele o serviço devolve
    // `replayed` e NÃO renova o prazo (ver api.md, "Integração").
    ...(row.enrollment_id ? {} : { externalRef: row.external_ref }),
  })
  await concluir({ enrollment_id: r.enrollmentId })
  return 'ok'
}

async function aplicarDiferenca(svc: Svc, tenantId: string, enroll: Desejado[], revoke: Existente[], agora: Date): Promise<void> {
  const iso = agora.toISOString()
  const mk = (x: { regraId: string; estudanteId: string; cursoId: string }, acao: 'enroll' | 'revoke', d?: Desejado) => ({
    tenant_id: tenantId, regra_id: x.regraId, estudante_id: x.estudanteId, curso_id: x.cursoId, external_ref: externalRefDe(x.regraId, x.estudanteId),
    acao, estado: 'pendente', ...(d ? { inicio_em: paraIso(d.inicioEm), fim_em: paraIso(d.fimEm) } : {}),
    tentativas: 0, proxima_tentativa_em: iso, ultimo_erro: null, atualizado_em: iso,
  })
  const todas = [...enroll.map((d) => mk(d, 'enroll', d)), ...revoke.map((e) => mk(e, 'revoke'))]
  for (let i = 0; i < todas.length; i += CHUNK_UPSERT) {
    const { error } = await svc.from('video_matriculas_sync').upsert(todas.slice(i, i + CHUNK_UPSERT), { onConflict: 'tenant_id,regra_id,estudante_id,curso_id' })
    if (error) { log(error, 'aplicarDiferenca/upsert'); throw error }
  }
}

/**
 * GANCHO ÚNICO da liberação: recalcula, para (aluno, produto), o que os grants pedem x o que a fila tem e enfileira a
 * diferença (enroll/revoke). Chamar ao fim de `reconciliarEstudanteProduto` (engine.ts). Idempotente, barato (3 queries)
 * e NUNCA lança.
 */
export async function sincronizarAlunoProduto(tenantId: string, estudanteId: string, produtoId: string, agora: Date = new Date()): Promise<{ enroll: number; revoke: number }> {
  const zero = { enroll: 0, revoke: 0 }
  try {
    const svc = createAdminClient()
    const empresa = await carregarEmpresa(tenantId, svc)
    if (!empresa?.ativo) return zero
    const cursoIds = (await cursosDoProduto(svc, tenantId, produtoId)).slice(0, 80)
    if (!cursoIds.length) return zero

    const { data: grants } = await svc.from('simulado_access_grants').select('regra_id, status, inicio_em, fim_em')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('produto_id', produtoId).limit(200)
    const desejado: Desejado[] = []
    for (const g of grants ?? []) {
      if (g.status !== 'active' && g.status !== 'scheduled') continue
      if (g.fim_em && +new Date(g.fim_em) <= +agora) continue
      for (const cursoId of cursoIds) desejado.push({ regraId: g.regra_id ?? produtoId, estudanteId, cursoId, inicioEm: g.inicio_em ?? null, fimEm: g.fim_em ?? null })
    }
    const { data: linhas } = await svc.from('video_matriculas_sync').select('regra_id, estudante_id, curso_id, acao, estado, inicio_em, fim_em')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('curso_id', cursoIds).limit(500)
    const existente: Existente[] = (linhas ?? []).map((l: any) => ({ regraId: l.regra_id, estudanteId: l.estudante_id, cursoId: l.curso_id, acao: l.acao, estado: l.estado, inicioEm: l.inicio_em, fimEm: l.fim_em }))
    const dif = diferencaSync(desejado, existente, agora)
    if (!dif.enroll.length && !dif.revoke.length) return zero
    await aplicarDiferenca(svc, tenantId, dif.enroll, dif.revoke, agora)
    return { enroll: dif.enroll.length, revoke: dif.revoke.length }
  } catch (e) { log(e, 'sincronizarAlunoProduto'); return zero }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliação periódica (autocura)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumoReconciliacao { cursos: number; grants: number; enroll: number; revoke: number; aplicado: boolean }

export async function reconciliarTenant(tenantId: string, opts: { dry?: boolean; limite?: number; agora?: Date } = {}): Promise<ResumoReconciliacao> {
  const svc = createAdminClient()
  const agora = opts.agora ?? new Date()
  const dry = opts.dry ?? true
  const limite = opts.limite ?? 2000
  const vazio: ResumoReconciliacao = { cursos: 0, grants: 0, enroll: 0, revoke: 0, aplicado: !dry }

  const empresa = await carregarEmpresa(tenantId, svc)
  if (!empresa?.ativo) return vazio

  const cursos = await fetchAll<{ id: string; produto_id: string }>(() =>
    svc.from('video_cursos').select('id, produto_id').eq('tenant_id', tenantId).not('produto_id', 'is', null).order('id', { ascending: true }))
  if (!cursos.length) return vazio
  const cursosPorProduto = new Map<string, string[]>()
  for (const c of cursos) cursosPorProduto.set(c.produto_id, [...(cursosPorProduto.get(c.produto_id) ?? []), c.id])
  const produtoIds = [...cursosPorProduto.keys()]

  const grants = await fetchAllByIn<any>(produtoIds, (chunk) =>
    svc.from('simulado_access_grants').select('id, estudante_id, produto_id, regra_id, status, inicio_em, fim_em')
      .eq('tenant_id', tenantId).in('status', ['active', 'scheduled']).in('produto_id', chunk).order('id', { ascending: true }))
  const desejado: Desejado[] = []
  for (const g of grants) {
    if (g.fim_em && +new Date(g.fim_em) <= +agora) continue
    for (const cursoId of cursosPorProduto.get(g.produto_id) ?? []) {
      desejado.push({ regraId: g.regra_id ?? g.produto_id, estudanteId: g.estudante_id, cursoId, inicioEm: g.inicio_em ?? null, fimEm: g.fim_em ?? null })
    }
  }

  const cursoIds = cursos.map((c) => c.id)
  const linhas = await fetchAllByIn<any>(cursoIds, (chunk) =>
    svc.from('video_matriculas_sync').select('regra_id, estudante_id, curso_id, acao, estado, inicio_em, fim_em')
      .eq('tenant_id', tenantId).in('curso_id', chunk).order('id', { ascending: true }))
  const existente: Existente[] = linhas.map((l) => ({
    regraId: l.regra_id, estudanteId: l.estudante_id, cursoId: l.curso_id, acao: l.acao, estado: l.estado, inicioEm: l.inicio_em, fimEm: l.fim_em,
  }))

  const dif = diferencaSync(desejado, existente, agora)
  const enroll = dif.enroll.slice(0, limite), revoke = dif.revoke.slice(0, Math.max(0, limite - enroll.length))
  const res: ResumoReconciliacao = { cursos: cursos.length, grants: grants.length, enroll: enroll.length, revoke: revoke.length, aplicado: !dry }
  if (dry || (!enroll.length && !revoke.length)) return res

  await aplicarDiferenca(svc, tenantId, enroll, revoke, agora)
  await registrarAudit({ operacao: 'RECORRIGIR', entidade: 'video_matriculas_sync', atorTipo: 'sistema', tenantId, depois: { ...res } }).catch(() => {})
  return res
}

/** Contagens da fila (painel/diagnóstico). */
export async function estatisticasFila(tenantId?: string): Promise<Record<string, number>> {
  const svc = createAdminClient()
  const out: Record<string, number> = {}
  for (const estado of ['pendente', 'processando', 'sincronizado', 'falhou'] as const) {
    let q = svc.from('video_matriculas_sync').select('id', { count: 'exact', head: true }).eq('estado', estado)
    if (tenantId) q = q.eq('tenant_id', tenantId)
    const { count } = await q
    out[estado] = count ?? 0
  }
  return out
}

export { chaveSync }
