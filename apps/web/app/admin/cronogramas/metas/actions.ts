'use server'

/**
 * Auditoria de metas — a visão TRANSVERSAL que faltava.
 *
 * A tela do cronograma responde "o que tem nesta semana". Esta responde "esta meta está em
 * quantos cronogramas?" e "a mesma aula está gravada como '01' aqui e '1' ali?". Sem isso,
 * corrigir uma grafia significava abrir 26 telas e caçar à mão.
 *
 * Tudo vem de RPC agregada: são 16.697 metas, e agrupar na aplicação exigiria baixá-las
 * inteiras a cada abertura — o teto de 1.000 do PostgREST que este módulo já pagou três vezes.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { chaveAula } from '@/lib/cronograma/aula'

async function guard(perm = 'cronogramas:view') {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

export type FormaAula = { aula: string; n: number }
export type CronDaAula = { id: string; nome: string; aula: string; n: number }

export type VarianteAula = {
  disciplina: string
  aula_chave: string
  total: number
  formas: FormaAula[]
  cronogramas: CronDaAula[]
}

export type OndeEsta = {
  id: string
  nome: string
  semana: number
  dia: number
  aula: string | null
  meta_id: string
}

export type GrupoMeta = {
  chave: string
  tipo: string
  disciplina: string
  aula_chave: string
  conteudo: string | null
  n_metas: number
  n_cronogramas: number
  n_formas_aula: number
  cronogramas: OndeEsta[]
  total_linhas: number
}

export type DuracaoDivergente = {
  cronograma_id: string
  cronograma_nome: string
  semana: number
  tipo: string
  valores: { duracao: string; n: number }[]
  total: number
}

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))

export async function carregarVariantesAula(): Promise<{ ok: boolean; itens?: VarianteAula[]; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const { data, error } = await createAdminClient().rpc('simulado_cronograma_aulas_variantes', {
    p_tenant: g.tenantId,
  })
  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    itens: ((data ?? []) as Record<string, unknown>[]).map((v) => ({
      disciplina: String(v.disciplina),
      aula_chave: String(v.aula_chave),
      total: n(v.total),
      formas: (v.formas as FormaAula[]) ?? [],
      cronogramas: (v.cronogramas as CronDaAula[]) ?? [],
    })),
  }
}

export async function carregarDuracoes(): Promise<{ ok: boolean; itens?: DuracaoDivergente[]; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const { data, error } = await createAdminClient().rpc('simulado_cronograma_duracoes_divergentes', {
    p_tenant: g.tenantId,
  })
  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    itens: ((data ?? []) as Record<string, unknown>[]).map((d) => ({
      cronograma_id: String(d.cronograma_id),
      cronograma_nome: String(d.cronograma_nome),
      semana: n(d.semana),
      tipo: String(d.tipo),
      valores: (d.valores as { duracao: string; n: number }[]) ?? [],
      total: n(d.total),
    })),
  }
}

export async function buscarGrupos(
  busca: string,
  minCron: number,
  tipo: string | null,
  pagina: number,
  porPagina = 25,
): Promise<{ ok: boolean; itens?: GrupoMeta[]; total?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const { data, error } = await createAdminClient().rpc('simulado_cronograma_metas_agrupadas', {
    p_tenant: g.tenantId,
    p_busca: busca.trim() || null,
    p_min_cron: minCron,
    p_tipo: tipo,
    p_limite: porPagina,
    p_offset: Math.max(0, pagina) * porPagina,
  })
  if (error) return { ok: false, error: error.message }

  const itens = ((data ?? []) as Record<string, unknown>[]).map((x) => ({
    chave: String(x.chave),
    tipo: String(x.tipo),
    disciplina: String(x.disciplina),
    aula_chave: String(x.aula_chave),
    conteudo: (x.conteudo as string | null) ?? null,
    n_metas: n(x.n_metas),
    n_cronogramas: n(x.n_cronogramas),
    n_formas_aula: n(x.n_formas_aula),
    cronogramas: (x.cronogramas as OndeEsta[]) ?? [],
    total_linhas: n(x.total_linhas),
  }))
  return { ok: true, itens, total: itens[0]?.total_linhas ?? 0 }
}

/**
 * Padroniza o formato da aula de UMA disciplina+aula para uma forma só.
 *
 * É a correção que o formato divergente pede, e a que não dá para fazer pela tela do
 * cronograma: a mesma aula está espalhada por dezenas deles. O `chave_aula` do banco é o
 * mesmo que a leitura usa para agrupar — se fossem regras diferentes, a tela mostraria um
 * grupo que a correção não pegaria.
 *
 * Exige `cronogramas:update`: mexe em meta, não é leitura.
 */
export async function padronizarFormatoAula(
  disciplina: string,
  aulaChave: string,
  formaAlvo: string,
): Promise<{ ok: boolean; alterados?: number; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const alvo = formaAlvo.trim()
  if (!alvo) return { ok: false, error: 'Escolha o formato de destino.' }

  const svc = createAdminClient()

  /* Quais metas mudam: mesma disciplina, mesma aula normalizada, forma DIFERENTE do alvo.
     `fetchAll` é obrigatório — "Direito Administrativo" sozinho tem 1.503 metas com aula, e um
     select cru pararia em 1.000: a padronização diria "pronto" deixando 503 para trás. */
  const candidatas = await fetchAll<{ id: string; aula: string | null }>(() =>
    svc
      .from('simulado_cronograma_metas')
      .select('id, aula')
      .eq('tenant_id', g.tenantId)
      .eq('disciplina', disciplina)
      .not('aula', 'is', null)
      .order('id') as never,
  )

  const ids = candidatas
    .filter((m) => chaveAula(m.aula) === aulaChave && (m.aula ?? '').trim() !== alvo)
    .map((m) => m.id)

  if (!ids.length) return { ok: true, alterados: 0 }

  // Em lotes: um `.in()` com milhares de ids estoura o tamanho da URL do PostgREST.
  let alterados = 0
  for (let i = 0; i < ids.length; i += 300) {
    const lote = ids.slice(i, i + 300)
    const { error } = await svc
      .from('simulado_cronograma_metas')
      .update({ aula: alvo })
      .in('id', lote)
      .eq('tenant_id', g.tenantId)
    if (error) return { ok: false, error: error.message }
    alterados += lote.length
  }

  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_metas',
    entidadeId: ids[0],
    depois: { padronizacao: 'aula', disciplina, aula_chave: aulaChave, para: alvo, metas: alterados },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  return { ok: true, alterados }
}

