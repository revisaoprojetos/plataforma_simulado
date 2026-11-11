import 'server-only'
import { createHash } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { sqlQuery } from '@/lib/data/sql'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { esquecer, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { unificarDisciplinas, desfazerUnificacao } from '@/app/admin/questoes/disciplinas-actions'
import { itensTaxonomia, limparCacheGestao } from './biblioteca-questoes-gestao'
import { limparCacheQuestoes } from './biblioteca-questoes'
import { deteccaoCache, invalidarDeteccao } from './cache-deteccao'
import { plano } from './texto-plano'
import { chaveDoGrupo, detectarGrupos, proporLote, tidy } from './questoes-termos-deteccao'
import type {
  ConfTermo, ExemploQuestao, GrupoTermo, InicialTermos, MesclagemLog, PreviaMescla, ProporNorm, RespostaGruposTermos, RespostaNorm, RespostaResumosTermos, ResumoTipoTermo, TipoTermo, VarianteTermo,
} from './questoes-termos-tipos'
import { TIPOS_TERMO } from './questoes-termos-tipos'

// UNIFICAR › TERMOS DA TAXONOMIA (somente servidor).
// Mapa dos campos: disciplina/assunto/banca/órgão = TABELA própria + FK em simulado_questoes (mesclar = repontar a FK e remover a variante vazia);
// cargo e assunto específico = TEXTO LIVRE na questão (mesclar = trocar o valor); ano = número (sem variantes de texto → só consulta).
// Mesclagem de tabela/texto roda em UMA transação SQL (BEGIN/COMMIT, pool próprio) e grava o estado anterior em simulado_termos_mesclagens
// (migration 20261113060000) para DESFAZER; sem a tabela ainda mescla (com aviso "sem desfazer"). Disciplina delega à RPC atômica existente
// (simulado_unificar_disciplinas, com log/desfazer próprios). Isolamento: o pool ignora RLS → TODA instrução filtra tenant_id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TTL = 5 * 60_000
export function limparCacheTermos(tenantId: string) {
  invalidarDeteccao(`termos:${tenantId}`)
  limparCacheGestao(tenantId); limparCacheQuestoes(tenantId)
  for (const t of TIPOS_TERMO) void esquecer(chaveRelatorio(tenantId, 'taxonomia', t.id)).catch(() => {})
}

const ENT = {
  disciplina: { tabela: 'simulado_disciplinas', fk: 'disciplina_id' },
  assunto: { tabela: 'simulado_assuntos', fk: 'assunto_id' },
  banca: { tabela: 'simulado_bancas', fk: 'banca_id' },
  orgao: { tabela: 'simulado_orgaos', fk: 'orgao_id' },
} as const
const TXT = { cargo: 'cargo', assunto_detalhe: 'assunto_detalhe' } as const
const ehEnt = (t: TipoTermo): t is keyof typeof ENT => t in ENT
const ehTxt = (t: TipoTermo): t is keyof typeof TXT => t in TXT
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16)
const ptbr = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
const pedacos = <T,>(a: T[], n = 80) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

// ───────────────────────── pool / transação ─────────────────────────
let pool: Pool | null = null
function getPool(): Pool | null {
  const url = process.env.DATABASE_URL
  if (!url || process.env.REPORT_SQL === 'off') return null
  if (!pool) { pool = new Pool({ connectionString: url, max: 2, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 8_000, ssl: { rejectUnauthorized: false } }); pool.on('error', () => {}) }
  return pool
}
export const sqlTxDisponivel = () => !!getPool()
export async function emTransacao<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const p = getPool(); if (!p) throw new Error('Mesclagem exige conexão SQL direta (DATABASE_URL) — indisponível neste ambiente.')
  const c = await p.connect()
  try {
    await c.query('BEGIN')
    await c.query("SET LOCAL statement_timeout = '60s'")
    const r = await fn(c)
    await c.query('COMMIT')
    return r
  } catch (e) { try { await c.query('ROLLBACK') } catch { /* ignore */ } throw e } finally { c.release() }
}
export class ErroNegocio extends Error {}
export const falha = (m: string): never => { throw new ErroNegocio(m) }

async function tabelaExiste(nome: string): Promise<boolean> {
  const r = await sqlQuery<any>('select to_regclass($1) is not null as ok', [`public.${nome}`])
  return !!r?.[0]?.ok
}

// ───────────────────────── ignorados ─────────────────────────
/** TODOS os tipos numa única consulta (antes: 1 ida e volta por tipo = 7 nos resumos), com single-flight e cache de 60 s. */
async function ignoradosTodos(svc: SupabaseClient, tenantId: string, fresh: boolean): Promise<Map<string, Set<string>> | null> {
  return deteccaoCache(`termos:${tenantId}|ign`, async () => {
    const { data, error } = await svc.from('simulado_termos_ignorados').select('tipo, chave').eq('tenant_id', tenantId).order('chave', { ascending: true }).range(0, 4999)
    if (error) return null
    const m = new Map<string, Set<string>>()
    for (const x of (data ?? []) as any[]) (m.get(String(x.tipo)) ?? m.set(String(x.tipo), new Set()).get(String(x.tipo))!).add(String(x.chave))
    return m
  }, { ttl: 60_000, stale: 0, fresh })
}
async function ignoradosDoTipo(svc: SupabaseClient, tenantId: string, tipo: TipoTermo, fresh: boolean): Promise<Set<string> | null> {
  const m = await ignoradosTodos(svc, tenantId, fresh)
  return m === null ? null : m.get(tipo) ?? new Set()
}

