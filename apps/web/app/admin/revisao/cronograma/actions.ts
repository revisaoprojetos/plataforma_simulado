'use server'
import type { ResultadoAcao } from './actions-tipos'

// Cronograma Adaptativo (admin Plataforma Revisão) — regras, disciplinas, versões, sprints e import/export.
// Toda action: checkPermission('cronogramas:update') + service role + tenant/ator da SESSÃO admin + auditoria + revalidate.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { crAlteradas, crDef, crNormalizar, type ValoresRegras } from '@/lib/revisao/cronograma-schema'
import {
  TABELA_AUSENTE, CAMPOS_DISC, lerRegras, semRegrasDoMotor, listarDisciplinasCfg, montarCobertura, exportarConfiguracao, type CampoDisc,
} from '@/lib/revisao/cronograma'
import { lerCfgMetas, salvarCfgMetas } from '@/lib/cronograma/adaptativo/config-metas'
import { TIPOS_BLOQUEAVEIS } from '@/lib/cronograma/adaptativo/params'

const AVISO_MIGRACAO = 'Aplique a migração 20261112050000_revisao_cronograma_duvidas.sql no Supabase.'
const AVISO_TIPOS = 'Para ligar/desligar PDFull, Juris e LegProc por disciplina, aplique a migração 20261113030000_cron_disciplinas_tipos_material.sql (pnpm migracoes aplicar).'
const ROTA = '/admin/revisao/cronograma'
const NOVOS: CampoDisc[] = ['pdfull', 'juris', 'legproc']

async function guard() {
  if (!(await checkPermission('cronogramas:update'))) return null
  const a = await getCurrentAccess()
  if (!a.tenantId) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}
const falha = (e: { message?: string } | null | undefined, fallback: string): ResultadoAcao =>
  ({ ok: false, error: e?.message && TABELA_AUSENTE.test(e.message) ? AVISO_MIGRACAO : e?.message || fallback })

async function gravarRegras(g: { tenantId: string; userId: string | null }, valores: ValoresRegras) {
  const svc = createAdminClient()
  return svc.from('simulado_revisao_cron_regras').upsert(
    { tenant_id: g.tenantId, valores: semRegrasDoMotor(valores), atualizado_em: new Date().toISOString(), atualizado_por: g.userId }, { onConflict: 'tenant_id' })
}

export async function salvarRegrasCronograma(valores: ValoresRegras): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const antes = (await lerRegras(svc, g.tenantId)).valores
  const depois = crNormalizar(valores)
  const { error } = await gravarRegras(g, depois)
  if (error) return falha(error, 'Falha ao salvar as regras.')
  const diff: Record<string, unknown> = {}
  for (const k of Object.keys(depois)) if (JSON.stringify(depois[k]) !== JSON.stringify(antes[k])) diff[k] = { de: antes[k], para: depois[k] }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_revisao_cron_regras', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, antes: { regras: antes }, depois: { regras: depois, alteradas: diff } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}

export async function restaurarRegrasCronograma(): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const antes = (await lerRegras(createAdminClient(), g.tenantId)).valores
  const { error } = await gravarRegras(g, crDef())
  if (error) return falha(error, 'Falha ao restaurar.')
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_revisao_cron_regras', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, antes: { regras: antes }, depois: { restaurado: 'padrao_2_0' } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}

/** Invalida o cache (30 s) dos bloqueios por disciplina lidos pelo motor/aluno. */
async function esquecerCfgCronograma(tenantId: string) {
  const { esquecer } = await import('@/lib/cache/relatorio-cache')
  await esquecer(`crono-metas:discsem:${tenantId}`).catch(() => {})
  await esquecer(`revisao-cron:aulas2:${tenantId}`).catch(() => {})
}

// ───────────── tipos de material bloqueados (global do tenant) ─────────────

