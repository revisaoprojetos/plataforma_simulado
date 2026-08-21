'use server'

/**
 * CRUD do catálogo de cronogramas (spec §8).
 *
 * Segue o padrão das actions do projeto: nunca lançam — devolvem `{ ok, error }`; o
 * tenant vem SEMPRE do servidor (`guard`), nunca por parâmetro do cliente; e toda query
 * filtra por `tenant_id` explicitamente, sem confiar no RLS.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { faixaSemanal } from '@/lib/cronograma/faixa'

export type CategoriaRow = {
  id: string
  nome: string
  slug: string
  cor: string | null
  ordem: number
  /** Quantos cronogramas usam esta categoria — evita excluir uma em uso sem saber. */
  usos: number
}

export type CronogramaLista = {
  id: string
  slug: string
  nome: string
  carga_horaria: number
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
  categoria_id: string | null
  categoria_nome: string | null
  status: 'rascunho' | 'liberado'
  ordem: number
  faixa: string
  metas: number
  /** Em quantos pacotes está — zero significa invisível para o aluno. */
  pacotes: number
}

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Slug estável a partir do nome (chave natural na importação — spec §9). */
function gerarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove os acentos separados pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * Valida as invariantes da spec §8 que dependem só do próprio cronograma.
 * Devolve a primeira mensagem de erro, ou null se está tudo certo.
 */
function validarMetadados(m: {
  nome: string
  carga_horaria: number
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
}): string | null {
  if (!m.nome.trim()) return 'Informe o nome do cronograma.'
  // R18 corrigida: carga é campo explícito, não mais deduzida do nome.
  if (!(m.carga_horaria > 0)) return 'Informe a carga horária (em horas por dia).'
  if (!(m.total_semanas >= 1)) return 'O total de semanas precisa ser pelo menos 1.'
  if (!m.dias_curso.length) return 'Selecione ao menos um dia de curso.'
  if (m.dias_curso.length !== m.dias_nome.length) return 'Dias de curso e rótulos precisam ter o mesmo tamanho.'
  if (m.dias_curso.some((d) => d < 0 || d > 6)) return 'Dia de curso inválido (use 0=domingo a 6=sábado).'
  if (new Set(m.dias_curso).size !== m.dias_curso.length) return 'Há dias de curso repetidos.'
  const foraDoIntervalo = m.semanas_revisao.filter((s) => s < 1 || s > m.total_semanas)
  if (foraDoIntervalo.length) return `Semana de revisão fora do intervalo: ${foraDoIntervalo.join(', ')}.`
  return null
}