// ───────────────────────── grupos de candidatos ─────────────────────────
type BaseGrupos = { grupos: GrupoTermo[]; itens: number; questoes: number; degradado: boolean }
async function todosOsGrupos(svc: SupabaseClient, tenantId: string, tipo: TipoTermo, limiar: number, fresh: boolean): Promise<BaseGrupos> {
  // single-flight + stale-while-revalidate: a detecção roda 1× por (tenant, tipo, limiar), mesmo com chamadas simultâneas
  return deteccaoCache<BaseGrupos>(`termos:${tenantId}|${tipo}|${limiar}`, async () => {
    const { itens, degradado } = await itensTaxonomia(svc, tenantId, tipo as any, fresh)
    const vars: VarianteTermo[] = itens.map((i) => ({ id: i.id, nome: i.nome, questoes: i.questoes, assuntos: tipo === 'disciplina' ? i.extra : undefined, paiId: i.paiId ?? null, paiNome: i.paiNome ?? null }))
    const brutos = detectarGrupos(vars, { tipo, limiar, escopo: tipo === 'assunto' ? (v) => v.paiId ?? '' : undefined })
    const grupos: GrupoTermo[] = brutos.map((g) => ({
      id: hash(chaveDoGrupo(tipo, g.variantes)), tipo, confianca: g.confianca, score: g.score, motivo: g.motivo, variantes: g.variantes, canonicaId: g.canonicaId,
      nomeSugerido: tidy(g.variantes.find((v) => v.id === g.canonicaId)!.nome), questoes: g.questoes,
    }))
    return { grupos, itens: itens.length, questoes: itens.reduce((s, i) => s + i.questoes, 0), degradado }
  }, { fresh })
}

export interface OpcLista { limiar?: number; confianca?: string; q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; pp?: number; verIgnorados?: boolean; ign?: string[]; fresh?: boolean }
export async function listarGrupos(svc: SupabaseClient, tenantId: string, tipo: TipoTermo, o: OpcLista): Promise<RespostaGruposTermos> {
  const limiar = Math.min(0.98, Math.max(0.6, o.limiar ?? 0.85))
  const [base, ignBanco] = await Promise.all([todosOsGrupos(svc, tenantId, tipo, limiar, !!o.fresh), ignoradosDoTipo(svc, tenantId, tipo, !!o.fresh)])
  const ign = new Set<string>([...(ignBanco ?? []), ...(o.ign ?? [])])
  const visiveis = base.grupos.filter((g) => o.verIgnorados ? ign.has(g.id) : !ign.has(g.id))
  const porConfianca: Record<ConfTermo, number> = { alta: 0, media: 0, baixa: 0 }
  for (const g of base.grupos) if (!ign.has(g.id)) porConfianca[g.confianca]++
  const termo = plano(o.q ?? '')
  let l = visiveis.filter((g) => (!o.confianca || g.confianca === o.confianca) && (!termo || g.variantes.some((v) => plano(v.nome).includes(termo) || plano(v.paiNome ?? '').includes(termo))))
  const dir = o.dir === 'asc' ? 1 : -1 // padrão: maior primeiro (nome: use dir=asc)
  const sort = o.sort ?? 'questoes'
  if (sort !== 'confianca') {
    l = [...l].sort((a, b) => {
      const c = sort === 'score' ? a.score - b.score : sort === 'variantes' ? a.variantes.length - b.variantes.length : sort === 'nome' ? ptbr(a.variantes[0].nome, b.variantes[0].nome) : a.questoes - b.questoes
      return (c * dir) || (a.id < b.id ? -1 : 1)
    })
  }
  const pp = Math.min(100, Math.max(5, o.pp ?? 20)), page = Math.max(1, o.page ?? 1)
  const ativos = base.grupos.filter((g) => !ign.has(g.id))
  const resumo: ResumoTipoTermo = { tipo, termos: base.itens, questoes: base.questoes, grupos: ativos.length, variantesEmGrupos: ativos.reduce((s, g) => s + g.variantes.length, 0), questoesEmGrupos: ativos.reduce((s, g) => s + g.questoes, 0) }
  return { ok: true, tipo, grupos: l.slice((page - 1) * pp, page * pp), total: l.length, page, pp, porConfianca, limiar, resumo, ignorados: base.grupos.filter((g) => ign.has(g.id)).length, ignoradoPersistente: ignBanco !== null, geradoEm: Date.now(), degradado: base.degradado }
}

export async function resumosTodosTipos(svc: SupabaseClient, tenantId: string, limiar: number, ign: Record<string, string[]>, fresh: boolean): Promise<RespostaResumosTermos> {
  const lim = Math.min(0.98, Math.max(0.6, limiar || 0.85))
  const resumos = await Promise.all(TIPOS_TERMO.map(async (t): Promise<ResumoTipoTermo> => {
    const [b, ig] = await Promise.all([todosOsGrupos(svc, tenantId, t.id, lim, fresh), ignoradosDoTipo(svc, tenantId, t.id, fresh)])
    const s = new Set<string>([...(ig ?? []), ...(ign[t.id] ?? [])])
    const a = b.grupos.filter((g) => !s.has(g.id))
    return { tipo: t.id, termos: b.itens, questoes: b.questoes, grupos: a.length, variantesEmGrupos: a.reduce((x, g) => x + g.variantes.length, 0), questoesEmGrupos: a.reduce((x, g) => x + g.questoes, 0) }
  }))
  return { ok: true, resumos, geradoEm: Date.now() }
}

/** SSR: resumo por tipo (abas) + grupos do tipo padrão — uma carga só, sobre a detecção em cache (single-flight). */
export const TIPO_TERMO_PADRAO: TipoTermo = 'banca'
export async function carregarInicialTermos(tenantId: string): Promise<InicialTermos | null> {
  try {
    const svc = createAdminClient()
    const [resumos, grupos] = await Promise.all([
      resumosTodosTipos(svc, tenantId, 0.85, {}, false),
      listarGrupos(svc, tenantId, TIPO_TERMO_PADRAO, { limiar: 0.85, sort: 'questoes', dir: 'desc', page: 1, pp: 20, ign: [] }),
    ])
    return { resumos, grupos }
  } catch { return null }
}