/** Bloqueia/libera tipos de material no gerador adaptativo para TODO o tenant. Chaves do motor: pf, fl, qu, lp, jp. Vale em novas gerações e recálculos. */
export async function salvarTiposBloqueadosCronograma(tipos: string[]): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const novos = [...new Set((tipos ?? []).filter((t) => typeof t === 'string' && TIPOS_BLOQUEAVEIS.includes(t)))]
  const svc = createAdminClient()
  const atual = await lerCfgMetas(svc, g.tenantId)
  const { atualizadoEm: _e, atualizadoPor: _p, discSemTipo: _d, ...params } = atual
  const antes = params.tiposBloqueados ?? []
  const r = await salvarCfgMetas(svc, g.tenantId, { ...params, tiposBloqueados: novos }, g.userId)
  if (!r.ok) return { ok: false, error: r.error || 'Falha ao salvar.' }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'cronograma_adaptativo_cfg', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, antes: { tiposBloqueados: antes }, depois: { tiposBloqueados: novos } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}

// ───────────── disciplinas ─────────────

export async function alterarDisciplinaCronograma(nome: string, campo: CampoDisc, valor: boolean): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  if (!CAMPOS_DISC.includes(campo)) return { ok: false, error: 'Campo inválido.' }
  const svc = createAdminClient()
  const { lista, tiposMigrado } = await listarDisciplinasCfg(svc, g.tenantId)
  if (!tiposMigrado && NOVOS.includes(campo)) return { ok: false, error: AVISO_TIPOS }
  const atual = lista.find((d) => d.nome === nome)
  if (!atual) return { ok: false, error: 'Disciplina não encontrada.' }
  const novo = { pdflash: atual.pdflash, pdfight: atual.pdfight, ativa: atual.ativa, ...(tiposMigrado ? { pdfull: atual.pdfull, juris: atual.juris, legproc: atual.legproc } : {}), [campo]: valor }
  const { data: salva, error } = await svc.from('simulado_revisao_cron_disciplinas').upsert(
    { tenant_id: g.tenantId, nome, ...novo, manual: atual.manual, atualizado_em: new Date().toISOString() }, { onConflict: 'tenant_id,nome' }).select('id').single()
  if (error) return falha(error, 'Falha ao salvar a disciplina.')
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_revisao_cron_disciplinas', entidadeId: (salva as { id: string } | null)?.id ?? atual.id, tenantId: g.tenantId, atorId: g.userId,
    antes: { nome, pdflash: atual.pdflash, pdfight: atual.pdfight, pdfull: atual.pdfull, juris: atual.juris, legproc: atual.legproc, ativa: atual.ativa }, depois: { nome, ...novo } }).catch(() => {})
  await esquecerCfgCronograma(g.tenantId)
  revalidatePath(ROTA)
  return { ok: true }
}

/** Ação em massa: liga/desliga PDFlash, PDFight ou "No cronograma" para várias disciplinas de uma vez (1 upsert + 1 auditoria). */
export async function alterarDisciplinasLoteCronograma(nomes: string[], campo: CampoDisc, valor: boolean): Promise<ResultadoAcao & { n?: number }> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  if (!CAMPOS_DISC.includes(campo)) return { ok: false, error: 'Campo inválido.' }
  const alvo = new Set((nomes ?? []).filter((n) => typeof n === 'string').slice(0, 300))
  if (!alvo.size) return { ok: false, error: 'Nenhuma disciplina selecionada.' }
  const svc = createAdminClient()
  const { lista, tiposMigrado } = await listarDisciplinasCfg(svc, g.tenantId)
  if (!tiposMigrado && NOVOS.includes(campo)) return { ok: false, error: AVISO_TIPOS }
  const sel = lista.filter((d) => alvo.has(d.nome))
  if (!sel.length) return { ok: false, error: 'Disciplinas não encontradas.' }
  const agora = new Date().toISOString()
  const linhas = sel.map((d) => ({ tenant_id: g.tenantId, nome: d.nome, pdflash: d.pdflash, pdfight: d.pdfight, ativa: d.ativa, ...(tiposMigrado ? { pdfull: d.pdfull, juris: d.juris, legproc: d.legproc } : {}), manual: d.manual, [campo]: valor, atualizado_em: agora }))
  const { error } = await svc.from('simulado_revisao_cron_disciplinas').upsert(linhas, { onConflict: 'tenant_id,nome' })
  if (error) return falha(error, 'Falha ao salvar as disciplinas.')
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_revisao_cron_disciplinas', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId,
    antes: { disciplinas: sel.map((d) => ({ nome: d.nome, [campo]: d[campo] })) }, depois: { campo, valor, nomes: sel.map((d) => d.nome) } }).catch(() => {})
  await esquecerCfgCronograma(g.tenantId)
  revalidatePath(ROTA)
  return { ok: true, n: sel.length }
}

