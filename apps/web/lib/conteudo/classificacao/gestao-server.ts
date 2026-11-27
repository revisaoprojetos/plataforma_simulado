import 'server-only'
// Serviço da GESTÃO da classificação (CRUD das classificações + matriz de regras de uso). Backend-first: filtros, ordenação,
// paginação (.range()+count), uso e tempo são calculados AQUI; as rotas /api/admin/biblioteca/classificacao/{tipos,regras-uso}
// e a página só repassam. Tolerante a tabela/coluna ausente (migrations 16/17 pendentes). Escritas auditadas + caches invalidados.
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { registrarAudit } from '@/lib/audit'
import { esquecer } from '@/lib/cache/relatorio-cache'
import { sqlQuery } from '@/lib/data/sql'
import { invalidarCachesPaginas } from '@/lib/conteudo/paginas-sync'
import { esquecerCatalogoTipos, tabelaTiposAusente } from '@/lib/cronograma/tipos-conteudo-server'
import { SLUGS_SISTEMA, TIPOS_SISTEMA, type PapelTipo } from '@/lib/cronograma/tipos-conteudo-tipos'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { esquecerClassificacao } from './carregar'
import { resolverRegras, calcularMinutos, CAMPOS_REGRA, type Medidas, type OrigemRegra } from './cascata'
import { colunaClassificacaoIdExiste } from './coluna-doc-server'
import { contexto } from './matriz-server'
import { createAdminClient } from '@/lib/supabase/server'
import { ExibicaoClassificacaoSchema, lerExibicao, lerRegrasParciais, type ExibicaoClassificacao, type RegrasOverride, type RegrasUso } from './esquema'
import {
  AREAS_CLASSIFICACAO, PADRAO_MOTOR_POR_AREA, agruparAlteracoes, aplicarPatchRegras, corValida, podeApagar, regrasVazias, slugDeNome, slugLivre,
  type AlteracaoRegras, type AreaClassificacao, type CriarTipo, type EdicaoTipo, type FiltroTipo, type OrdemTipo, type UsoClassificacao,
} from './gestao'

const T = 'simulado_conteudo_tipos'
const T_REGRAS = 'simulado_conteudo_regras_uso'
type Erro = { message?: string; code?: string }
const isErro = (e: unknown): e is Erro => !!e && typeof e === 'object'

export type Resultado<T = unknown> = ({ ok: true } & T) | { ok: false; status: 400 | 404 | 409 | 500 | 503; error: string }
const falha = (status: 400 | 404 | 409 | 500 | 503, error: string) => ({ ok: false as const, status, error })
const MSG_MIGRACAO = 'Aplique as migrations 16 e 17 (classificação: coluna exibicao e tabela de regras de uso) antes de usar esta área.'

export interface LinhaTipoGestao {
  id: string; slug: string; nome: string; nomeAluno: string | null; cor: string | null; papel: PapelTipo
  prioridade: number; ordem: number; ativo: boolean; sistema: boolean; descricao: string | null; versao: number
  geraMeta: boolean; exibicao: ExibicaoClassificacao
  uso: UsoClassificacao | null
}

interface LinhaBruta {
  id: string; slug: string; nome: string | null; nome_aluno: string | null; cor: string | null; papel: string | null
  prioridade: number | null; ordem: number | null; ativo: boolean | null; sistema: boolean | null; descricao: string | null
  versao: number | null; gera_meta?: boolean | null; exibicao?: unknown
}
const COLS_BASE = 'id, slug, nome, nome_aluno, cor, papel, prioridade, ordem, ativo, sistema, descricao, versao'
const CONJUNTOS_COLS = [`${COLS_BASE}, gera_meta, exibicao`, `${COLS_BASE}, exibicao`, `${COLS_BASE}, gera_meta`, COLS_BASE]