/** Distribuição de anos (ano é número: sem variantes de texto, só consulta; destaca valores implausíveis). */
export async function listarAnos(tenantId: string): Promise<{ ok: boolean; itens: { ano: number; questoes: number; suspeito: boolean }[] }> {
  const r = await sqlQuery<any>('select ano, count(*)::int as n from simulado_questoes where tenant_id = $1 and deletado = false and ano is not null group by 1 order by 1 desc', [tenantId]) ?? []
  const max = new Date().getFullYear() + 1
  return { ok: true, itens: r.map((x) => ({ ano: Number(x.ano), questoes: x.n, suspeito: Number(x.ano) < 1990 || Number(x.ano) > max })) }
}

// ───────────────────────── exemplos de questões ─────────────────────────
export async function exemplosDoTermo(svc: SupabaseClient, tenantId: string, tipo: TipoTermo, id: string, limite = 3): Promise<ExemploQuestao[]> {
  let q = svc.from('simulado_questoes').select('id, codigo, enunciado').eq('tenant_id', tenantId).eq('deletado', false)
  if (ehEnt(tipo)) { if (!UUID.test(id)) return []; q = q.eq(ENT[tipo].fk, id) } else if (ehTxt(tipo)) q = q.eq(TXT[tipo], id); else return []
  const { data } = await q.order('id', { ascending: true }).limit(limite)
  return ((data ?? []) as any[]).map((x) => ({ id: x.id, codigo: x.codigo ?? null, enunciado: String(x.enunciado ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220) }))
}

// ───────────────────────── validação de entrada ─────────────────────────
interface Entrada { tipo: TipoTermo; canonicaId: string; dupIds: string[]; nomeFinal: string }
function validar(tipo: TipoTermo, canonicaId: string, dupIdsRaw: unknown, nomeFinalRaw: unknown): Entrada {
  if (!TIPOS_TERMO.find((t) => t.id === tipo)?.mesclavel) falha('Este tipo de termo não pode ser mesclado.')
  const canon = String(canonicaId ?? '')
  const dups = [...new Set((Array.isArray(dupIdsRaw) ? dupIdsRaw : []).map((x) => String(x)).filter((x) => x && x !== canon))]
  if (!canon || !dups.length) falha('Escolha o termo a manter e ao menos uma variante.')
  if (dups.length > 40) falha('Máximo de 40 variantes por mesclagem.')
  if (ehEnt(tipo) && ![canon, ...dups].every((x) => UUID.test(x))) falha('Identificador inválido.')
  const nome = tidy(String(nomeFinalRaw ?? ''))
  if (nome.length > 200) falha('Nome muito longo (máx. 200).')
  return { tipo, canonicaId: canon, dupIds: dups, nomeFinal: nome }
}

// ───────────────────────── prévia do impacto ─────────────────────────
const OUTRAS_TABELAS_DISC: [string, string][] = [
  ['simulado_pastas', 'Pastas da Biblioteca ligadas à disciplina'], ['simulado_cronograma_conjuntos', 'Conjuntos do cronograma'], ['simulado_cronograma_links', 'Links do cronograma'],
  ['simulado_cronograma_metas', 'Metas do cronograma'], ['simulado_duvidas', 'Dúvidas dos alunos'], ['simulado_respostas_avulsas', 'Respostas avulsas'],
]