/** Ação em massa: remove disciplinas criadas aqui (as do catálogo são ignoradas; use "No cronograma" para tirá-las). */
export async function removerDisciplinasLoteCronograma(nomes: string[]): Promise<ResultadoAcao & { n?: number }> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const alvo = (nomes ?? []).filter((n) => typeof n === 'string').slice(0, 300)
  if (!alvo.length) return { ok: false, error: 'Nenhuma disciplina selecionada.' }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_revisao_cron_disciplinas').select('id, nome').eq('tenant_id', g.tenantId).eq('manual', true).in('nome', alvo)
  const ids = ((data ?? []) as Array<{ id: string; nome: string }>)
  if (!ids.length) return { ok: false, error: 'Só disciplinas criadas aqui podem ser removidas. Desligue “No cronograma” para tirar uma disciplina do catálogo.' }
  const { error } = await svc.from('simulado_revisao_cron_disciplinas').delete().eq('tenant_id', g.tenantId).in('id', ids.map((i) => i.id))
  if (error) return falha(error, 'Falha ao remover.')
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_revisao_cron_disciplinas', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, antes: { nomes: ids.map((i) => i.nome) } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true, n: ids.length }
}

export async function adicionarDisciplinaCronograma(nomeBruto: string): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const nome = (nomeBruto ?? '').trim().slice(0, 120)
  if (!nome) return { ok: false, error: 'Informe o nome da disciplina.' }
  const svc = createAdminClient()
  const { lista } = await listarDisciplinasCfg(svc, g.tenantId)
  if (lista.some((d) => d.nome.toLowerCase() === nome.toLowerCase())) return { ok: false, error: 'Essa disciplina já existe.' }
  const { data: nova, error } = await svc.from('simulado_revisao_cron_disciplinas').insert({ tenant_id: g.tenantId, nome, pdflash: true, pdfight: true, ativa: true, manual: true }).select('id').single()
  if (error) return falha(error, 'Falha ao adicionar.')
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_revisao_cron_disciplinas', entidadeId: (nova as { id: string }).id, tenantId: g.tenantId, atorId: g.userId, depois: { nome } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}

export async function removerDisciplinaCronograma(nome: string): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_revisao_cron_disciplinas').select('id, manual').eq('tenant_id', g.tenantId).eq('nome', nome).maybeSingle()
  if (!data || !(data as { manual: boolean }).manual) return { ok: false, error: 'Só disciplinas criadas aqui podem ser removidas. Desligue “No cronograma” para tirar uma disciplina do catálogo.' }
  const { error } = await svc.from('simulado_revisao_cron_disciplinas').delete().eq('tenant_id', g.tenantId).eq('id', (data as { id: string }).id)
  if (error) return falha(error, 'Falha ao remover.')
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_revisao_cron_disciplinas', entidadeId: (data as { id: string }).id, tenantId: g.tenantId, atorId: g.userId, antes: { nome } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}

// ───────────── versões ─────────────

async function snapshotAtual(tenantId: string) {
  const svc = createAdminClient()
  const { valores } = await lerRegras(svc, tenantId)
  const [{ lista }, base] = await Promise.all([listarDisciplinasCfg(svc, tenantId), montarCobertura(svc, tenantId, valores)])
  return {
    regras: valores,
    disciplinas: lista.map((d) => ({ nome: d.nome, pdflash: d.pdflash, pdfight: d.pdfight, pdfull: d.pdfull, juris: d.juris, legproc: d.legproc, ativa: d.ativa, manual: d.manual })),
    aulas: base.linhas.length,
  }
}

