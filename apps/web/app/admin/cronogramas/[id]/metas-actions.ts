'use server'

/**
 * Metas de um cronograma: leitura da grade inteira, correção avulsa e diagnóstico.
 *
 * "Corrigir uma linha sem reimportar as 800" é requisito explícito da spec §8 — por isso
 * existe `atualizarMeta` além do importador.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { chaveLink } from '@/lib/cronograma/formato-meta'
import { listarTiposMeta } from '@/lib/cronograma/carregar-tipos'
import type { MetaFonte, TipoMeta, TipoMetaDef } from '@/lib/cronograma/tipos'

export type CronogramaDetalhe = {
  id: string
  slug: string
  nome: string
  carga_horaria: number
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
  categoria_nome: string | null
  status: 'rascunho' | 'liberado'
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  tipos?: TipoMetaDef[]
  disciplinas?: { id: string; nome: string }[]
  simulados?: { id: string; titulo: string; status: string }[]
  diagnostico?: Diagnostico
  error?: string
}> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  // Sem esta guarda, um segmento de rota que não é uuid (ex.: uma sub-rota nova que
  // ainda não existe e cai no [id]) vai como id para o banco e volta erro de sintaxe
  // de uuid em vez de "não encontrado".
  if (!UUID_RE.test(id)) return { ok: false, error: 'Cronograma não encontrado.' }
  const svc = createAdminClient()

  const { data: c, error } = await svc
    .from('simulado_cronogramas')
    .select('id, slug, nome, carga_horaria, total_semanas, dias_curso, dias_nome, semanas_revisao, categoria_id, status')
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .eq('deletado', false)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!c) return { ok: false, error: 'Cronograma não encontrado.' }

  const metas = await fetchAll<MetaFonte>(() =>
    svc
      .from('simulado_cronograma_metas')
      .select('id, semana, dia, tipo, disciplina, disciplina_id, aula, conteudo, duracao, ordem, simulado_id, simulado_externo_nome, simulado_externo_url')
      .eq('tenant_id', g.tenantId)
      .eq('cronograma_id', id)
      .order('semana')
      .order('dia')
      .order('ordem')
      .order('id') as any,
  )

  // Links do tenant, para apontar quais metas de questões estão órfãs (spec §8).
  const links = await fetchAll<{ disciplina: string; disciplina_id: string | null; aula: string }>(() =>
    svc.from('simulado_cronograma_links').select('disciplina, disciplina_id, aula').eq('tenant_id', g.tenantId).order('disciplina').order('aula') as any,
  )
  const comLink = new Set(
    links.flatMap((l) => [chaveLink(l.disciplina, l.aula, l.disciplina_id), chaveLink(l.disciplina, l.aula)]).filter(Boolean) as string[],
  )

  // A categoria virou cadastro: o cronograma guarda a referência, o nome vem daqui.
  let categoriaNome: string | null = null
  if ((c as any).categoria_id) {
    const { data: cat } = await svc
      .from('simulado_cronograma_categorias')
      .select('nome')
      .eq('id', (c as any).categoria_id)
      .eq('tenant_id', g.tenantId)
      .maybeSingle()
    categoriaNome = (cat as any)?.nome ?? null
  }

  const cron = {
    ...(c as any),
    categoria_nome: categoriaNome,
    carga_horaria: Number((c as any).carga_horaria),
    dias_curso: (c as any).dias_curso ?? [],
    dias_nome: (c as any).dias_nome ?? [],
    semanas_revisao: (c as any).semanas_revisao ?? [],
  } as CronogramaDetalhe

  const tipos = await listarTiposMeta(g.tenantId)

  // Reusa o cadastro de disciplinas dos simulados — um vocabulário só para o produto,
  // em vez de um segundo cadastro que divergiria do primeiro.
  const { data: disciplinas } = await svc
    .from('simulado_disciplinas')
    .select('id, nome')
    .eq('tenant_id', g.tenantId)
    .order('ordem')
    .order('nome')

  // Simulados da própria plataforma, para a meta do tipo `simulado` poder apontar um
  // deles em vez de só um link externo. O aluno sem matrícula no simulado apontado vê
  // a meta com aviso de sem acesso, em vez de a linha sumir da grade dele.
  const { data: simulados } = await svc
    .from('simulado_simulados')
    .select('id, titulo, status')
    .eq('tenant_id', g.tenantId)
    .eq('deletado', false)
    .is('owner_estudante_id', null)
    .order('titulo')

  return {
    ok: true,
    cronograma: cron,
    metas,
    tipos,
    disciplinas: (disciplinas ?? []) as { id: string; nome: string }[],
    simulados: (simulados ?? []) as { id: string; titulo: string; status: string }[],
    diagnostico: diagnosticar(cron, metas, comLink),
  }
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
      const k = chaveLink(m.disciplina, m.aula, m.disciplina_id)
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
  disciplina_id: string | null
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
  return null
}

/**
 * Meta que aponta simulado precisa ter um destino: um simulado desta plataforma OU um
 * externo com nome e link. Sem isso o aluno vê uma linha que não leva a lugar nenhum —
 * e o CHECK do banco recusaria de qualquer forma.
 */