const deLinha = (l: LinhaBruta): LinhaTipoGestao => ({
  id: l.id, slug: l.slug, nome: l.nome || l.slug, nomeAluno: l.nome_aluno, cor: l.cor, papel: (l.papel || 'generico') as PapelTipo,
  prioridade: l.prioridade ?? 20, ordem: l.ordem ?? 100, ativo: l.ativo !== false, sistema: !!l.sistema, descricao: l.descricao,
  versao: l.versao ?? 1, geraMeta: l.gera_meta === true, exibicao: lerExibicao(l.exibicao), uso: null,
})

/** Roda a leitura com o 1º conjunto de colunas que existir no banco. null = tabela ausente. */
async function comColunas<R>(fn: (cols: string) => PromiseLike<{ data: R | null; error: unknown; count?: number | null }>): Promise<{ data: R; count: number | null } | null> {
  for (const cols of CONJUNTOS_COLS) {
    const { data, error, count } = await fn(cols)
    if (!error) return { data: (data ?? []) as R, count: count ?? null }
    if (!tabelaTiposAusente(error as Erro)) throw error
    if (cols === COLS_BASE) return null
  }
  return null
}

// ───────────── Uso (calculado no servidor, em lote por página) ─────────────
export async function usoDasClassificacoes(tenantId: string, itens: { id: string; slug: string }[]): Promise<Map<string, UsoClassificacao | null>> {
  const out = new Map<string, UsoClassificacao | null>()
  if (!itens.length) return out
  const ids = itens.map((i) => i.id), slugs = itens.map((i) => i.slug)
  const comColuna = await colunaClassificacaoIdExiste()
  // Uso EFETIVO (herança por pasta incluída): documento conta pela classificação própria OU, sem ela, pela da sua pasta.
  const ctx = await contexto(createAdminClient(), tenantId)
  const pids: string[] = [], cids: string[] = []
  const pastasEf = new Map<string, number>()
  for (const [pid, info] of ctx.mapa) {
    if (!info.classificacaoId) continue
    pids.push(pid); cids.push(info.classificacaoId)
    pastasEf.set(info.classificacaoId, (pastasEf.get(info.classificacaoId) ?? 0) + 1)
  }
  const [docs, pastas, metas, regras] = await Promise.all([
    comColuna
      ? sqlQuery<{ k: string; n: number }>(
        `SELECT coalesce(d.classificacao_id, m.cid)::text AS k, count(*)::int AS n FROM simulado_conteudo_documentos d
           LEFT JOIN unnest($2::uuid[], $3::uuid[]) AS m(pid, cid) ON m.pid = d.pasta_id
          WHERE d.tenant_id = $1 AND d.deletado = false AND coalesce(d.classificacao_id, m.cid) = ANY($4::uuid[]) GROUP BY 1`, [tenantId, pids, cids, ids])
      : Promise.resolve([] as { k: string; n: number }[]),
    Promise.resolve([] as { k: string; n: number }[]),
    sqlQuery<{ k: string; n: number }>(`SELECT classificacao_id::text AS k, count(*)::int AS n FROM simulado_conteudo_selecao_meta WHERE tenant_id = $1 AND classificacao_id = ANY($2::uuid[]) GROUP BY 1`, [tenantId, ids]),
    sqlQuery<{ k: string; n: number }>(`SELECT classificacao_id::text AS k, count(*)::int AS n FROM ${T_REGRAS} WHERE tenant_id = $1 AND classificacao_id = ANY($2::uuid[]) GROUP BY 1`, [tenantId, ids]),
  ])
  const m = (r: { k: string; n: number }[] | null) => (r ? new Map(r.map((x) => [x.k, Number(x.n)])) : null)
  const [d, p, me, rg] = [m(docs), m(pastas), m(metas), m(regras)]
  for (const i of itens) {
    // Qualquer contagem indisponível (SQL desligado/tabela ausente) → uso desconhecido (null): a UI avisa e o apagar bloqueia.
    out.set(i.id, d && p && me && rg ? { documentos: d.get(i.id) ?? 0, pastas: pastasEf.get(i.id) ?? 0, metas: me.get(i.id) ?? 0, regras: rg.get(i.id) ?? 0 } : null)
  }
  return out
}