export async function salvarVersaoCronograma(): Promise<ResultadoAcao & { numero?: number }> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const s = await snapshotAtual(g.tenantId)
  const { data: ult, error: e0 } = await svc.from('simulado_revisao_cron_versoes').select('numero').eq('tenant_id', g.tenantId).order('numero', { ascending: false }).limit(1)
  if (e0) return falha(e0, 'Falha ao salvar a versão.')
  const numero = ((ult?.[0] as { numero: number } | undefined)?.numero ?? 0) + 1
  const { data: ins, error } = await svc.from('simulado_revisao_cron_versoes').insert({
    tenant_id: g.tenantId, numero, snap: { regras: s.regras, disciplinas: s.disciplinas }, n_alteradas: crAlteradas(s.regras).length, aulas: s.aulas, criado_por: g.userId,
  }).select('id').single()
  if (error) return falha(error, 'Falha ao salvar a versão.')
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_revisao_cron_versoes', entidadeId: (ins as { id: string } | null)?.id ?? null, tenantId: g.tenantId, atorId: g.userId, depois: { numero, alteradas: crAlteradas(s.regras).length, aulas: s.aulas } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true, numero }
}

async function aplicarSnapshot(g: { tenantId: string; userId: string | null }, regras: unknown, disciplinas: unknown): Promise<ResultadoAcao> {
  const svc = createAdminClient()
  const valores = crNormalizar(regras)
  const { error } = await gravarRegras(g, valores)
  if (error) return falha(error, 'Falha ao aplicar as regras.')
  if (Array.isArray(disciplinas)) {
    const { tiposMigrado } = await listarDisciplinasCfg(svc, g.tenantId)
    const agora = new Date().toISOString()
    const linhas = (disciplinas as Array<Record<string, unknown>>)
      .filter((d) => typeof d?.nome === 'string' && (d.nome as string).trim())
      .slice(0, 300)
      .map((d) => ({
        tenant_id: g.tenantId, nome: (d.nome as string).trim().slice(0, 120), pdflash: d.pdflash !== false, pdfight: d.pdfight !== false,
        ativa: d.ativa !== false, manual: d.manual === true, atualizado_em: agora,
        ...(tiposMigrado ? { pdfull: d.pdfull !== false, juris: d.juris !== false, legproc: d.legproc !== false } : {}),
      }))
    if (linhas.length) {
      const r = await svc.from('simulado_revisao_cron_disciplinas').upsert(linhas, { onConflict: 'tenant_id,nome' })
      if (r.error) return falha(r.error, 'Falha ao aplicar as disciplinas.')
      await esquecerCfgCronograma(g.tenantId)
    }
  }
  return { ok: true }
}

export async function carregarVersaoCronograma(id: string): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const { data, error } = await createAdminClient().from('simulado_revisao_cron_versoes').select('numero, snap').eq('tenant_id', g.tenantId).eq('id', id).maybeSingle()
  if (error) return falha(error, 'Falha ao carregar.')
  if (!data) return { ok: false, error: 'Versão não encontrada.' }
  const snap = (data as { snap: { regras?: unknown; disciplinas?: unknown } }).snap ?? {}
  const r = await aplicarSnapshot(g, snap.regras, snap.disciplinas)
  if (!r.ok) return r
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_revisao_cron_regras', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, depois: { carregouVersao: (data as { numero: number }).numero } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}

// ───────────── exportar / importar ─────────────

