import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import { gerarPlano } from './engine'
import type { Cfg, Plano } from './engine'
import { hojeCal } from './dados'
import { carregarConteudoBanco, type ConteudoBanco } from './conteudo-banco'
import { lerParamsMotor } from './config-metas'
import { lerDetalhesMetas } from './plano-metas'
import { verificarInvariantes } from './invariantes'
import { horasDia, VERSAO_MOTOR, type Prog30 } from './motor30'
import type { Cfg28, AulaAS, ItemLP } from './motor28'
import { ColetorRastro, resultadoRastro, rotuloMeta, type EventoRastro } from './rastro'
import { lerMetasMin } from './rastro-plano-server'
import { hashRegras, resolverIndiceFaixa, REGRAS_PADRAO, type RegrasMotor } from './regras'
import { compararResultados, diffEventos, listarMudancas, type ImpactoPlano, type ResultadoGeracao } from './impacto-regras'

// INTELIGÊNCIA (admin, SOMENTE LEITURA): amostragem de planos reais + simulação de regras (vigente × padrão × rascunho) com o MESMO
// contexto de re-simulação do rastro (metas concluídas fixas, progresso/notas atuais). Nada é gravado. Só planos com motor 3.x.
// Egress: colunas mínimas, `.range()`, sem `.in()` sem chunk; a amostra e cada plano ficam em cache curto.

const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const POOL = 1000 // candidatos máximos (1 página do PostgREST) — amostra sempre sai deste conjunto
export type Criterio = 'recentes' | 'aleatoria' | 'faixa'

