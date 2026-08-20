'use server'

/**
 * Metas de um cronograma: leitura da grade inteira, correção avulsa e diagnóstico.
 *
 * "Corrigir uma linha sem reimportar as 800" é requisito explícito da spec §8 — por isso
 * existe `atualizarMeta` além do importador.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { chaveLink } from '@/lib/cronograma/formato-meta'
import type { MetaFonte, TipoMeta } from '@/lib/cronograma/tipos'

export type CronogramaDetalhe = {
  id: string
  slug: string
  nome: string
  carga_horaria: number
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
  categoria: string | null
  status: 'rascunho' | 'liberado'
  acesso_gratuito: boolean
}

/** Problemas de DADO que a equipe precisa ver — não são erros de uso. */
export type Diagnostico = {
  semanasComMetasEmRevisao: number[]
  metasForaDosDias: number
  metasForaDasSemanas: number
  questoesSemLink: { disciplina: string; aula: string }[]
  duracoesDivergentes: { semana: number; tipo: string }[]
  semanasVazias: number[]
}

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/**
 * Carrega o cronograma e TODAS as suas metas.
 *
 * `fetchAll` é obrigatório aqui: o maior cronograma real tem 1.142 metas, e um
 * `.select()` cru devolveria 1.000 e truncaria em silêncio — o cronograma chegaria ao
 * aluno faltando as últimas semanas, sem erro nenhum.
 */
export async function carregarDetalhe(id: string): Promise<{
  ok: boolean
  cronograma?: CronogramaDetalhe
  metas?: MetaFonte[]
  diagnostico?: Diagnostico
  error?: string
}> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const { data: c, error } = await svc
    .from('simulado_cronogramas')
    .select('id, slug, nome, carga_horaria, total_semanas, dias_curso, dias_nome, semanas_revisao, categoria, status, acesso_gratuito')
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .eq('deletado', false)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!c) return { ok: false, error: 'Cronograma não encontrado.' }

  const metas = await fetchAll<MetaFonte>(() =>
    svc
      .from('simulado_cronograma_metas')
      .select('id, semana, dia, tipo, disciplina, aula, conteudo, duracao, ordem, simulado_id, simulado_externo_nome, simulado_externo_url')
      .eq('tenant_id', g.tenantId)
      .eq('cronograma_id', id)
      .order('semana')
      .order('dia')
      .order('ordem')
      .order('id') as any,
  )

  // Links do tenant, para apontar quais metas de questões estão órfãs (spec §8).
  const links = await fetchAll<{ disciplina: string; aula: string }>(() =>
    svc.from('simulado_cronograma_links').select('disciplina, aula').eq('tenant_id', g.tenantId).order('disciplina').order('aula') as any,
  )
  const comLink = new Set(links.map((l) => chaveLink(l.disciplina, l.aula)).filter(Boolean) as string[])

  const cron = {
    ...(c as any),
    carga_horaria: Number((c as any).carga_horaria),
    dias_curso: (c as any).dias_curso ?? [],
    dias_nome: (c as any).dias_nome ?? [],
    semanas_revisao: (c as any).semanas_revisao ?? [],
  } as CronogramaDetalhe

  return { ok: true, cronograma: cron, metas, diagnostico: diagnosticar(cron, metas, comLink) }
}

/** Roda as invariantes da spec §8 sobre a grade carregada. */
function diagnosticar(c: CronogramaDetalhe, metas: MetaFonte[], comLink: Set<string>): Diagnostico {
  const revisao = new Set(c.semanas_revisao)
  const semanasComMetasEmRevisao = new Set<number>()
  const comMetas = new Set<number>()
  let metasForaDosDias = 0
  let metasForaDasSemanas = 0
  const semLink = new Map<string, { disciplina: string; aula: string }>()
  const duracaoVista = new Map<string, string>()
  const divergentes = new Map<string, { semana: number; tipo: string }>()

  for (const m of metas) {
    comMetas.add(m.semana)
    if (revisao.has(m.semana)) semanasComMetasEmRevisao.add(m.semana)
    if (m.dia >= c.dias_curso.length || m.dia < 0) metasForaDosDias++
    if (m.semana < 1 || m.semana > c.total_semanas) metasForaDasSemanas++

    if (m.tipo === 'quest' && m.aula) {
      const k = chaveLink(m.disciplina, m.aula)
      if (k && !comLink.has(k)) semLink.set(k, { disciplina: m.disciplina, aula: m.aula })
    }

    // R21 — só a PRIMEIRA duração de cada (semana, tipo) vai para o DOCX. Onde houver
    // divergência, alguma some do documento; a equipe precisa saber para padronizar.
    const d = (m.duracao ?? '').trim()
    if (d) {
      const k = `${m.semana}|${m.tipo}`
      const anterior = duracaoVista.get(k)
      if (anterior === undefined) duracaoVista.set(k, d)
      else if (anterior !== d) divergentes.set(k, { semana: m.semana, tipo: m.tipo })
    }
  }

  const semanasVazias: number[] = []
  for (let s = 1; s <= c.total_semanas; s++) if (!comMetas.has(s) && !revisao.has(s)) semanasVazias.push(s)

  return {
    semanasComMetasEmRevisao: [...semanasComMetasEmRevisao].sort((a, b) => a - b),
    metasForaDosDias,
    metasForaDasSemanas,
    questoesSemLink: [...semLink.values()].slice(0, 50),
    duracoesDivergentes: [...divergentes.values()].sort((a, b) => a.semana - b.semana).slice(0, 50),
    semanasVazias: semanasVazias.slice(0, 50),
  }
}