/** Lista o catálogo do tenant, com a contagem de metas de cada cronograma. */
export async function listarCronogramas(): Promise<{ ok: boolean; itens?: CronogramaLista[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const { data, error } = await svc
    .from('simulado_cronogramas')
    .select('id, slug, nome, carga_horaria, total_semanas, dias_curso, dias_nome, semanas_revisao, categoria_id, status, ordem')
    .eq('tenant_id', g.tenantId)
    .eq('deletado', false)
    .order('ordem')
    .order('carga_horaria')
    .order('nome')
  if (error) return { ok: false, error: error.message }

  /**
   * Contagem AGREGADA no banco, não com select + contar aqui.
   *
   * O `select cronograma_id` esbarrava no teto de 1.000 linhas do PostgREST: com 16.697
   * metas, só as primeiras voltavam, e os demais cronogramas apareciam como "sem metas"
   * — o que ainda desabilitava o botão de liberar. Paginar corrigiria, mas puxaria
   * 16.697 linhas a cada abertura da tela para produzir 25 números.
   */
  const { data: contagemMetas } = await svc.rpc('simulado_cronograma_contar_metas', { p_tenant: g.tenantId })
  const totais = new Map<string, number>()
  for (const m of ((contagemMetas ?? []) as any[])) totais.set(m.cronograma_id, Number(m.total))

  const { data: cats } = await svc
    .from('simulado_cronograma_categorias')
    .select('id, nome')
    .eq('tenant_id', g.tenantId)

  // Vínculos com pacotes: é por eles que o aluno recebe acesso. Um cronograma
  // liberado mas fora de qualquer pacote não chega a ninguém (salvo gratuito).
  const { data: contagemPacotes } = await svc.rpc('simulado_cronograma_contar_pacotes', { p_tenant: g.tenantId })
  const pacotesPorCron = new Map<string, number>()
  for (const v of ((contagemPacotes ?? []) as any[])) pacotesPorCron.set(v.cronograma_id, Number(v.total))
  const nomeCategoria = new Map(((cats ?? []) as any[]).map((c) => [c.id, c.nome as string]))

  const itens = (data ?? []).map((c: any) => ({
    ...c,
    categoria_nome: c.categoria_id ? (nomeCategoria.get(c.categoria_id) ?? null) : null,
    dias_curso: c.dias_curso ?? [],
    dias_nome: c.dias_nome ?? [],
    semanas_revisao: c.semanas_revisao ?? [],
    carga_horaria: Number(c.carga_horaria),
    faixa: faixaSemanal(c.dias_curso ?? []), // R19 — lida de dias_curso, não do nome
    metas: totais.get(c.id) ?? 0,
    pacotes: pacotesPorCron.get(c.id) ?? 0,
  })) as CronogramaLista[]

  return { ok: true, itens }
}

export type EntradaCronograma = {
  nome: string
  carga_horaria: number
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
  categoria_id: string | null
  subtitulo: string | null
  ordem: number
}

/** Cria um cronograma. Nasce SEMPRE rascunho e sem metas (spec §8). */
export async function criarCronograma(e: EntradaCronograma): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('cronogramas:create')
  if (!g.ok) return { ok: false, error: g.error }
  const erro = validarMetadados(e)
  if (erro) return { ok: false, error: erro }

  const svc = createAdminClient()
  const slug = gerarSlug(e.nome)
  const { data, error } = await svc
    .from('simulado_cronogramas')
    .insert({
      tenant_id: g.tenantId,
      slug,
      nome: e.nome.trim(),
      subtitulo: e.subtitulo?.trim() || null,
      total_semanas: e.total_semanas,
      dias_curso: e.dias_curso,
      dias_nome: e.dias_nome,
      semanas_revisao: e.semanas_revisao,
      carga_horaria: e.carga_horaria,
      categoria_id: e.categoria_id || null,
      ordem: e.ordem ?? 0,
      status: 'rascunho',
    })
    .select('id')
    .single()

  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe um cronograma com esse nome.' : error.message }
  }
  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_cronogramas',
    entidadeId: (data as any).id,
    depois: { nome: e.nome, slug, carga_horaria: e.carga_horaria, total_semanas: e.total_semanas },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas')
  return { ok: true, id: (data as any).id }
}

export async function atualizarCronograma(id: string, e: EntradaCronograma): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const erro = validarMetadados(e)
  if (erro) return { ok: false, error: erro }

  const svc = createAdminClient()
  const { data: antes } = await svc
    .from('simulado_cronogramas')
    .select('nome, carga_horaria, total_semanas, dias_curso, dias_nome, semanas_revisao, categoria_id, ordem')
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .maybeSingle()
  if (!antes) return { ok: false, error: 'Cronograma não encontrado.' }

  // Invariante da spec §8: reduzir total_semanas exige decidir o que fazer com as metas
  // órfãs. Em vez de apagá-las em silêncio, o CRUD recusa e diz quantas são.
  if (e.total_semanas < (antes as any).total_semanas) {
    const { data: orfas } = await svc
      .from('simulado_cronograma_metas')
      .select('id')
      .eq('tenant_id', g.tenantId)
      .eq('cronograma_id', id)
      .gt('semana', e.total_semanas)
      .limit(1000)
    const n = (orfas ?? []).length
    if (n > 0) {
      return {
        ok: false,
        error: `Reduzir para ${e.total_semanas} semanas deixaria ${n === 1000 ? '1000+' : n} meta(s) fora da grade. Remova ou remaneje essas metas antes.`,
      }
    }
  }

  const patch = {
    nome: e.nome.trim(),
    subtitulo: e.subtitulo?.trim() || null,
    total_semanas: e.total_semanas,
    dias_curso: e.dias_curso,
    dias_nome: e.dias_nome,
    semanas_revisao: e.semanas_revisao,
    carga_horaria: e.carga_horaria,
    categoria_id: e.categoria_id || null,
    ordem: e.ordem ?? 0,
    atualizado_em: new Date().toISOString(),
  }
  const { error } = await svc.from('simulado_cronogramas').update(patch).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronogramas',
    entidadeId: id,
    antes: antes as Record<string, unknown>,
    depois: patch,
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas')
  return { ok: true }
}

/**
 * Libera ou volta a rascunho — é o que decide se o ALUNO enxerga, por isso exige a
 * permissão própria `cronogramas:liberar` (spec §8 reserva isso só para admin).
 */