// ── amostragem ───────────────────────────────────────────────────────────────────────────────────────
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function seedNum(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
/** Embaralhamento determinístico por seed (Fisher-Yates). Puro. */
export function embaralharPorSeed<T>(lista: readonly T[], seed: string): T[] {
  const a = [...lista], rnd = mulberry32(seedNum(seed))
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
/** Distribui round-robin entre grupos (estratificação por faixa). Puro. */
export function intercalarGrupos<T>(grupos: Map<number, T[]>): T[] {
  const filas = [...grupos.entries()].sort((a, b) => a[0] - b[0]).map((e) => [...e[1]])
  const out: T[] = []
  for (let i = 0; filas.some((f) => i < f.length); i++) for (const f of filas) if (i < f.length) out.push(f[i])
  return out
}

export interface AmostraIds { ids: string[]; faixas: Record<string, number>; pool: number }

export async function amostrarPlanos(svc: SupabaseClient, tenantId: string, p: { tamanho: number; criterio: Criterio; seed: string }, regras: RegrasMotor): Promise<AmostraIds> {
  const n = Math.max(5, Math.min(200, Math.trunc(p.tamanho) || 30))
  const chave = `crono-intel:amostra:${tenantId}:${p.criterio}:${n}:${p.seed}:${p.criterio === 'faixa' ? hashRegras(regras) : '-'}`
  return remember<AmostraIds>(chave, 120, async () => {
    const cols = p.criterio === 'faixa' ? 'id,horas:cfg->horas' : 'id'
    const { data } = await svc.from(T_PLANO).select(cols).eq('tenant_id', tenantId).eq('arquivada', false).eq('exemplo', false).like('cfg->>motor', '3.%')
      .order('criado_em', { ascending: false }).order('id', { ascending: false }).range(0, POOL - 1)
    const rows = (data ?? []) as unknown as Array<{ id: string; horas?: unknown }>
    const faixas: Record<string, number> = {}
    if (p.criterio === 'recentes') return { ids: rows.slice(0, n).map((r) => r.id), faixas, pool: rows.length }
    if (p.criterio === 'aleatoria') return { ids: embaralharPorSeed(rows.map((r) => r.id), p.seed).slice(0, n), faixas, pool: rows.length }
    const grupos = new Map<number, string[]>()
    for (const r of rows) {
      const h = Array.isArray(r.horas) ? (r.horas as unknown[]).reduce<number>((s, x) => s + (Number(x) || 0), 0) : 0
      const f = resolverIndiceFaixa(Math.round(h * 60), regras)
      faixas[r.id] = f
      const l = grupos.get(f); if (l) l.push(r.id); else grupos.set(f, [r.id])
    }
    for (const [f, l] of grupos) grupos.set(f, embaralharPorSeed(l, p.seed + ':' + f))
    return { ids: intercalarGrupos(grupos).slice(0, n), faixas, pool: rows.length }
  })
}

// ── contexto de re-simulação de UM plano (igual ao rastro) ───────────────────────────────────────────
export interface CtxPlano {
  planoId: string; titulo: string | null; estudanteId: string | null
  cfg: Cfg; cfg28: Cfg28; gravado: Plano; hoje: string
  feitas: Set<string>; usados: string[]
  prog: Record<string, Prog30>
  notas: Record<string, { grau?: number; res?: number; err?: number; cert?: number }>
  fixos: Plano; detalhes: unknown
}

export async function carregarCtxPlano(svc: SupabaseClient, tenantId: string, planoId: string): Promise<CtxPlano | null> {
  const { data: row } = await svc.from(T_PLANO).select('id,titulo,estudante_id,cfg,plano').eq('tenant_id', tenantId).eq('id', planoId).maybeSingle()
  if (!row) return null
  const cfg = (row.cfg ?? {}) as Cfg & { motor?: string }
  if (typeof cfg.motor !== 'string' || !cfg.motor.startsWith('3.')) return null // legado 2.8.1 fora do escopo
  const gravado = (row.plano ?? {}) as Plano
  const [metas, detalhes] = await Promise.all([lerMetasMin(svc, tenantId, planoId), lerDetalhesMetas(svc, planoId)])
  const hoje = hojeCal()
  const feitas = new Set(metas.filter((m) => m.estado === 'done').map((m) => m.meta_id))
  const prog: CtxPlano['prog'] = {}
  const notas: CtxPlano['notas'] = {}
  for (const m of metas) {
    prog[m.meta_id] = { ...(m.estado === 'done' ? { s: 'done', ...(m.concluido_em ? { em: m.concluido_em.slice(0, 10) } : {}) } : {}), t: m.tempo_seg || 0, parou: m.parcial_v ? { v: m.parcial_v } : null }
    if (m.grau != null || m.res != null || m.err != null || m.cert != null) notas[m.meta_id] = { ...(m.grau != null ? { grau: m.grau } : {}), ...(m.res != null ? { res: m.res } : {}), ...(m.err != null ? { err: m.err } : {}), ...(m.cert != null ? { cert: m.cert } : {}) }
  }
  const fixos: Plano = {}
  for (const [id, v] of Object.entries(gravado)) if (Array.isArray(v) && (feitas.has(id) || v[0] < hoje)) fixos[id] = v
  return {
    planoId, titulo: (row.titulo as string | null) ?? null, estudanteId: (row.estudante_id as string | null) ?? null,
    cfg, cfg28: { ...cfg, motor: cfg.motor ?? VERSAO_MOTOR } as unknown as Cfg28, gravado, hoje, feitas, usados: metas.map((m) => m.meta_id), prog, notas, fixos, detalhes,
  }
}

/** Roda o motor com `regras` neste plano (nunca grava). Erro de geração vira `erro`. */
export function gerarComRegras(c: CtxPlano, banco: ConteudoBanco, params: unknown, regras: RegrasMotor, coletor?: ColetorRastro): ResultadoGeracao & { eventos?: EventoRastro[] } {
  try {
    const r = gerarPlano(c.cfg, banco.AS as never, banco.WLP, c.fixos, c.hoje, (banco.LP ?? []) as ItemLP[], {
      manterMotor: true, ordem: banco.ordem, feitas: c.feitas, usados: c.usados, regras, params: params as never, notas: c.notas, prog: c.prog, hoje: c.hoje,
      planoAtual: c.gravado, detalhes: c.detalhes as never, ...(coletor ? { rastro: coletor } : {}),
    })
    let violacoes = 0
    try { violacoes = verificarInvariantes(r.plano, regras, { start: c.cfg.start, horasDia: (d) => horasDia(c.cfg28, d), AS: banco.AS as AulaAS[], ordem: banco.ordem ?? undefined }).length } catch { /* sem invariantes */ }
    return { plano: r.plano, fim: r.fim, violacoes, ...(coletor ? { eventos: resultadoRastro(coletor)?.eventos } : {}) }
  } catch (e) {
    return { plano: null, fim: 0, violacoes: 0, erro: (e as Error)?.message || 'Falha ao gerar o plano.' }
  }
}

export interface RegrasCenarios { vigente: RegrasMotor; padrao: RegrasMotor; rascunho: RegrasMotor | null }
const hashes = (r: RegrasCenarios) => ({ vigente: hashRegras(r.vigente), padrao: hashRegras(r.padrao), rascunho: r.rascunho ? hashRegras(r.rascunho) : null })

/** Impacto de UM plano: vigente (base) × padrão e × rascunho. Cache de 2 min por (plano, hashes). */
export async function impactoDoPlano(svc: SupabaseClient, tenantId: string, planoId: string, banco: ConteudoBanco, params: unknown, reg: RegrasCenarios, faixa: number | null) {
  const h = hashes(reg)
  return remember(`crono-intel:plano:${tenantId}:${planoId}:${h.vigente}:${h.padrao}:${h.rascunho ?? '-'}`, 120, async () => {
    const c = await carregarCtxPlano(svc, tenantId, planoId)
    if (!c) return null
    const base = gerarComRegras(c, banco, params, reg.vigente)
    const cmp = (r: RegrasMotor): ImpactoPlano => compararResultados(base, gerarComRegras(c, banco, params, r), c.gravado, c.feitas)
    return {
      planoId, titulo: c.titulo, estudanteId: c.estudanteId, faixa,
      violacoesVigente: base.violacoes, erroVigente: base.erro,
      padrao: h.padrao === h.vigente ? null : cmp(reg.padrao),
      rascunho: reg.rascunho && h.rascunho !== h.vigente ? cmp(reg.rascunho) : null,
    }
  })
}

/** Nomes dos alunos de um lote (≤ 10 ids → 1 consulta, bem abaixo do chunk de 80). */
export async function nomesEstudantes(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  const u = [...new Set(ids)].slice(0, 80)
  if (!u.length) return m
  const { data } = await svc.from('simulado_estudantes').select('id,nome,email').eq('tenant_id', tenantId).in('id', u)
  for (const e of (data ?? []) as Array<{ id: string; nome: string | null; email: string | null }>) m.set(e.id, e.nome?.trim() || e.email || '')
  return m
}

export async function carregarBaseSimulacao(svc: SupabaseClient, tenantId: string) {
  const [banco, params] = await Promise.all([carregarConteudoBanco(svc, tenantId), lerParamsMotor(svc, tenantId)])
  return { banco, params }
}

/** TRAVA: roda a amostra (mais recentes) com proposta × vigente. Orçamento de tempo: para ao estourar e marca `parcial`. */
export async function rodarAmostraTrava(svc: SupabaseClient, tenantId: string, vigente: RegrasMotor, proposta: RegrasMotor, n: number, orcamentoMs = 25000) {
  const [{ ids }, base] = await Promise.all([amostrarPlanos(svc, tenantId, { tamanho: n, criterio: 'recentes', seed: 'trava' }, vigente), carregarBaseSimulacao(svc, tenantId)])
  const itens: Array<{ planoId: string; impacto: ImpactoPlano }> = []
  const t0 = Date.now()
  let parcial = false
  for (const id of ids) {
    if (Date.now() - t0 > orcamentoMs) { parcial = true; break }
    const c = await carregarCtxPlano(svc, tenantId, id)
    if (!c) continue
    const a = gerarComRegras(c, base.banco, base.params, vigente)
    const b = gerarComRegras(c, base.banco, base.params, proposta)
    itens.push({ planoId: id, impacto: compararResultados(a, b, c.gravado, c.feitas) })
  }
  return { itens, parcial }
}

/** LABORATÓRIO: roda o rastro do plano com as regras vigentes e com as alteradas em memória. */
export async function rodarLab(svc: SupabaseClient, tenantId: string, planoId: string, vigente: RegrasMotor, alterada: RegrasMotor) {
  const c = await carregarCtxPlano(svc, tenantId, planoId)
  if (!c) return null
  const { banco, params } = await carregarBaseSimulacao(svc, tenantId)
  const cv = new ColetorRastro(), ca = new ColetorRastro()
  const a = gerarComRegras(c, banco, params, vigente, cv)
  const b = gerarComRegras(c, banco, params, alterada, ca)
  const impacto = compararResultados(a, b, c.gravado, c.feitas)
  const mud = listarMudancas(a.plano, b.plano, c.feitas, 100)
  return {
    c, a, b, impacto,
    eventos: diffEventos(a.eventos ?? [], b.eventos ?? []),
    mudancas: mud.itens.map((m) => ({ ...m, rotulo: rotuloMeta(m.id) })), mudancasTotal: mud.total,
  }
}

export { REGRAS_PADRAO }