// ───────────── Listagem paginada ─────────────
export interface ListaTipos {
  linhas: LinhaTipoGestao[]; total: number; semModeloBase: boolean; migracaoPendente: boolean; usoIndisponivel: boolean
}
export interface FiltrosTipos { q?: string; filtro: FiltroTipo; sort: OrdemTipo; dir: 'asc' | 'desc'; page: number; pp: number }

export async function listarTiposGestao(svc: SupabaseClient, tenantId: string, f: FiltrosTipos): Promise<ListaTipos> {
  const q = (f.q ?? '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 60)
  const from = (Math.max(1, f.page) - 1) * f.pp
  const r = await comColunas<LinhaBruta[]>((cols) => {
    let b = svc.from(T).select(cols, { count: 'exact' }).eq('tenant_id', tenantId)
    if (q) b = b.or(`nome.ilike.%${q}%,slug.ilike.%${q}%`)
    if (f.filtro === 'ativas') b = b.eq('ativo', true)
    else if (f.filtro === 'arquivadas') b = b.eq('ativo', false)
    else if (f.filtro === 'sistema') b = b.eq('sistema', true)
    else if (f.filtro === 'personalizadas') b = b.eq('sistema', false)
    b = b.order(f.sort, { ascending: f.dir === 'asc' })
    if (f.sort !== 'slug') b = b.order('slug', { ascending: true }) // desempate por coluna única (paginação estável)
    return b.range(from, from + f.pp - 1) as never
  })
  if (!r) return { linhas: [], total: 0, semModeloBase: false, migracaoPendente: true, usoIndisponivel: false }
  const linhas = r.data.map(deLinha)
  const usos = await usoDasClassificacoes(tenantId, linhas)
  for (const l of linhas) l.uso = usos.get(l.id) ?? null
  // Modelo-base ausente? (consulta barata: só conta os de sistema do tenant)
  const { count: nSis } = await svc.from(T).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('sistema', true)
  return {
    linhas, total: r.count ?? linhas.length, semModeloBase: (nSis ?? 0) < TIPOS_SISTEMA.length, migracaoPendente: false,
    usoIndisponivel: linhas.length > 0 && linhas.every((l) => l.uso === null),
  }
}

export async function lerPorId(svc: SupabaseClient, tenantId: string, id: string): Promise<LinhaTipoGestao | null> {
  const r = await comColunas<LinhaBruta[]>((cols) => svc.from(T).select(cols).eq('tenant_id', tenantId).eq('id', id).limit(1) as never)
  return r?.data[0] ? deLinha(r.data[0]) : null
}

async function slugsDoTenant(svc: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const rows = await fetchAll<{ slug: string }>(() => svc.from(T).select('slug').eq('tenant_id', tenantId).order('slug') as never)
  return new Set(rows.map((r) => r.slug))
}

// ───────────── Invalidação ─────────────
export async function invalidarClassificacao(tenantId: string): Promise<void> {
  await Promise.all([
    esquecerClassificacao(tenantId), esquecerCatalogoTipos(tenantId), invalidarCachesPaginas(tenantId),
    esquecer(`crono-metas:discsem:${tenantId}`),
  ].map((p) => p.catch(() => {})))
  try { revalidatePath('/admin/biblioteca/classificacao'); revalidatePath('/admin/biblioteca'); revalidatePath('/admin/cronogramas/adaptativo/catalogo') } catch { /* fora de request */ }
}

const doAudit = (tenantId: string, atorId: string | null, op: 'INSERT' | 'UPDATE' | 'DELETE', id: string, antes: object | null, depois: object | null) =>
  registrarAudit({ operacao: op, entidade: T, entidadeId: id, tenantId, atorId, antes: antes as never, depois: depois as never }).catch(() => {})

function erroEscrita(e: unknown): { status: 409 | 500 | 503; error: string } {
  const er = (isErro(e) ? e : {}) as Erro
  if (er.code === '23505') return { status: 409, error: 'Já existe uma classificação com esse identificador (slug).' }
  if (tabelaTiposAusente(er)) return { status: 503, error: MSG_MIGRACAO }
  return { status: 500, error: er.message || 'Falha ao gravar.' }
}

// ───────────── Criar / duplicar / semear ─────────────
export async function criarTipoGestao(svc: SupabaseClient, tenantId: string, atorId: string | null, entrada: CriarTipo): Promise<Resultado<{ id: string; slug: string }>> {
  const usados = await slugsDoTenant(svc, tenantId)
  let origem: LinhaTipoGestao | null = null
  if (entrada.duplicarDe) {
    origem = await lerPorId(svc, tenantId, entrada.duplicarDe)
    if (!origem) return falha(404, 'Classificação de origem não encontrada.')
  } else if (entrada.modelo) {
    const base = TIPOS_SISTEMA.find((t) => t.slug === entrada.modelo)
    const doTenant = (await svc.from(T).select('id').eq('tenant_id', tenantId).eq('slug', entrada.modelo).limit(1)).data?.[0] as { id: string } | undefined
    origem = doTenant ? await lerPorId(svc, tenantId, doTenant.id) : null
    if (!origem && base) {
      origem = { id: '', slug: base.slug, nome: base.nome, nomeAluno: base.nomeAluno, cor: base.cor, papel: base.papel, prioridade: base.prioridade, ordem: base.ordem, ativo: true, sistema: true, descricao: base.descricao, versao: 1, geraMeta: false, exibicao: lerExibicao({}), uso: null }
    }
    if (!origem) return falha(404, 'Modelo não encontrado.')
  }
  const slugPedido = entrada.slug ?? slugDeNome(entrada.nome)
  if (entrada.slug && (usados.has(entrada.slug) || SLUGS_SISTEMA.includes(entrada.slug))) return falha(409, 'Esse identificador (slug) já existe.')
  const slug = entrada.slug ?? slugLivre(slugPedido, usados)
  const cor = corValida(entrada.cor ?? origem?.cor ?? null, origem?.cor ?? null)
  if (cor === undefined) return falha(400, 'Cor inválida: escolha um token da paleta.')
  const row: Record<string, unknown> = {
    tenant_id: tenantId, slug, nome: entrada.nome, nome_aluno: entrada.nomeAluno?.trim() || origem?.nomeAluno || null, cor,
    papel: entrada.papel ?? origem?.papel ?? 'generico', prioridade: origem?.prioridade ?? 20, ordem: (origem?.ordem ?? 99) + 1,
    ativo: true, sistema: false, descricao: entrada.descricao?.trim() || origem?.descricao || null, versao: 1,
  }
  if (origem?.exibicao) row.exibicao = origem.exibicao
  if (origem?.geraMeta && row.papel === 'generico') row.gera_meta = true
  let { data, error } = await svc.from(T).insert(row).select('id, slug')
  if (error && /gera_meta/i.test((error as Erro).message ?? '')) { delete row.gera_meta; ({ data, error } = await svc.from(T).insert(row).select('id, slug')) }
  if (error) { const e = erroEscrita(error); return falha(e.status, e.error) }
  const novo = (data ?? [])[0] as { id: string; slug: string }
  await doAudit(tenantId, atorId, 'INSERT', novo.id, null, row)
  await invalidarClassificacao(tenantId)
  return { ok: true, id: novo.id, slug: novo.slug }
}

/** Cria as linhas do modelo-base que faltam (6 de sistema). Idempotente (ignora as que existem). */
export async function semearModeloBase(svc: SupabaseClient, tenantId: string, atorId: string | null): Promise<Resultado<{ criadas: number }>> {
  const usados = await slugsDoTenant(svc, tenantId)
  const faltam = TIPOS_SISTEMA.filter((t) => !usados.has(t.slug))
  if (!faltam.length) return { ok: true, criadas: 0 }
  const rows = faltam.map((t) => ({ tenant_id: tenantId, slug: t.slug, nome: t.nome, nome_aluno: t.nomeAluno, cor: null, papel: t.papel, prioridade: t.prioridade, ordem: t.ordem, ativo: true, sistema: true, descricao: t.descricao, versao: 1 }))
  const { error } = await svc.from(T).insert(rows)
  if (error) { const e = erroEscrita(error); return falha(e.status, e.error) }
  await doAudit(tenantId, atorId, 'INSERT', tenantId, null, { modeloBase: faltam.map((t) => t.slug) })
  await invalidarClassificacao(tenantId)
  return { ok: true, criadas: faltam.length }
}

// ───────────── Editar ─────────────
export async function editarTipoGestao(svc: SupabaseClient, tenantId: string, atorId: string | null, id: string, patch: EdicaoTipo, versaoEsperada?: number): Promise<Resultado<{ tipo: LinhaTipoGestao }>> {
  const atual = await lerPorId(svc, tenantId, id)
  if (!atual) return falha(404, 'Classificação não encontrada.')
  if (versaoEsperada != null && versaoEsperada !== atual.versao) return falha(409, 'Esta classificação foi alterada por outra pessoa. Recarregue e tente de novo.')
  if (atual.sistema && patch.papel !== undefined && patch.papel !== atual.papel) return falha(400, 'O papel de uma classificação do sistema não pode ser alterado.')
  const col: Record<string, unknown> = {}
  if (patch.nome !== undefined) col.nome = patch.nome
  if (patch.nomeAluno !== undefined) col.nome_aluno = patch.nomeAluno?.trim() || null
  if (patch.descricao !== undefined) col.descricao = patch.descricao?.trim() || null
  if (patch.cor !== undefined) {
    const c = corValida(patch.cor, atual.cor)
    if (c === undefined) return falha(400, 'Cor inválida: escolha um token da paleta.')
    col.cor = c
  }
  if (patch.papel !== undefined && !atual.sistema) col.papel = patch.papel
  if (patch.prioridade !== undefined) col.prioridade = patch.prioridade
  if (patch.ordem !== undefined) col.ordem = patch.ordem
  if (patch.ativo !== undefined) col.ativo = patch.ativo
  const papelFinal = (col.papel as string | undefined) ?? atual.papel
  if (patch.geraMeta !== undefined) {
    if (patch.geraMeta && (atual.sistema || papelFinal !== 'generico')) return falha(400, 'Só classificações personalizadas de papel "Genérico" podem gerar meta própria.')
    if (patch.geraMeta !== atual.geraMeta) col.gera_meta = patch.geraMeta
  } else if (!atual.sistema && papelFinal !== 'generico' && atual.geraMeta) col.gera_meta = false
  if (patch.exibicao !== undefined) {
    const mesclada = ExibicaoClassificacaoSchema.safeParse({ ...atual.exibicao, ...patch.exibicao, indice: { ...atual.exibicao.indice, ...(patch.exibicao.indice ?? {}) } })
    if (!mesclada.success) return falha(400, 'Exibição inválida: ' + (mesclada.error.issues[0]?.message ?? 'verifique os campos.'))
    col.exibicao = mesclada.data
  }
  if (!Object.keys(col).length) return falha(400, 'Nada a alterar.')
  const { data, error } = await svc.from(T).update({ ...col, versao: atual.versao + 1 }).eq('tenant_id', tenantId).eq('id', id).eq('versao', atual.versao).select('id')
  if (error) { const e = erroEscrita(error); return falha(e.status, e.error) }
  if (!data?.length) return falha(409, 'Esta classificação foi alterada por outra pessoa. Recarregue e tente de novo.')
  await doAudit(tenantId, atorId, 'UPDATE', id, { slug: atual.slug, nome: atual.nome, cor: atual.cor, papel: atual.papel, ativo: atual.ativo, ordem: atual.ordem, prioridade: atual.prioridade, exibicao: atual.exibicao }, { slug: atual.slug, ...col })
  await invalidarClassificacao(tenantId)
  const tipo = (await lerPorId(svc, tenantId, id)) ?? atual
  const uso = await usoDasClassificacoes(tenantId, [tipo])
  tipo.uso = uso.get(tipo.id) ?? null
  return { ok: true, tipo }
}

export async function reordenarTipos(svc: SupabaseClient, tenantId: string, atorId: string | null, itens: { id: string; ordem: number }[]): Promise<Resultado<{ alterados: number }>> {
  let n = 0
  for (let i = 0; i < itens.length; i += 20) { // lotes pequenos: 1 UPDATE por linha, sem estourar o pool
    const lote = itens.slice(i, i + 20)
    const rs = await Promise.all(lote.map((it) => svc.from(T).update({ ordem: it.ordem }).eq('tenant_id', tenantId).eq('id', it.id)))
    const e = rs.find((r) => r.error)?.error
    if (e) { const x = erroEscrita(e); return falha(x.status, x.error) }
    n += lote.length
  }
  await doAudit(tenantId, atorId, 'UPDATE', tenantId, null, { reordenar: itens })
  await invalidarClassificacao(tenantId)
  return { ok: true, alterados: n }
}

// ───────────── Arquivar / apagar ─────────────
export async function removerTipoGestao(svc: SupabaseClient, tenantId: string, atorId: string | null, id: string, modo: 'arquivar' | 'apagar'): Promise<Resultado<{ modo: string; regrasRemovidas?: number }>> {
  const atual = await lerPorId(svc, tenantId, id)
  if (!atual) return falha(404, 'Classificação não encontrada.')
  if (modo === 'arquivar') {
    const r = await editarTipoGestao(svc, tenantId, atorId, id, { ativo: false })
    return r.ok ? { ok: true, modo: 'arquivada' } : r
  }
  const uso = (await usoDasClassificacoes(tenantId, [atual])).get(id) ?? null
  const dec = podeApagar(atual, uso)
  if (!dec.ok) return falha(409, dec.motivo)
  const { error } = await svc.from(T).delete().eq('tenant_id', tenantId).eq('id', id).eq('sistema', false)
  if (error) { const e = erroEscrita(error); return falha(e.status, e.error) }
  await doAudit(tenantId, atorId, 'DELETE', id, { slug: atual.slug, nome: atual.nome, papel: atual.papel, exibicao: atual.exibicao }, { regrasRemovidas: dec.avisoRegras })
  await invalidarClassificacao(tenantId)
  return { ok: true, modo: 'apagada', regrasRemovidas: dec.avisoRegras }
}

// ───────────── Matriz de regras de uso ─────────────
export interface CelulaRegras {
  /** regras gravadas (parciais) nesta área × classificação */
  definidas: RegrasOverride
  versao: number
  /** regras efetivas (cascata área > padrão do motor > padrão interno) */
  efetivas: RegrasUso
  origem: Record<string, OrigemRegra>
  /** minutos do documento de exemplo, calculado no servidor (null = não calculável / modo manual) */
  minutos: number | null
}
export interface MatrizRegras {
  areas: { id: AreaClassificacao; nome: string; desc: string }[]
  classificacoes: { id: string; slug: string; nome: string; cor: string | null; papel: PapelTipo; ativo: boolean }[]
  /** chave `${area}:${classificacaoId}` */
  celulas: Record<string, CelulaRegras>
  /** padrão do motor por área (valor ao herdar, já com o padrão interno por baixo) */
  padraoPorArea: Record<string, RegrasUso>
  medidas: Required<{ [K in keyof Medidas]: number | null }>
  migracaoPendente: boolean
}
export const MEDIDAS_EXEMPLO: MatrizRegras['medidas'] = { paginas: 20, palavras: 6000, artigos: 20, caracteres: 36000 }

function celula(area: AreaClassificacao, gravado: unknown, versao: number, medidas: Medidas): CelulaRegras {
  const r = resolverRegras({ usoAreaClassificacao: gravado, padraoMotor: PADRAO_MOTOR_POR_AREA[area] })
  return { definidas: lerRegrasParciais(gravado), versao, efetivas: r.regras, origem: r.origem as Record<string, OrigemRegra>, minutos: calcularMinutos(r.regras, medidas) }
}

async function lerRegrasGravadas(svc: SupabaseClient, tenantId: string): Promise<Map<string, { regras: unknown; versao: number }> | null> {
  try {
    const rows = await fetchAll<{ area: string; classificacao_id: string; regras: unknown; versao: number | null }>(() =>
      svc.from(T_REGRAS).select('area, classificacao_id, regras, versao').eq('tenant_id', tenantId).order('id', { ascending: true }) as never)
    return new Map(rows.map((r) => [`${r.area}:${r.classificacao_id}`, { regras: r.regras, versao: r.versao ?? 1 }]))
  } catch (e) {
    if (tabelaTiposAusente(e as Erro)) return null
    throw e
  }
}

export async function carregarMatrizRegras(svc: SupabaseClient, tenantId: string, medidas: Medidas = MEDIDAS_EXEMPLO, opts: { soClassificacaoId?: string } = {}): Promise<MatrizRegras> {
  const tipos = await comColunas<LinhaBruta[]>((cols) => svc.from(T).select(cols).eq('tenant_id', tenantId).order('ordem', { ascending: true }).order('slug', { ascending: true }).range(0, 999) as never)
  const gravadas = await lerRegrasGravadas(svc, tenantId)
  const med = { ...MEDIDAS_EXEMPLO, ...medidas } as MatrizRegras['medidas']
  // Página da classificação: só a dela (mesmo arquivada, para poder revisar as regras); matriz geral: só as ativas.
  const classes = (tipos?.data ?? []).map(deLinha).filter((t) => (opts.soClassificacaoId ? t.id === opts.soClassificacaoId : t.ativo))
  const celulas: Record<string, CelulaRegras> = {}
  for (const a of AREAS_CLASSIFICACAO) for (const c of classes) {
    const g = gravadas?.get(`${a.id}:${c.id}`)
    celulas[`${a.id}:${c.id}`] = celula(a.id, g?.regras ?? {}, g?.versao ?? 0, med)
  }
  const padraoPorArea: Record<string, RegrasUso> = {}
  for (const a of AREAS_CLASSIFICACAO) padraoPorArea[a.id] = resolverRegras({ padraoMotor: PADRAO_MOTOR_POR_AREA[a.id] }).regras
  return {
    areas: AREAS_CLASSIFICACAO.map((a) => ({ ...a })),
    classificacoes: classes.map((c) => ({ id: c.id, slug: c.slug, nome: c.nome, cor: c.cor, papel: c.papel, ativo: c.ativo })),
    celulas, padraoPorArea, medidas: med, migracaoPendente: !tipos || !gravadas,
  }
}

export interface PreviaRegra {
  area: AreaClassificacao; classificacaoId: string; classificacao: string
  minutosAntes: number | null; minutosDepois: number | null
  /** campos que mudam: [campo, valor antes (efetivo), valor depois (efetivo)] */
  campos: { campo: string; antes: unknown; depois: unknown }[]
  limpar: boolean
}

export async function salvarRegrasLote(svc: SupabaseClient, tenantId: string, atorId: string | null,
  alteracoes: AlteracaoRegras[], opts: { dryRun?: boolean; medidas?: Medidas } = {}): Promise<Resultado<{ previa: PreviaRegra[]; aplicadas: number; removidas: number }>> {
  const tipos = await comColunas<LinhaBruta[]>((cols) => svc.from(T).select(cols).eq('tenant_id', tenantId).order('id', { ascending: true }).range(0, 999) as never)
  if (!tipos) return falha(503, MSG_MIGRACAO)
  const nomePorId = new Map(tipos.data.map((t) => [t.id, t.nome || t.slug]))
  const grupos = agruparAlteracoes(alteracoes)
  for (const g of grupos.values()) if (!nomePorId.has(g.classificacaoId)) return falha(400, 'Classificação inexistente neste tenant.')
  const gravadas = await lerRegrasGravadas(svc, tenantId)
  if (!gravadas) return falha(503, MSG_MIGRACAO)
  const medidas = { ...MEDIDAS_EXEMPLO, ...(opts.medidas ?? {}) } as Medidas

  const previa: PreviaRegra[] = []
  const gravar: { area: AreaClassificacao; classificacaoId: string; regras: RegrasOverride; versao: number; antes: unknown }[] = []
  const apagar: { area: AreaClassificacao; classificacaoId: string; antes: unknown }[] = []
  for (const g of grupos.values()) {
    const area = g.area as AreaClassificacao
    const atual = gravadas.get(`${g.area}:${g.classificacaoId}`)
    const novo = aplicarPatchRegras(atual?.regras ?? {}, g.patch, g.limpar)
    const antesC = celula(area, atual?.regras ?? {}, atual?.versao ?? 0, medidas)
    const depoisC = celula(area, regrasVazias(novo) ? {} : { versao: 1, ...novo }, atual?.versao ?? 0, medidas)
    const campos = CAMPOS_REGRA.map((c) => {
      const [gr, k] = c.split('.') as ['tempo' | 'meta', string]
      return { campo: c, antes: (antesC.efetivas[gr] as Record<string, unknown>)[k], depois: (depoisC.efetivas[gr] as Record<string, unknown>)[k] }
    }).filter((x) => x.antes !== x.depois)
    previa.push({ area, classificacaoId: g.classificacaoId, classificacao: nomePorId.get(g.classificacaoId) ?? '', minutosAntes: antesC.minutos, minutosDepois: depoisC.minutos, campos, limpar: g.limpar })
    if (regrasVazias(novo)) { if (atual) apagar.push({ area, classificacaoId: g.classificacaoId, antes: atual.regras }) }
    else gravar.push({ area, classificacaoId: g.classificacaoId, regras: { ...novo, versao: 1 }, versao: (atual?.versao ?? 0) + 1, antes: atual?.regras ?? null })
  }
  if (opts.dryRun) return { ok: true, previa, aplicadas: 0, removidas: 0 }

  for (let i = 0; i < gravar.length; i += 80) {
    const lote = gravar.slice(i, i + 80).map((g) => ({ tenant_id: tenantId, area: g.area, classificacao_id: g.classificacaoId, regras: g.regras, versao: g.versao }))
    const { error } = await svc.from(T_REGRAS).upsert(lote, { onConflict: 'tenant_id,area,classificacao_id' })
    if (error) { const e = erroEscrita(error); return falha(e.status, e.error) }
  }
  for (const a of apagar) {
    const { error } = await svc.from(T_REGRAS).delete().eq('tenant_id', tenantId).eq('area', a.area).eq('classificacao_id', a.classificacaoId)
    if (error) { const e = erroEscrita(error); return falha(e.status, e.error) }
  }
  // 1 evento por classificação (entidade_id = id da classificação): o Histórico da página da classificação encontra por ele.
  const porClasse = new Map<string, { antes: unknown[]; depois: unknown[]; removidas: unknown[] }>()
  const bucket = (id: string) => { let b = porClasse.get(id); if (!b) { b = { antes: [], depois: [], removidas: [] }; porClasse.set(id, b) } return b }
  for (const x of [...gravar, ...apagar]) bucket(x.classificacaoId).antes.push({ area: x.area, regras: x.antes })
  for (const x of gravar) bucket(x.classificacaoId).depois.push({ area: x.area, regras: x.regras })
  for (const x of apagar) bucket(x.classificacaoId).removidas.push({ area: x.area })
  for (const [cid, b] of porClasse) {
    await registrarAudit({
      operacao: 'UPDATE', entidade: T_REGRAS, entidadeId: cid, tenantId, atorId,
      antes: { celulas: b.antes } as never, depois: { classificacaoId: cid, celulas: b.depois, removidas: b.removidas } as never,
    }).catch(() => {})
  }
  await invalidarClassificacao(tenantId)
  return { ok: true, previa, aplicadas: gravar.length, removidas: apagar.length }
}