export async function alternarLiberacao(id: string, liberar: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:liberar')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  if (liberar) {
    // Liberar cronograma sem metas mostraria uma grade vazia para o aluno.
    const { data: metas } = await svc
      .from('simulado_cronograma_metas')
      .select('id')
      .eq('tenant_id', g.tenantId)
      .eq('cronograma_id', id)
      .limit(1)
    if (!(metas ?? []).length) return { ok: false, error: 'Não é possível liberar um cronograma sem metas cadastradas.' }
  }

  const patch = liberar
    ? { status: 'liberado', liberado_em: new Date().toISOString(), liberado_por: g.atorId, atualizado_em: new Date().toISOString() }
    : { status: 'rascunho', liberado_em: null, liberado_por: null, atualizado_em: new Date().toISOString() }

  const { error } = await svc.from('simulado_cronogramas').update(patch).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({
    operacao: liberar ? 'LIBERAR' : 'BLOQUEAR',
    entidade: 'simulado_cronogramas',
    entidadeId: id,
    depois: { status: patch.status },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas')
  return { ok: true }
}

/** Soft delete — as metas continuam no banco e voltam junto se o cronograma for restaurado. */
export async function excluirCronograma(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:delete')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronogramas')
    .update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: g.atorId })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({
    operacao: 'DELETE',
    entidade: 'simulado_cronogramas',
    entidadeId: id,
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Categorias
//
// Cadastro por tenant, no mesmo desenho das plataformas de curso. Antes `categoria` era
// texto livre no cronograma, e "Específicos" / "especificos" / "Específico" viravam três
// categorias diferentes — agrupar o catálogo por elas passava a mentir.

/** Lista as categorias com a contagem de cronogramas que as usam. */
export async function listarCategorias(): Promise<{ ok: boolean; itens?: CategoriaRow[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const [{ data: cats, error }, { data: usos }] = await Promise.all([
    svc
      .from('simulado_cronograma_categorias')
      .select('id, nome, slug, cor, ordem')
      .eq('tenant_id', g.tenantId)
      .eq('ativo', true)
      .order('ordem')
      .order('nome'),
    svc.from('simulado_cronogramas').select('categoria_id').eq('tenant_id', g.tenantId).eq('deletado', false),
  ])
  if (error) return { ok: false, error: error.message }

  const conta = new Map<string, number>()
  for (const u of (usos ?? []) as any[]) {
    if (u.categoria_id) conta.set(u.categoria_id, (conta.get(u.categoria_id) ?? 0) + 1)
  }
  return { ok: true, itens: ((cats ?? []) as any[]).map((c) => ({ ...c, usos: conta.get(c.id) ?? 0 })) }
}

export async function criarCategoria(nome: string, cor: string | null): Promise<{ ok: boolean; id?: string; slug?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe o nome da categoria.' }
  const slug = gerarSlug(n)
  if (!slug) return { ok: false, error: 'O nome precisa ter ao menos uma letra ou número.' }

  const svc = createAdminClient()
  const { data: ultima } = await svc
    .from('simulado_cronograma_categorias')
    .select('ordem')
    .eq('tenant_id', g.tenantId)
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await svc
    .from('simulado_cronograma_categorias')
    .insert({ tenant_id: g.tenantId, nome: n, slug, cor: cor || null, ordem: ((ultima as any)?.ordem ?? -1) + 1 })
    .select('id, slug')
    .single()
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe uma categoria com esse nome.' : error.message }
  }
  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_cronograma_categorias',
    entidadeId: (data as any).id,
    depois: { nome: n, slug },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas')
  return { ok: true, id: (data as any).id, slug: (data as any).slug }
}

/**
 * Renomeia. O SLUG não muda junto: ele é a chave que a importação usa, e trocá-lo em
 * silêncio quebraria arquivos que já referenciam a categoria.
 */
export async function atualizarCategoria(id: string, nome: string, cor: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe o nome da categoria.' }

  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronograma_categorias')
    .update({ nome: n, cor: cor || null, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe uma categoria com esse nome.' : error.message }
  }
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_categorias',
    entidadeId: id,
    depois: { nome: n, cor },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas')
  return { ok: true }
}

/**
 * Excluir NÃO apaga cronograma nenhum: a FK é `ON DELETE SET NULL`, então os que usavam
 * a categoria simplesmente ficam sem ela. A tela avisa quantos são antes de confirmar.
 */
export async function excluirCategoria(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_cronograma_categorias').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({
    operacao: 'DELETE',
    entidade: 'simulado_cronograma_categorias',
    entidadeId: id,
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas')
  return { ok: true }
}