export async function previaMescla(svc: SupabaseClient, tenantId: string, tipo: TipoTermo, canonicaId: string, dupIdsRaw: unknown, nomeFinalRaw: unknown): Promise<PreviaMescla> {
  let e: Entrada
  try { e = validar(tipo, canonicaId, dupIdsRaw, nomeFinalRaw) } catch (x: any) { return vazia(tipo, x.message) }
  const todos = [e.canonicaId, ...e.dupIds]
  const avisos: string[] = []
  let podeDesfazer = false
  let variantes: PreviaMescla['variantes'] = []
  let canonNome = e.canonicaId
  const impacto: PreviaMescla['impacto'] = { questoes: 0, assuntos: 0, assuntosColididos: 0, simulados: 0, bancos: 0, respostas: 0, conteudos: [], removidas: 0, mantidas: 0 }

  if (ehEnt(tipo)) {
    const { tabela, fk } = ENT[tipo]
    const rows = await sqlQuery<any>(`select t.id::text as id, t.nome, ${tipo === 'assunto' ? 't.disciplina_id::text as disc, t.pai_id::text as pai' : "null as disc, null as pai"},
        (select count(*) from simulado_questoes q where q.tenant_id = $1 and q.deletado = false and q.${fk} = t.id)::int as q,
        (select count(*) from simulado_questoes q where q.tenant_id = $1 and q.deletado = true and q.${fk} = t.id)::int as lixeira
        from ${tabela} t where t.tenant_id = $1 and t.id = any($2::uuid[])`, [tenantId, todos])
    if (!rows) return vazia(tipo, 'Não foi possível consultar o banco agora.')
    if (rows.length !== todos.length) return vazia(tipo, 'Algum termo não foi encontrado (já mesclado ou removido). Recarregue a lista.')
    const por = new Map(rows.map((r) => [r.id, r]))
    canonNome = por.get(e.canonicaId)!.nome
    variantes = e.dupIds.map((id) => ({ id, nome: por.get(id)!.nome, questoes: por.get(id)!.q }))
    impacto.questoes = variantes.reduce((s, v) => s + v.questoes, 0)
    const lix = e.dupIds.reduce((s, id) => s + (por.get(id)!.lixeira ?? 0), 0)
    if (lix) avisos.push(`${lix} questão(ões) na lixeira também passam a usar “${e.nomeFinal || canonNome}”.`)
    if (tipo === 'assunto') {
      const discs = new Set(rows.map((r) => r.disc))
      if (discs.size > 1) return vazia(tipo, 'Assuntos de disciplinas diferentes não podem ser mesclados (mova-os para a mesma disciplina antes).')
      const f = await sqlQuery<any>('select count(*)::int as n from simulado_assuntos where tenant_id = $1 and pai_id = any($2::uuid[])', [tenantId, e.dupIds])
      impacto.assuntos = f?.[0]?.n ?? 0
    }
    if (tipo === 'disciplina') {
      const a = await sqlQuery<any>('select id::text as id, nome, disciplina_id::text as disc from simulado_assuntos where tenant_id = $1 and disciplina_id = any($2::uuid[])', [tenantId, todos])
      const dd = new Set(e.dupIds)
      impacto.assuntos = (a ?? []).filter((x) => dd.has(x.disc)).length
      const cont = new Map<string, number>(); for (const x of a ?? []) cont.set(plano(x.nome), (cont.get(plano(x.nome)) ?? 0) + 1)
      impacto.assuntosColididos = [...cont.values()].reduce((s, n) => s + (n > 1 ? n - 1 : 0), 0)
      if (impacto.assuntosColididos) avisos.push(`${impacto.assuntosColididos} assunto(s) ficarão com nome repetido dentro da disciplina mantida — serão unidos automaticamente (as questões vão para o assunto mais usado).`)
      for (const [tab, rot] of OUTRAS_TABELAS_DISC) {
        const c = await sqlQuery<any>(`select count(*)::int as n from ${tab} where tenant_id = $1 and disciplina_id = any($2::uuid[])`, [tenantId, e.dupIds])
        if (c?.[0]?.n) impacto.conteudos.push({ tabela: tab, rotulo: rot, n: c[0].n })
      }
      const nf = e.nomeFinal ? plano(e.nomeFinal) : ''
      if (nf) {
        const o = await sqlQuery<any>('select id::text as id from simulado_disciplinas where tenant_id = $1 and id <> all($2::uuid[]) and public.simulado_norm_nome(nome) = $3', [tenantId, todos, nf])
        if (o?.length) return vazia(tipo, `Já existe outra disciplina chamada “${e.nomeFinal}”. Use outro nome.`)
      }
    }
    // simulados / bancos / respostas que usam as questões das variantes
    const u = await sqlQuery<any>(`select
        (select count(distinct pq.simulado_id) from simulado_prova_questoes pq join simulado_questoes q on q.id = pq.questao_id where q.tenant_id = $1 and q.${fk} = any($2::uuid[]))::int as simulados,
        (select count(distinct qp.pasta_id) from simulado_questao_pasta qp join simulado_questoes q on q.id = qp.questao_id where q.tenant_id = $1 and q.${fk} = any($2::uuid[]))::int as bancos,
        (select count(*) from simulado_respostas_objetivas r join simulado_questoes q on q.id = r.questao_id where q.tenant_id = $1 and q.${fk} = any($2::uuid[]))::int as respostas`, [tenantId, e.dupIds])
    if (u?.[0]) { impacto.simulados = u[0].simulados; impacto.bancos = u[0].bancos; impacto.respostas = u[0].respostas } else avisos.push('Não foi possível contar simulados/bancos que usam essas questões agora.')
    impacto.removidas = e.dupIds.length
    podeDesfazer = tipo === 'disciplina' ? await tabelaExiste('simulado_disciplina_unificacoes') : await tabelaExiste('simulado_termos_mesclagens')
  } else {
    const col = TXT[tipo as keyof typeof TXT]
    const rows = await sqlQuery<any>(`select ${col} as v, count(*) filter (where deletado = false)::int as q, count(*) filter (where deletado = true)::int as lixeira from simulado_questoes where tenant_id = $1 and ${col} = any($2::text[]) group by 1`, [tenantId, todos])
    if (!rows) return vazia(tipo, 'Não foi possível consultar o banco agora.')
    const por = new Map(rows.map((r) => [r.v as string, r]))
    canonNome = e.canonicaId
    variantes = e.dupIds.map((id) => ({ id, nome: id, questoes: por.get(id)?.q ?? 0 }))
    const nf = e.nomeFinal || e.canonicaId
    const alvos = [...new Set(todos)].filter((v) => v !== nf)
    impacto.questoes = alvos.reduce((s, v) => s + (por.get(v)?.q ?? 0), 0)
    const lix = alvos.reduce((s, v) => s + (por.get(v)?.lixeira ?? 0), 0)
    if (lix) avisos.push(`${lix} questão(ões) na lixeira também terão o texto trocado.`)
    const u = await sqlQuery<any>(`select
        (select count(distinct pq.simulado_id) from simulado_prova_questoes pq join simulado_questoes q on q.id = pq.questao_id where q.tenant_id = $1 and q.${col} = any($2::text[]))::int as simulados,
        (select count(distinct qp.pasta_id) from simulado_questao_pasta qp join simulado_questoes q on q.id = qp.questao_id where q.tenant_id = $1 and q.${col} = any($2::text[]))::int as bancos,
        (select count(*) from simulado_respostas_objetivas r join simulado_questoes q on q.id = r.questao_id where q.tenant_id = $1 and q.${col} = any($2::text[]))::int as respostas`, [tenantId, alvos])
    if (u?.[0]) { impacto.simulados = u[0].simulados; impacto.bancos = u[0].bancos; impacto.respostas = u[0].respostas }
    avisos.push('Só o texto muda nas questões — não há cadastro para remover.')
    podeDesfazer = await tabelaExiste('simulado_termos_mesclagens')
  }
  if (!podeDesfazer) avisos.push('Desfazer indisponível: falta aplicar a migration 20261113060000 (a mesclagem funciona e fica na auditoria, mas sem botão “Desfazer”).')
  return { ok: true, tipo, canonica: { id: e.canonicaId, nome: canonNome }, nomeFinal: e.nomeFinal || canonNome, variantes, impacto, avisos, podeDesfazer }
}
function vazia(tipo: TipoTermo, error: string): PreviaMescla {
  return { ok: false, error, tipo, canonica: { id: '', nome: '' }, nomeFinal: '', variantes: [], impacto: { questoes: 0, assuntos: 0, assuntosColididos: 0, simulados: 0, bancos: 0, respostas: 0, conteudos: [], removidas: 0, mantidas: 0 }, avisos: [], podeDesfazer: false }
}