/**
 * Padroniza o formato da aula de uma DISCIPLINA inteira.
 *
 * A correção por (disciplina + aula) era granular demais para ser útil: "Direito
 * Administrativo" tem 8 aulas gravadas nos dois formatos, e ninguém quer arrumar a aula 1 e
 * deixar a 2 quebrada. A decisão real é uma por disciplina — "aqui é tudo com zero" — e é
 * essa que a tela precisa oferecer.
 *
 * `comZero` = true → 1 vira 01, 9 vira 09; números de 2+ dígitos ficam como estão.
 * `comZero` = false → 01 vira 1, 09 vira 9.
 * Aulas que não são inteiro ("1.1") nunca são tocadas: não há formato canônico para elas.
 */
export async function padronizarFormatoDisciplina(
  disciplina: string,
  comZero: boolean,
): Promise<{ ok: boolean; alterados?: number; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  // fetchAll obrigatório: "Direito Administrativo" tem 1.503 metas com aula, e um select cru
  // pararia em 1.000 dizendo "pronto" com 503 para trás.
  const candidatas = await fetchAll<{ id: string; aula: string | null }>(() =>
    svc
      .from('simulado_cronograma_metas')
      .select('id, aula')
      .eq('tenant_id', g.tenantId)
      .eq('disciplina', disciplina)
      .not('aula', 'is', null)
      .order('id') as never,
  )

  /** O formato de destino de uma aula. Devolve null quando não há o que mudar. */
  const destino = (bruto: string | null): string | null => {
    const t = (bruto ?? '').trim()
    if (!/^\d+$/.test(t)) return null // '1.1' e afins ficam
    const n = Number(t)
    const alvo = comZero ? String(n).padStart(2, '0') : String(n)
    return alvo === t ? null : alvo
  }

  const mudancas = candidatas
    .map((m) => ({ id: m.id, para: destino(m.aula) }))
    .filter((x): x is { id: string; para: string } => x.para !== null)

  if (!mudancas.length) return { ok: true, alterados: 0 }

  /* Agrupa por valor de destino para o UPDATE ser um por formato, e não um por meta: 1.503
     metas viram ~40 idas em vez de 1.503. */
  const porValor = new Map<string, string[]>()
  for (const m of mudancas) {
    const l = porValor.get(m.para)
    if (l) l.push(m.id)
    else porValor.set(m.para, [m.id])
  }

  let alterados = 0
  for (const [valor, ids] of porValor) {
    for (let i = 0; i < ids.length; i += 300) {
      const lote = ids.slice(i, i + 300)
      const { error } = await svc
        .from('simulado_cronograma_metas')
        .update({ aula: valor })
        .in('id', lote)
        .eq('tenant_id', g.tenantId)
      if (error) return { ok: false, error: error.message }
      alterados += lote.length
    }
  }

  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_metas',
    entidadeId: mudancas[0].id,
    depois: { padronizacao: 'aula_disciplina', disciplina, com_zero: comZero, metas: alterados },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  return { ok: true, alterados }
}

/** Uniformiza a duração de uma semana+tipo — no papel só a primeira é impressa. */
export async function padronizarDuracao(
  cronogramaId: string,
  semana: number,
  tipo: string,
  duracao: string,
): Promise<{ ok: boolean; alterados?: number; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const alvo = duracao.trim()
  if (!alvo) return { ok: false, error: 'Escolha a duração de destino.' }

  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_cronograma_metas')
    .update({ duracao: alvo })
    .eq('tenant_id', g.tenantId)
    .eq('cronograma_id', cronogramaId)
    .eq('semana', semana)
    .eq('tipo', tipo)
    .not('duracao', 'is', null)
    .select('id')
  if (error) return { ok: false, error: error.message }

  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_metas',
    entidadeId: cronogramaId,
    depois: { padronizacao: 'duracao', semana, tipo, para: alvo, metas: (data ?? []).length },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  return { ok: true, alterados: (data ?? []).length }
}

/** Remove UMA meta — a saída para a duplicata que não deveria existir. */
export async function excluirMetaAvulsa(metaId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const { data: antes } = await svc
    .from('simulado_cronograma_metas')
    .select('id, cronograma_id, semana, dia, tipo, disciplina, aula, conteudo')
    .eq('id', metaId)
    .eq('tenant_id', g.tenantId)
    .maybeSingle()
  if (!antes) return { ok: false, error: 'Meta não encontrada.' }

  const { error } = await svc
    .from('simulado_cronograma_metas')
    .delete()
    .eq('id', metaId)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({
    operacao: 'DELETE',
    entidade: 'simulado_cronograma_metas',
    entidadeId: metaId,
    antes: antes as Record<string, unknown>,
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  return { ok: true }
}