export type EntradaMeta = {
  semana: number
  dia: number
  tipo: TipoMeta
  disciplina: string
  aula: string | null
  conteudo: string | null
  duracao: string | null
  ordem: number
  simulado_id: string | null
  simulado_externo_nome: string | null
  simulado_externo_url: string | null
}

/** Valida uma meta contra a grade do cronograma (as mesmas regras do banco, antes de ir). */
function validarMeta(e: EntradaMeta, c: { total_semanas: number; dias_curso: number[] }): string | null {
  if (!Number.isInteger(e.semana) || e.semana < 1 || e.semana > c.total_semanas) {
    return `Semana precisa estar entre 1 e ${c.total_semanas}.`
  }
  if (!Number.isInteger(e.dia) || e.dia < 0 || e.dia >= c.dias_curso.length) {
    return `Dia precisa ser um índice entre 0 e ${c.dias_curso.length - 1} (é a posição dentro dos dias de curso, não o dia da semana).`
  }
  if (!e.disciplina.trim()) return 'Informe a disciplina.'
  if (e.tipo === 'simulado' && !e.simulado_id && !(e.simulado_externo_nome && e.simulado_externo_url)) {
    return 'Meta de simulado precisa apontar um simulado da plataforma ou informar nome e link de um externo.'
  }
  return null
}

async function cronogramaDoTenant(svc: any, tenantId: string, cronogramaId: string) {
  const { data } = await svc
    .from('simulado_cronogramas')
    .select('id, nome, total_semanas, dias_curso')
    .eq('id', cronogramaId)
    .eq('tenant_id', tenantId)
    .eq('deletado', false)
    .maybeSingle()
  return data as { id: string; nome: string; total_semanas: number; dias_curso: number[] } | null
}

export async function criarMeta(cronogramaId: string, e: EntradaMeta): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const c = await cronogramaDoTenant(svc, g.tenantId, cronogramaId)
  if (!c) return { ok: false, error: 'Cronograma não encontrado.' }
  const erro = validarMeta(e, c)
  if (erro) return { ok: false, error: erro }

  const { data, error } = await svc
    .from('simulado_cronograma_metas')
    .insert({ tenant_id: g.tenantId, cronograma_id: cronogramaId, ...normalizar(e) })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_cronograma_metas',
    entidadeId: (data as any).id,
    depois: { cronograma_nome: c.nome, semana: e.semana, tipo: e.tipo, disciplina: e.disciplina },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath(`/admin/cronogramas/${cronogramaId}`)
  return { ok: true, id: (data as any).id }
}

export async function atualizarMeta(cronogramaId: string, metaId: string, e: EntradaMeta): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const c = await cronogramaDoTenant(svc, g.tenantId, cronogramaId)
  if (!c) return { ok: false, error: 'Cronograma não encontrado.' }
  const erro = validarMeta(e, c)
  if (erro) return { ok: false, error: erro }

  const { data: antes } = await svc
    .from('simulado_cronograma_metas')
    .select('semana, dia, tipo, disciplina, aula, conteudo, duracao')
    .eq('id', metaId)
    .eq('tenant_id', g.tenantId)
    .eq('cronograma_id', cronogramaId)
    .maybeSingle()
  if (!antes) return { ok: false, error: 'Meta não encontrada.' }

  const { error } = await svc
    .from('simulado_cronograma_metas')
    .update(normalizar(e))
    .eq('id', metaId)
    .eq('tenant_id', g.tenantId)
    .eq('cronograma_id', cronogramaId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_metas',
    entidadeId: metaId,
    antes: antes as Record<string, unknown>,
    depois: { cronograma_nome: c.nome, ...normalizar(e) },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath(`/admin/cronogramas/${cronogramaId}`)
  return { ok: true }
}

export async function excluirMeta(cronogramaId: string, metaId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronograma_metas')
    .delete()
    .eq('id', metaId)
    .eq('tenant_id', g.tenantId)
    .eq('cronograma_id', cronogramaId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({
    operacao: 'DELETE',
    entidade: 'simulado_cronograma_metas',
    entidadeId: metaId,
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath(`/admin/cronogramas/${cronogramaId}`)
  return { ok: true }
}

/**
 * `aula` é gravada como TEXTO, sempre — nunca coagida a número. "01", "1" e "1.1" são
 * aulas diferentes, e o casamento com os links é exato (R11).
 */
function normalizar(e: EntradaMeta) {
  return {
    semana: e.semana,
    dia: e.dia,
    tipo: e.tipo,
    disciplina: e.disciplina.trim(),
    aula: e.aula?.trim() || null,
    conteudo: e.conteudo?.trim() || null,
    duracao: e.duracao?.trim() || null,
    ordem: e.ordem ?? 0,
    simulado_id: e.simulado_id || null,
    simulado_externo_nome: e.simulado_externo_nome?.trim() || null,
    simulado_externo_url: e.simulado_externo_url?.trim() || null,
  }
}