function validarDestinoSimulado(e: EntradaMeta, tipoApontaSimulado: boolean): string | null {
  if (!tipoApontaSimulado) return null
  const temInterno = !!e.simulado_id
  const temExterno = !!(e.simulado_externo_nome?.trim() && e.simulado_externo_url?.trim())
  if (!temInterno && !temExterno) {
    return 'Escolha um simulado da plataforma ou informe nome e link de um simulado externo.'
  }
  return null
}

/** O tipo precisa existir no cadastro do tenant — o CHECK fixo do banco não existe mais. */
async function validarTipo(svc: any, tenantId: string, slug: string): Promise<string | null> {
  const { data } = await svc
    .from('simulado_cronograma_tipos_meta')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .eq('ativo', true)
    .maybeSingle()
  return data ? null : `Tipo de meta "${slug}" não existe ou está inativo no cadastro.`
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
  const erroTipo = await validarTipo(svc, g.tenantId, e.tipo)
  if (erroTipo) return { ok: false, error: erroTipo }
  const erroDestino = validarDestinoSimulado(e, e.tipo === 'simulado')
  if (erroDestino) return { ok: false, error: erroDestino }

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
  const erroTipo = await validarTipo(svc, g.tenantId, e.tipo)
  if (erroTipo) return { ok: false, error: erroTipo }
  const erroDestino = validarDestinoSimulado(e, e.tipo === 'simulado')
  if (erroDestino) return { ok: false, error: erroDestino }

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
    disciplina_id: e.disciplina_id || null,
    aula: e.aula?.trim() || null,
    conteudo: e.conteudo?.trim() || null,
    duracao: e.duracao?.trim() || null,
    ordem: e.ordem ?? 0,
    simulado_id: e.simulado_id || null,
    simulado_externo_nome: e.simulado_externo_nome?.trim() || null,
    simulado_externo_url: e.simulado_externo_url?.trim() || null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pacotes deste cronograma
//
// O pacote é o caminho pelo qual o aluno recebe o cronograma. Poder ver e mexer nisso
// daqui evita a ida e volta até a tela de pacotes só para conferir "quem recebe este".

export type PacotesDoCronograma = {
  dentro: { id: string; nome: string; alcance: number }[]
  fora: { id: string; nome: string; alcance: number }[]
}

export async function pacotesDoCronograma(cronogramaId: string): Promise<{ ok: boolean; dados?: PacotesDoCronograma; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  if (!UUID_RE.test(cronogramaId)) return { ok: false, error: 'Cronograma não encontrado.' }
  const svc = createAdminClient()

  const [pacotes, itens, vgrupos, vest] = await Promise.all([
    fetchAll<any>(() =>
      svc.from('simulado_cronograma_pacotes').select('id, nome').eq('tenant_id', g.tenantId).eq('ativo', true).order('nome') as any,
    ),
    fetchAll<any>(() =>
      svc.from('simulado_cronograma_pacote_itens').select('pacote_id').eq('tenant_id', g.tenantId).eq('cronograma_id', cronogramaId).order('id') as any,
    ),
    fetchAll<any>(() => svc.from('simulado_cronograma_pacote_grupos').select('pacote_id, grupo_id').eq('tenant_id', g.tenantId).order('id') as any),
    fetchAll<any>(() => svc.from('simulado_cronograma_pacote_estudantes').select('pacote_id, estudante_id').eq('tenant_id', g.tenantId).order('id') as any),
  ])

  // Alcance de cada pacote: membros dos grupos vinculados + avulsos, sem duplicar.
  const gruposUsados = [...new Set(vgrupos.map((x) => x.grupo_id))]
  const membrosPorGrupo = new Map<string, string[]>()
  if (gruposUsados.length) {
    const membros = await fetchAllByIn<any>(gruposUsados, (chunk) =>
      svc.from('simulado_grupo_membros').select('grupo_id, estudante_id').in('grupo_id', chunk).order('estudante_id') as any,
    )
    for (const m of membros) {
      const l = membrosPorGrupo.get(m.grupo_id)
      if (l) l.push(m.estudante_id)
      else membrosPorGrupo.set(m.grupo_id, [m.estudante_id])
    }
  }

  const alcanceDe = (pacoteId: string) => {
    const s = new Set<string>()
    for (const vg of vgrupos) {
      if (vg.pacote_id !== pacoteId) continue
      for (const e of membrosPorGrupo.get(vg.grupo_id) ?? []) s.add(e)
    }
    for (const ve of vest) if (ve.pacote_id === pacoteId) s.add(ve.estudante_id)
    return s.size
  }

  const dentroIds = new Set(itens.map((i) => i.pacote_id))
  const comAlcance = pacotes.map((p) => ({ id: p.id, nome: p.nome, alcance: alcanceDe(p.id) }))

  return {
    ok: true,
    dados: {
      dentro: comAlcance.filter((p) => dentroIds.has(p.id)),
      fora: comAlcance.filter((p) => !dentroIds.has(p.id)),
    },
  }
}