export async function exportarConfigCronograma(): Promise<{ ok: boolean; error?: string; json?: string }> {
  if (!(await checkPermission('cronogramas:view'))) return { ok: false, error: 'Sem permissão.' }
  const a = await getCurrentAccess()
  if (!a.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  return { ok: true, json: await exportarConfiguracao(createAdminClient(), a.tenantId) }
}

export async function importarConfigCronograma(texto: string): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  let o: { regras?: unknown; disciplinas?: unknown }
  try { o = JSON.parse(texto) } catch { return { ok: false, error: 'Não foi possível ler. Confira se colou o texto inteiro.' } }
  if (!o || typeof o !== 'object' || (!o.regras && !o.disciplinas)) return { ok: false, error: 'O texto não tem regras nem disciplinas.' }
  const antes = (await lerRegras(createAdminClient(), g.tenantId)).valores
  const r = await aplicarSnapshot(g, o.regras ?? antes, o.disciplinas)
  if (!r.ok) return r
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_revisao_cron_regras', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, antes: { regras: antes }, depois: { importado: true } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}

// ───────────── sprints ─────────────

export async function salvarSprintCronograma(input: { id?: string | null; nome: string; dias: number; metas: number; status: string; observacao?: string }): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const nome = (input.nome ?? '').trim().slice(0, 120)
  if (!nome) return { ok: false, error: 'Informe o nome do sprint.' }
  const status = ['rascunho', 'ativo', 'encerrado'].includes(input.status) ? input.status : 'rascunho'
  const reg = {
    nome, status, dias: Math.max(0, Math.min(365, Math.trunc(Number(input.dias) || 0))),
    metas: Math.max(0, Math.min(5000, Math.trunc(Number(input.metas) || 0))), observacao: (input.observacao ?? '').trim().slice(0, 500) || null,
    atualizado_em: new Date().toISOString(),
  }
  const svc = createAdminClient()
  if (input.id) {
    const { error } = await svc.from('simulado_revisao_cron_sprints').update(reg).eq('tenant_id', g.tenantId).eq('id', input.id)
    if (error) return falha(error, 'Falha ao salvar o sprint.')
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_revisao_cron_sprints', entidadeId: input.id, tenantId: g.tenantId, atorId: g.userId, depois: reg }).catch(() => {})
  } else {
    const { data, error } = await svc.from('simulado_revisao_cron_sprints').insert({ ...reg, tenant_id: g.tenantId, criado_por: g.userId }).select('id').single()
    if (error) return falha(error, 'Falha ao criar o sprint.')
    await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_revisao_cron_sprints', entidadeId: (data as { id: string }).id, tenantId: g.tenantId, atorId: g.userId, depois: reg }).catch(() => {})
  }
  revalidatePath(ROTA)
  return { ok: true }
}

export async function statusSprintsLoteCronograma(ids: string[], status: string): Promise<ResultadoAcao & { n?: number }> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  if (!['rascunho', 'ativo', 'encerrado'].includes(status)) return { ok: false, error: 'Situação inválida.' }
  const lista = (ids ?? []).filter((i) => typeof i === 'string').slice(0, 300)
  if (!lista.length) return { ok: false, error: 'Nenhum sprint selecionado.' }
  const { error } = await createAdminClient().from('simulado_revisao_cron_sprints').update({ status, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).in('id', lista)
  if (error) return falha(error, 'Falha ao alterar a situação.')
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_revisao_cron_sprints', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, depois: { ids: lista, status } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true, n: lista.length }
}

export async function excluirSprintsLoteCronograma(ids: string[]): Promise<ResultadoAcao & { n?: number }> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const lista = (ids ?? []).filter((i) => typeof i === 'string').slice(0, 300)
  if (!lista.length) return { ok: false, error: 'Nenhum sprint selecionado.' }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_revisao_cron_sprints').select('id, nome, status, dias, metas').eq('tenant_id', g.tenantId).in('id', lista)
  const { error } = await svc.from('simulado_revisao_cron_sprints').delete().eq('tenant_id', g.tenantId).in('id', lista)
  if (error) return falha(error, 'Falha ao excluir.')
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_revisao_cron_sprints', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, antes: { sprints: data ?? [] } }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true, n: lista.length }
}

export async function excluirSprintCronograma(id: string): Promise<ResultadoAcao> {
  const g = await guard(); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_revisao_cron_sprints').select('nome, status, dias, metas').eq('tenant_id', g.tenantId).eq('id', id).maybeSingle()
  const { error } = await svc.from('simulado_revisao_cron_sprints').delete().eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return falha(error, 'Falha ao excluir.')
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_revisao_cron_sprints', entidadeId: id, tenantId: g.tenantId, atorId: g.userId, antes: (data as Record<string, unknown> | null) ?? null }).catch(() => {})
  revalidatePath(ROTA)
  return { ok: true }
}