// ───────────────────────── mesclar (tabela) ─────────────────────────
type Ator = { tenantId: string; userId: string | null }
type R = { ok: boolean; error?: string; [k: string]: any }

async function inserirLog(c: PoolClient, a: Ator, linha: { tipo: string; origem: string; canonicaId: string | null; canonicaNome: string | null; nomeFinal: string | null; payload: unknown; questoes: number }): Promise<boolean> {
  const ok = (await c.query("select to_regclass('public.simulado_termos_mesclagens') is not null as ok")).rows[0]?.ok
  if (!ok) return false
  await c.query(
    `insert into public.simulado_termos_mesclagens (tenant_id, tipo, origem, canonica_id, canonica_nome, nome_final, payload, questoes, criado_por) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [a.tenantId, linha.tipo, linha.origem, linha.canonicaId, linha.canonicaNome, linha.nomeFinal, JSON.stringify(linha.payload), linha.questoes, a.userId],
  )
  return true
}

async function mesclarEntidade(a: Ator, e: Entrada): Promise<R> {
  const tipo = e.tipo as keyof typeof ENT
  const { tabela, fk } = ENT[tipo]
  const todos = [e.canonicaId, ...e.dupIds]
  const res = await emTransacao(async (c) => {
    const { rows } = await c.query(`select to_jsonb(t) as row from public.${tabela} t where t.tenant_id = $1 and t.id = any($2::uuid[]) for update`, [a.tenantId, todos])
    if (rows.length !== todos.length) falha('Algum termo não foi encontrado (já mesclado ou removido). Recarregue a lista.')
    const linhas = new Map<string, any>(rows.map((r: any) => [r.row.id, r.row]))
    const canon = linhas.get(e.canonicaId)
    if (tipo === 'assunto' && new Set(rows.map((r: any) => r.row.disciplina_id)).size > 1) falha('Assuntos de disciplinas diferentes não podem ser mesclados.')
    if (e.nomeFinal && e.nomeFinal !== canon.nome && tipo !== 'assunto') {
      const dupNome = await c.query(`select 1 from public.${tabela} where tenant_id = $1 and id <> all($2::uuid[]) and public.simulado_norm_nome(nome) = $3 limit 1`, [a.tenantId, todos, plano(e.nomeFinal)])
      if (dupNome.rowCount) falha(`Já existe outro cadastro chamado “${e.nomeFinal}”.`)
    }
    const payload: any = { canonica: { id: canon.id, nome: canon.nome, pai_id: canon.pai_id ?? null }, variantes: [] as any[] }
    let nQ = 0
    for (const id of e.dupIds) {
      const q = await c.query(`select id::text as id from public.simulado_questoes where tenant_id = $1 and ${fk} = $2 order by id`, [a.tenantId, id])
      const f = tipo === 'assunto' ? await c.query('select id::text as id from public.simulado_assuntos where tenant_id = $1 and pai_id = $2 order by id', [a.tenantId, id]) : { rows: [] as any[] }
      payload.variantes.push({ id, nome: linhas.get(id).nome, row: linhas.get(id), questoes: q.rows.map((x: any) => x.id), filhos: f.rows.map((x: any) => x.id), removida: false })
      nQ += q.rowCount ?? 0
    }
    await c.query(`update public.simulado_questoes set ${fk} = $2 where tenant_id = $1 and ${fk} = any($3::uuid[])`, [a.tenantId, e.canonicaId, e.dupIds])
    if (tipo === 'assunto') {
      await c.query('update public.simulado_assuntos set pai_id = $2 where tenant_id = $1 and pai_id = any($3::uuid[])', [a.tenantId, e.canonicaId, e.dupIds])
      await c.query('update public.simulado_assuntos set pai_id = null where tenant_id = $1 and id = $2 and pai_id = any($3::uuid[])', [a.tenantId, e.canonicaId, e.dupIds])
    }
    if (e.nomeFinal && e.nomeFinal !== canon.nome) await c.query(`update public.${tabela} set nome = $3 where tenant_id = $1 and id = $2`, [a.tenantId, e.canonicaId, e.nomeFinal])
    let removidas = 0; const mantidas: string[] = []
    for (const v of payload.variantes) {
      await c.query('SAVEPOINT del')
      try { await c.query(`delete from public.${tabela} where tenant_id = $1 and id = $2`, [a.tenantId, v.id]); v.removida = true; removidas++; await c.query('RELEASE SAVEPOINT del') }
      catch (err: any) { await c.query('ROLLBACK TO SAVEPOINT del'); mantidas.push(v.nome) } // ainda referenciada por algo que não conhecemos → mantém
    }
    const comLog = await inserirLog(c, a, { tipo, origem: 'mesclagem', canonicaId: e.canonicaId, canonicaNome: canon.nome, nomeFinal: e.nomeFinal || null, payload, questoes: nQ })
    return { nQ, removidas, mantidas, comLog, canonNome: canon.nome, payload }
  })
  await registrarAudit({
    operacao: 'UPDATE', entidade: tabela, entidadeId: e.canonicaId, atorId: a.userId, tenantId: a.tenantId,
    antes: { variantes: res.payload.variantes.map((v: any) => ({ id: v.id, nome: v.nome, questoes: v.questoes.length, ...(res.comLog ? {} : { questao_ids: v.questoes.slice(0, 5000) }) })), canonica: res.payload.canonica },
    depois: { acao: 'mesclar_termos', mantida: e.nomeFinal || res.canonNome, questoes: res.nQ, removidas: res.removidas, mantidas: res.mantidas, desfazer: res.comLog },
  }).catch(() => {})
  return { ok: true, questoes: res.nQ, removidas: res.removidas, mantidas: res.mantidas, mantida: e.nomeFinal || res.canonNome, podeDesfazer: res.comLog }
}

async function mesclarTexto(a: Ator, e: Entrada): Promise<R> {
  const col = TXT[e.tipo as keyof typeof TXT]
  const nf = e.nomeFinal || e.canonicaId
  if (!nf.trim()) falha('Informe o nome final.')
  const alvos = [...new Set([e.canonicaId, ...e.dupIds])].filter((v) => v !== nf)
  if (!alvos.length) falha('Nada a alterar: o texto final já é o mesmo.')
  const res = await emTransacao(async (c) => {
    const variantes: any[] = []; let nQ = 0
    for (const v of alvos) {
      const q = await c.query(`select id::text as id from public.simulado_questoes where tenant_id = $1 and ${col} = $2 order by id`, [a.tenantId, v])
      variantes.push({ nome: v, destino: nf, questoes: q.rows.map((x: any) => x.id) }); nQ += q.rowCount ?? 0
    }
    await c.query(`update public.simulado_questoes set ${col} = $2 where tenant_id = $1 and ${col} = any($3::text[])`, [a.tenantId, nf, alvos])
    const comLog = await inserirLog(c, a, { tipo: e.tipo, origem: 'mesclagem', canonicaId: e.canonicaId, canonicaNome: e.canonicaId, nomeFinal: nf, payload: { variantes }, questoes: nQ })
    return { nQ, comLog, variantes }
  })
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: nf.slice(0, 100), atorId: a.userId, tenantId: a.tenantId,
    antes: { campo: col, variantes: res.variantes.map((v: any) => ({ valor: v.nome, questoes: v.questoes.length, ...(res.comLog ? {} : { questao_ids: v.questoes.slice(0, 5000) }) })) },
    depois: { acao: 'mesclar_termos', campo: col, mantida: nf, questoes: res.nQ, desfazer: res.comLog },
  }).catch(() => {})
  return { ok: true, questoes: res.nQ, removidas: 0, mantida: nf, podeDesfazer: res.comLog }
}

async function mesclarDisciplina(svc: SupabaseClient, a: Ator, e: Entrada): Promise<R> {
  const todos = [e.canonicaId, ...e.dupIds]
  const { data: donas } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', a.tenantId).in('id', todos)
  if ((donas ?? []).length !== todos.length) return { ok: false, error: 'Alguma disciplina não foi encontrada. Recarregue a lista.' }
  if (e.nomeFinal) {
    const o = await sqlQuery<any>('select 1 as x from simulado_disciplinas where tenant_id = $1 and id <> all($2::uuid[]) and public.simulado_norm_nome(nome) = $3', [a.tenantId, todos, plano(e.nomeFinal)])
    if (o?.length) return { ok: false, error: `Já existe outra disciplina chamada “${e.nomeFinal}”.` }
  }
  const r = await unificarDisciplinas(e.canonicaId, e.dupIds) // RPC atômica + log "Desfazer" (reuso exato)
  if (!r.ok) return r
  let renomeada = false
  if (e.nomeFinal && e.nomeFinal !== (donas ?? []).find((d: any) => d.id === e.canonicaId)?.nome) {
    const up = await svc.from('simulado_disciplinas').update({ nome: e.nomeFinal }).eq('tenant_id', a.tenantId).eq('id', e.canonicaId)
    renomeada = !up.error
  }
  // assuntos que ficaram com o mesmo nome dentro da disciplina mantida → unidos (cada um em transação própria; idempotente)
  let assuntosUnidos = 0
  const ass = await sqlQuery<any>(`select s.id::text as id, s.nome, (select count(*) from simulado_questoes q where q.tenant_id = $1 and q.assunto_id = s.id)::int as q from simulado_assuntos s where s.tenant_id = $1 and s.disciplina_id = $2`, [a.tenantId, e.canonicaId])
  if (ass) {
    const por = new Map<string, any[]>(); for (const x of ass) (por.get(plano(x.nome)) ?? por.set(plano(x.nome), []).get(plano(x.nome))!).push(x)
    for (const g of por.values()) {
      if (g.length < 2) continue
      const ord = [...g].sort((x, y) => y.q - x.q || x.nome.length - y.nome.length)
      try { const m = await mesclarEntidade(a, { tipo: 'assunto', canonicaId: ord[0].id, dupIds: ord.slice(1).map((x) => x.id), nomeFinal: '' }); if (m.ok) assuntosUnidos += ord.length - 1 } catch { /* segue; segue visível na lista de assuntos */ }
    }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_disciplinas', entidadeId: e.canonicaId, atorId: a.userId, tenantId: a.tenantId,
    antes: { variantes: (donas ?? []).filter((d: any) => d.id !== e.canonicaId) }, depois: { acao: 'mesclar_termos', mantida: e.nomeFinal || r.mantida, questoes: r.questoes, assuntos: r.assuntos, assuntos_unidos: assuntosUnidos, renomeada } }).catch(() => {})
  return { ok: true, questoes: r.questoes ?? 0, assuntos: r.assuntos ?? 0, removidas: r.removidas ?? e.dupIds.length, mantida: e.nomeFinal || r.mantida, assuntosUnidos, podeDesfazer: true }
}

export async function mesclarTermos(svc: SupabaseClient, a: Ator, tipo: TipoTermo, canonicaId: string, dupIds: unknown, nomeFinal: unknown): Promise<R> {
  try {
    const e = validar(tipo, canonicaId, dupIds, nomeFinal)
    const r = ehEnt(tipo) ? (tipo === 'disciplina' ? await mesclarDisciplina(svc, a, e) : await mesclarEntidade(a, e)) : await mesclarTexto(a, e)
    if (r.ok) { limparCacheTermos(a.tenantId); try { revalidatePath('/admin/questoes') } catch { /* fora de request */ } }
    return r
  } catch (x: any) { return { ok: false, error: x instanceof ErroNegocio ? x.message : `Falha ao mesclar (nada foi alterado): ${x?.message ?? 'erro'}` } }
}

// ───────────────────────── ignorar ("São termos diferentes") ─────────────────────────
export async function ignorarGrupo(svc: SupabaseClient, a: Ator, tipo: TipoTermo, grupoId: string, nomes: string[], desfazer: boolean): Promise<R> {
  if (!/^[0-9a-f]{16}$/.test(grupoId)) return { ok: false, error: 'Grupo inválido.' }
  if (desfazer) {
    const r = await svc.from('simulado_termos_ignorados').delete().eq('tenant_id', a.tenantId).eq('tipo', tipo).eq('chave', grupoId)
    if (r.error) return { ok: false, error: 'Tabela de ignorados ausente (migration 20261113060000 pendente).', semTabela: true }
  } else {
    const r = await svc.from('simulado_termos_ignorados').upsert({ tenant_id: a.tenantId, tipo, chave: grupoId, nomes: nomes.slice(0, 40).map((n) => String(n).slice(0, 200)), criado_por: a.userId }, { onConflict: 'tenant_id,tipo,chave' })
    if (r.error) return { ok: false, error: 'Tabela de ignorados ausente (migration 20261113060000 pendente).', semTabela: true }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_termos_ignorados', entidadeId: a.tenantId, atorId: a.userId, tenantId: a.tenantId, depois: { acao: desfazer ? 'voltar_a_sugerir' : 'sao_termos_diferentes', tipo, grupo: grupoId, nomes: nomes.slice(0, 20) } }).catch(() => {})
  limparCacheTermos(a.tenantId)
  return { ok: true }
}

// ───────────────────────── normalização em lote (texto livre) ─────────────────────────
export async function propostasNormalizacao(svc: SupabaseClient, tenantId: string, tipo: TipoTermo, o: { q?: string; page?: number; pp?: number; fresh?: boolean }): Promise<RespostaNorm> {
  if (!ehTxt(tipo)) return { ok: false, error: 'Normalização em lote vale só para Cargo e Assunto específico.', tipo, itens: [], total: 0, page: 1, pp: 20, questoes: 0, geradoEm: Date.now() }
  const { itens } = await itensTaxonomia(svc, tenantId, tipo as any, o.fresh)
  const todas = proporLote(itens.map((i) => ({ nome: i.id, questoes: i.questoes })))
  const termo = plano(o.q ?? '')
  const l = todas.filter((p) => !termo || plano(p.de).includes(termo) || plano(p.para).includes(termo)).sort((a, b) => b.questoes - a.questoes || ptbr(a.de, b.de))
  const pp = Math.min(100, Math.max(5, o.pp ?? 20)), page = Math.max(1, o.page ?? 1)
  return { ok: true, tipo, itens: l.slice((page - 1) * pp, page * pp), total: l.length, page, pp, questoes: l.reduce((s, p) => s + p.questoes, 0), geradoEm: Date.now() }
}

/** Aplica as propostas escolhidas (o servidor RECALCULA a proposta de cada valor: o cliente só diz QUAIS valores). */
export async function aplicarNormalizacao(svc: SupabaseClient, a: Ator, tipo: TipoTermo, des: unknown): Promise<R> {
  try {
    if (!ehTxt(tipo)) falha('Normalização em lote vale só para Cargo e Assunto específico.')
    const col = TXT[tipo as keyof typeof TXT]
    const lista = [...new Set((Array.isArray(des) ? des : []).map((x) => String(x)))].slice(0, 500)
    if (!lista.length) falha('Selecione ao menos um valor.')
    const { itens } = await itensTaxonomia(svc, a.tenantId, tipo as any, true)
    const existentes = new Set(itens.map((i) => i.id))
    const pares = proporLote(lista.filter((v) => existentes.has(v)).map((v) => ({ nome: v, questoes: 0 }))).map((p) => ({ de: p.de, para: p.para }))
    if (!pares.length) falha('Nenhuma das propostas vale mais (os valores já mudaram). Recarregue.')
    const res = await emTransacao(async (c) => {
      const variantes: any[] = []; let nQ = 0
      for (const p of pares) {
        const q = await c.query(`select id::text as id from public.simulado_questoes where tenant_id = $1 and ${col} = $2 order by id`, [a.tenantId, p.de])
        if (!q.rowCount) continue
        await c.query(`update public.simulado_questoes set ${col} = $2 where tenant_id = $1 and ${col} = $3`, [a.tenantId, p.para, p.de])
        variantes.push({ nome: p.de, destino: p.para, questoes: q.rows.map((x: any) => x.id) }); nQ += q.rowCount ?? 0
      }
      if (!variantes.length) falha('Nenhuma questão usa esses valores.')
      const comLog = await inserirLog(c, a, { tipo, origem: 'normalizacao', canonicaId: null, canonicaNome: null, nomeFinal: null, payload: { variantes }, questoes: nQ })
      return { nQ, variantes, comLog }
    })
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: tipo, atorId: a.userId, tenantId: a.tenantId,
      antes: { campo: col, valores: res.variantes.map((v: any) => ({ de: v.nome, para: v.destino, questoes: v.questoes.length, ...(res.comLog ? {} : { questao_ids: v.questoes.slice(0, 2000) }) })) },
      depois: { acao: 'normalizar_texto_em_lote', campo: col, valores: res.variantes.length, questoes: res.nQ, desfazer: res.comLog } }).catch(() => {})
    limparCacheTermos(a.tenantId)
    return { ok: true, valores: res.variantes.length, questoes: res.nQ, podeDesfazer: res.comLog }
  } catch (x: any) { return { ok: false, error: x instanceof ErroNegocio ? x.message : `Falha (nada foi alterado): ${x?.message ?? 'erro'}` } }
}

// ───────────────────────── histórico + desfazer ─────────────────────────
export async function historico(svc: SupabaseClient, tenantId: string): Promise<{ ok: boolean; itens: MesclagemLog[]; semTabela: boolean }> {
  const out: MesclagemLog[] = []
  const { data, error } = await svc.from('simulado_termos_mesclagens').select('id, tipo, origem, canonica_nome, nome_final, payload, questoes, criado_em, desfeita').eq('tenant_id', tenantId).neq('tipo', 'pasta_disciplina').order('criado_em', { ascending: false }).order('id', { ascending: false }).limit(60)
  const semTabela = !!error
  for (const r of (data ?? []) as any[]) {
    const vs = Array.isArray(r.payload?.variantes) ? r.payload.variantes : []
    out.push({ id: r.id, tipo: r.tipo, tipoTermo: r.tipo, origem: r.origem, canonicaNome: r.canonica_nome ?? r.nome_final ?? '—', nomeFinal: r.nome_final ?? null, variantes: vs.map((v: any) => ({ nome: v.destino && r.origem === 'normalizacao' ? `${v.nome} → ${v.destino}` : v.nome, questoes: Array.isArray(v.questoes) ? v.questoes.length : 0 })), questoes: r.questoes ?? 0, criadoEm: r.criado_em, desfeita: !!r.desfeita, podeDesfazer: !r.desfeita })
  }
  const u = await svc.from('simulado_disciplina_unificacoes').select('id, canonica_nome, mapa, criado_em').eq('tenant_id', tenantId).eq('desfeita', false).order('criado_em', { ascending: false }).limit(30)
  for (const r of (u.data ?? []) as any[]) {
    const mapa = Array.isArray(r.mapa) ? r.mapa : []
    out.push({ id: `disc:${r.id}`, tipo: 'disciplina', tipoTermo: 'disciplina', origem: 'disciplina', canonicaNome: r.canonica_nome ?? '—', nomeFinal: null, variantes: mapa.map((m: any) => ({ nome: m.nome, questoes: Array.isArray(m.questao_ids) ? m.questao_ids.length : 0 })), questoes: mapa.reduce((s: number, m: any) => s + (Array.isArray(m.questao_ids) ? m.questao_ids.length : 0), 0), criadoEm: r.criado_em, desfeita: false, podeDesfazer: true })
  }
  out.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
  return { ok: true, itens: out.slice(0, 60), semTabela }
}

export async function desfazerMescla(svc: SupabaseClient, a: Ator, id: string): Promise<R> {
  try {
    if (id.startsWith('disc:')) {
      const rid = id.slice(5); if (!UUID.test(rid)) falha('Registro inválido.')
      const r = await desfazerUnificacao(rid) // reuso exato (RPC simulado_desfazer_unificacao)
      if (r.ok) limparCacheTermos(a.tenantId)
      return r
    }
    if (!UUID.test(id)) falha('Registro inválido.')
    const res = await emTransacao(async (c) => {
      const { rows } = await c.query('select * from public.simulado_termos_mesclagens where tenant_id = $1 and id = $2 for update', [a.tenantId, id])
      const log = rows[0]; if (!log) falha('Registro não encontrado.'); if (log.desfeita) falha('Esta mesclagem já foi desfeita.')
      const tipo = log.tipo as TipoTermo
      const vs: any[] = log.payload?.variantes ?? []
      let nQ = 0
      if (ehTxt(tipo)) {
        const col = TXT[tipo]
        for (const v of vs) {
          const ids: string[] = v.questoes ?? []
          for (const ch of pedacos(ids, 1000)) {
            // só desfaz onde o texto ainda é o que a mesclagem pôs (não sobrescreve edição posterior)
            const r = await c.query(`update public.simulado_questoes set ${col} = $3 where tenant_id = $1 and id = any($2::uuid[]) and ${col} = $4`, [a.tenantId, ch, v.nome, v.destino])
            nQ += r.rowCount ?? 0
          }
        }
      } else if (ehEnt(tipo) && tipo !== 'disciplina') {
        const { tabela, fk } = ENT[tipo]
        const canonId = log.canonica_id as string
        const ex = await c.query(`select 1 from public.${tabela} where tenant_id = $1 and id = $2`, [a.tenantId, canonId])
        if (!ex.rowCount) falha('O termo mantido não existe mais — não dá para desfazer.')
        for (const v of vs) {
          if (v.removida) {
            const ja = await c.query(`select 1 from public.${tabela} where tenant_id = $1 and id = $2`, [a.tenantId, v.id])
            if (!ja.rowCount) await c.query(`insert into public.${tabela} select * from jsonb_populate_record(null::public.${tabela}, $1::jsonb)`, [JSON.stringify(v.row)])
          }
          for (const ch of pedacos<string>(v.questoes ?? [], 1000)) {
            const r = await c.query(`update public.simulado_questoes set ${fk} = $3 where tenant_id = $1 and id = any($2::uuid[]) and ${fk} = $4`, [a.tenantId, ch, v.id, canonId])
            nQ += r.rowCount ?? 0
          }
          if (tipo === 'assunto' && (v.filhos ?? []).length) await c.query('update public.simulado_assuntos set pai_id = $3 where tenant_id = $1 and id = any($2::uuid[]) and pai_id = $4', [a.tenantId, v.filhos, v.id, canonId])
        }
        const antes = log.payload?.canonica
        if (antes?.nome && log.nome_final && log.nome_final !== antes.nome) await c.query(`update public.${tabela} set nome = $3 where tenant_id = $1 and id = $2 and nome = $4`, [a.tenantId, canonId, antes.nome, log.nome_final])
      } else falha('Tipo sem suporte a desfazer.')
      await c.query('update public.simulado_termos_mesclagens set desfeita = true, desfeita_em = now(), desfeita_por = $3 where tenant_id = $1 and id = $2', [a.tenantId, id, a.userId])
      return { nQ, tipo }
    })
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_termos_mesclagens', entidadeId: id, atorId: a.userId, tenantId: a.tenantId, depois: { acao: 'desfazer_mesclagem', questoes: res.nQ, tipo: res.tipo } }).catch(() => {})
    limparCacheTermos(a.tenantId)
    return { ok: true, questoes: res.nQ }
  } catch (x: any) { return { ok: false, error: x instanceof ErroNegocio ? x.message : `Falha ao desfazer (nada foi alterado): ${x?.message ?? 'erro'}` } }
}
export type { ProporNorm }
