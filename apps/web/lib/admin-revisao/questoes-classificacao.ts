import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'
import { createAdminClient } from '@/lib/supabase/server'
import { esquecer, remember } from '@/lib/cache/relatorio-cache'
import { plano } from './texto-plano'
import { resumoClassificacao, listarTaxonomiaG, sugestoesQuestoes } from './biblioteca-questoes-gestao'
import type { ItemTaxG, RespostaTaxG, SugestaoQ, TipoTaxG } from './biblioteca-questoes-gestao-tipos'
import { PARAMS_TAX_PADRAO, type DistribuicaoQ, type InicialClassificacao } from './questoes-classificacao-tipos'

// CLASSIFICAÇÃO (Biblioteca › Questões) — camada de dados BACKEND-FIRST.
//  • UMA agregação SQL (grouping sets) devolve as contagens de todas as listas da taxonomia e da distribuição, numa só passada.
//  • Cache servidor 60 s por tenant (memória, com dedupe de chamadas simultâneas) + payload inicial no Redis/relatorio-cache (60 s).
//  • carregarInicialClassificacao alimenta o SSR (page.tsx): o painel renderiza na hora, sem chamada de API.
//  • Sugestões: lote pequeno, UMA consulta SQL (3 sinais), sem varrer a base de duplicadas.

export type Distribuicao = DistribuicaoQ
const TTL = 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ptbr = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
const CHAVE_INICIAL = (t: string) => `revisao:classif:inicial:${t}`
const TIPOS: TipoTaxG[] = ['disciplina', 'assunto', 'banca', 'orgao', 'cargo', 'assunto_detalhe', 'ano']

interface Lista {
  itens: Record<TipoTaxG, ItemTaxG[]>; dist: Distribuicao; disciplinas: { id: string; nome: string }[]
  assuntos: { id: string; nome: string; disc: string | null }[]; bancas: Map<string, string>; orgaos: Map<string, string>; discNome: Map<string, string>
}
const LISTAS = new Map<string, { at: number; v: Lista }>()
const PEND = new Map<string, Promise<Lista | null>>()
const SUG = new Map<string, { at: number; v: Record<string, SugestaoQ> }>()

/** Limpa os caches de servidor da Classificação (chamado após mutação ou fresh). */
export function limparCacheClassificacao(tenantId: string) {
  LISTAS.delete(tenantId); PEND.delete(tenantId)
  for (const k of [...SUG.keys()]) if (k.startsWith(tenantId)) SUG.delete(k)
  void esquecer(CHAVE_INICIAL(tenantId))
}

const SQL_TUDO = `
with q as (
  select disciplina_id d, assunto_id a, banca_id b, orgao_id o,
         case when btrim(coalesce(cargo, '')) <> '' then cargo end c,
         case when btrim(coalesce(assunto_detalhe, '')) <> '' then assunto_detalhe end ad,
         ano y, nivel_dificuldade nd, tipo t, status s
    from simulado_questoes where tenant_id = $1 and deletado = false
), g as (
  select case when grouping(d) = 0 then 'd' when grouping(a) = 0 then 'a' when grouping(b) = 0 then 'b' when grouping(o) = 0 then 'o'
              when grouping(c) = 0 then 'c' when grouping(ad) = 0 then 'ad' when grouping(y) = 0 then 'y' when grouping(nd) = 0 then 'nd'
              when grouping(t) = 0 then 't' else 's' end as tp,
         coalesce(d::text, a::text, b::text, o::text, c, ad, y::text, nd, t, s) as k, count(*)::int as n
    from q group by grouping sets ((d), (a), (b), (o), (c), (ad), (y), (nd), (t), (s))
)
select (select coalesce(json_agg(json_build_object('tp', tp, 'k', k, 'n', n)), '[]'::json) from g) as cont,
       (select coalesce(json_agg(json_build_object('id', id::text, 'nome', nome, 'classificacao', classificacao)), '[]'::json) from simulado_disciplinas where tenant_id = $1) as disc,
       (select coalesce(json_agg(json_build_object('id', id::text, 'nome', nome, 'disc', disciplina_id::text)), '[]'::json) from simulado_assuntos where tenant_id = $1) as ass,
       (select coalesce(json_agg(json_build_object('id', id::text, 'nome', nome)), '[]'::json) from simulado_bancas where tenant_id = $1) as ban,
       (select coalesce(json_agg(json_build_object('id', id::text, 'nome', nome)), '[]'::json) from simulado_orgaos where tenant_id = $1) as org`

async function calcularListas(tenantId: string): Promise<Lista | null> {
  const r = await sqlQuery<any>(SQL_TUDO, [tenantId])
  const row = r?.[0]; if (!row) return null
  const cont: { tp: string; k: string | null; n: number }[] = row.cont ?? []
  const por = (tp: string) => { const m = new Map<string, number>(); for (const x of cont) if (x.tp === tp && x.k != null) m.set(String(x.k), Number(x.n)); return m }
  const [cD, cA, cB, cO, cC, cAd, cY] = ['d', 'a', 'b', 'o', 'c', 'ad', 'y'].map(por)
  const nome = (v: unknown) => String(v ?? '').trim() || '—'
  const discNome = new Map<string, string>(); for (const d of row.disc ?? []) discNome.set(d.id, nome(d.nome))
  const nAss = new Map<string, number>(); for (const a of row.ass ?? []) if (a.disc) nAss.set(a.disc, (nAss.get(a.disc) ?? 0) + 1)
  const bancas = new Map<string, string>(); for (const b of row.ban ?? []) bancas.set(b.id, nome(b.nome))
  const orgaos = new Map<string, string>(); for (const o of row.org ?? []) orgaos.set(o.id, nome(o.nome))
  const texto = (m: Map<string, number>): ItemTaxG[] => [...m].map(([k, n]) => ({ id: k, nome: k, questoes: n }))
  const itens: Record<TipoTaxG, ItemTaxG[]> = {
    disciplina: (row.disc ?? []).map((d: any) => ({ id: d.id, nome: nome(d.nome), questoes: cD.get(d.id) ?? 0, extra: nAss.get(d.id) ?? 0, classificacao: d.classificacao ?? null })),
    assunto: (row.ass ?? []).map((a: any) => ({ id: a.id, nome: nome(a.nome), questoes: cA.get(a.id) ?? 0, paiId: a.disc ?? null, paiNome: a.disc ? discNome.get(a.disc) ?? null : null })),
    banca: [...bancas].map(([id, n]) => ({ id, nome: n, questoes: cB.get(id) ?? 0 })),
    orgao: [...orgaos].map(([id, n]) => ({ id, nome: n, questoes: cO.get(id) ?? 0 })),
    cargo: texto(cC), assunto_detalhe: texto(cAd), ano: texto(cY),
  }
  const dist: Distribuicao = { total: 0, dificuldade: [], tipo: [], status: [] }
  for (const x of cont) {
    const alvo = x.tp === 'nd' ? dist.dificuldade : x.tp === 't' ? dist.tipo : x.tp === 's' ? dist.status : null
    if (alvo) alvo.push({ k: x.k ?? '', n: Number(x.n) })
  }
  dist.total = dist.status.reduce((a, x) => a + x.n, 0)
  for (const c of ['dificuldade', 'tipo', 'status'] as const) dist[c].sort((a, b) => b.n - a.n)
  return {
    itens, dist, bancas, orgaos, discNome,
    disciplinas: [...discNome].map(([id, n]) => ({ id, nome: n })).sort((a, b) => ptbr(a.nome, b.nome)),
    assuntos: (row.ass ?? []).map((a: any) => ({ id: a.id, nome: nome(a.nome), disc: a.disc ?? null })),
  }
}

async function listas(tenantId: string, fresh = false): Promise<Lista | null> {
  if (fresh) limparCacheClassificacao(tenantId)
  const hit = LISTAS.get(tenantId); if (hit && Date.now() - hit.at < TTL) return hit.v
  const pend = PEND.get(tenantId); if (pend) return pend
  const p = calcularListas(tenantId).then((v) => { if (v) LISTAS.set(tenantId, { at: Date.now(), v }); return v }).finally(() => PEND.delete(tenantId))
  PEND.set(tenantId, p); return p
}

/** Lista paginada/filtrada/ordenada da taxonomia a partir da agregação única em cache. null = sem SQL direto (o chamador usa o fallback). */
export async function taxonomiaRapida(tenantId: string, tipo: TipoTaxG, o: { q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; pp?: number; disciplina?: string; semUso?: boolean; fresh?: boolean }): Promise<RespostaTaxG | null> {
  const L = await listas(tenantId, o.fresh); if (!L) return null
  const termo = plano(o.q ?? '')
  let l = L.itens[tipo].filter((i) => (!termo || plano(i.nome).includes(termo) || plano(i.paiNome ?? '').includes(termo)) && (!o.disciplina || i.paiId === o.disciplina) && (!o.semUso || i.questoes === 0))
  const dir = o.dir === 'desc' ? -1 : 1
  const sort = o.sort ?? (tipo === 'ano' ? 'nome' : 'questoes')
  l = [...l].sort((a, b) => {
    const c = sort === 'questoes' ? a.questoes - b.questoes : sort === 'extra' ? (a.extra ?? 0) - (b.extra ?? 0) : sort === 'pai' ? ptbr(a.paiNome ?? '', b.paiNome ?? '') : tipo === 'ano' ? Number(a.nome) - Number(b.nome) : ptbr(a.nome, b.nome)
    return (c || ptbr(a.nome, b.nome) || (a.id < b.id ? -1 : 1)) * dir
  })
  const pp = Math.min(100, Math.max(5, o.pp ?? 14)), page = Math.max(1, o.page ?? 1)
  const out: RespostaTaxG = { itens: l.slice((page - 1) * pp, page * pp), total: l.length, page, pp }
  if (tipo === 'assunto') out.disciplinas = L.disciplinas
  return out
}

/** Distribuição por dificuldade/tipo/status (mesma agregação única, cache 60 s). */
export async function distribuicaoQuestoes(svc: SupabaseClient, tenantId: string, fresh = false): Promise<Distribuicao> {
  const L = await listas(tenantId, fresh)
  if (L) return L.dist
  // fallback sem SQL direto: contagens head no PostgREST
  const out: Distribuicao = { total: 0, dificuldade: [], tipo: [], status: [], degradado: true }
  const head = async (col: string, v: string | null) => {
    let q = svc.from('simulado_questoes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false)
    q = v === null ? q.is(col, null) : q.eq(col, v)
    return (await q).count ?? 0
  }
  const cols = { dificuldade: 'nivel_dificuldade', tipo: 'tipo', status: 'status' } as const
  const vals: Record<keyof typeof cols, (string | null)[]> = { dificuldade: ['facil', 'medio', 'dificil', null], tipo: ['objetiva', 'discursiva', null], status: ['rascunho', 'publicada', 'arquivada'] }
  await Promise.all((Object.keys(cols) as (keyof typeof cols)[]).map(async (c) => {
    const res = await Promise.all(vals[c].map(async (v) => ({ k: v ?? '', n: await head(cols[c], v) })))
    out[c] = res.filter((x) => x.n > 0).sort((a, b) => b.n - a.n)
  }))
  out.total = out.status.reduce((a, x) => a + x.n, 0)
  return out
}

/** SSR: tudo da Classificação em poucas idas ao banco, em paralelo, com cache 60 s (Redis ou memória). */
export async function carregarInicialClassificacao(tenantId: string): Promise<InicialClassificacao> {
  return remember<InicialClassificacao>(CHAVE_INICIAL(tenantId), 60, async () => {
    const svc = createAdminClient()
    const [resumo, L] = await Promise.all([resumoClassificacao(svc, tenantId), listas(tenantId)])
    const taxonomia: InicialClassificacao['taxonomia'] = {}
    await Promise.all(TIPOS.map(async (t) => {
      const p = PARAMS_TAX_PADRAO(t); const o = { sort: p.sort, dir: p.dir as 'asc' | 'desc', page: 1, pp: 14 }
      const r = L ? await taxonomiaRapida(tenantId, t, o) : await listarTaxonomiaG(svc, tenantId, t, o).catch(() => null)
      if (r) taxonomia[t] = r
    }))
    return { resumo, distribuicao: L?.dist ?? null, taxonomia, geradoEm: Date.now() }
  })
}

// ───────────────────────── sugestões (lote pequeno, UMA consulta) ─────────────────────────
// Sinais: (1) mesma questão (enunciado idêntico ou mesmo código externo) já classificada; (2) mesmo assunto específico → disciplina/assunto
// majoritários (>= 80% e >= 2 questões); (3) o assunto específico coincide com um assunto do cadastro. Banca/órgão/ano só pelo sinal 1.
// Usa o índice opcional (tenant_id, md5(btrim(enunciado))) da migration 20261113090000; sem ele funciona, só mais devagar.
const SQL_SUG = `
with alvo as (
  select id, disciplina_id, assunto_id, banca_id, orgao_id, ano, assunto_detalhe, nullif(btrim(external_id), '') ext, md5(btrim(enunciado)) h
    from simulado_questoes where tenant_id = $1 and deletado = false and id = any($2::uuid[])
), sib as (
  select a.id::text as alvo, s.disciplina_id::text d, s.assunto_id::text a, s.banca_id::text b, s.orgao_id::text o, s.ano
    from alvo a join simulado_questoes s on s.tenant_id = $1 and s.deletado = false and md5(btrim(s.enunciado)) = a.h and s.id <> a.id
   where s.disciplina_id is not null or s.assunto_id is not null or s.banca_id is not null or s.orgao_id is not null or s.ano is not null
  union
  select a.id::text, s.disciplina_id::text, s.assunto_id::text, s.banca_id::text, s.orgao_id::text, s.ano
    from alvo a join simulado_questoes s on s.tenant_id = $1 and s.deletado = false and s.external_id = a.ext and s.id <> a.id
   where a.ext is not null and (s.disciplina_id is not null or s.assunto_id is not null or s.banca_id is not null or s.orgao_id is not null or s.ano is not null)
), chaves as (
  select distinct lower(btrim(assunto_detalhe)) k from alvo where assunto_detalhe is not null and btrim(assunto_detalhe) <> ''
), peers as (
  select lower(btrim(q.assunto_detalhe)) k, q.disciplina_id::text d, q.assunto_id::text a, count(*)::int n
    from simulado_questoes q where q.tenant_id = $1 and q.deletado = false and q.disciplina_id is not null
     and lower(btrim(q.assunto_detalhe)) in (select k from chaves) group by 1, 2, 3
)
select (select coalesce(json_agg(json_build_object('id', id::text, 'd', disciplina_id::text, 'a', assunto_id::text, 'b', banca_id::text, 'o', orgao_id::text, 'y', ano, 'ad', assunto_detalhe)), '[]'::json) from alvo) as alvo,
       (select coalesce(json_agg(row_to_json(sib)), '[]'::json) from sib) as sib,
       (select coalesce(json_agg(row_to_json(peers)), '[]'::json) from peers) as peers`

export async function sugestoesRapidas(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Record<string, SugestaoQ>> {
  const lista = [...new Set(ids.filter((i) => UUID.test(i)))].slice(0, 100)
  if (!lista.length) return {}
  const ck = `${tenantId}|${[...lista].sort().join(',')}`
  const hit = SUG.get(ck); if (hit && Date.now() - hit.at < TTL) return hit.v
  const [r, L] = await Promise.all([sqlQuery<any>(SQL_SUG, [tenantId, lista]), listas(tenantId)])
  if (!r?.[0] || !L) return sugestoesQuestoes(svc, tenantId, lista) // sem SQL direto: implementação antiga (PostgREST)
  const alvo: any[] = r[0].alvo ?? []
  const irmaosDe = new Map<string, any[]>(); for (const s of r[0].sib ?? []) (irmaosDe.get(s.alvo) ?? irmaosDe.set(s.alvo, []).get(s.alvo)!).push(s)
  const peers = new Map<string, { d: string; a: string | null; n: number }[]>(); for (const p of r[0].peers ?? []) (peers.get(p.k) ?? peers.set(p.k, []).get(p.k)!).push(p)
  const nomeAss = new Map(L.assuntos.map((a) => [a.id, a]))
  const porNomeAss = new Map<string, { id: string; disc: string | null }[]>()
  for (const a of L.assuntos) { const k = plano(a.nome); (porNomeAss.get(k) ?? porNomeAss.set(k, []).get(k)!).push({ id: a.id, disc: a.disc }) }
  const nd = (id: string | null | undefined) => (id ? L.discNome.get(id) ?? null : null)
  const out: Record<string, SugestaoQ> = {}
  for (const x of alvo) {
    const s: SugestaoQ = { fonte: '' }; const fontes: string[] = []
    const falta = { d: !x.d, a: !x.a, b: !x.b, o: !x.o, y: x.y == null }
    const irmaos = irmaosDe.get(x.id) ?? []
    if (irmaos.length) {
      const pega = (f: string) => irmaos.map((i) => i[f]).find((v) => v != null && v !== '')
      let usou = false
      if (falta.d && pega('d')) { s.disciplinaId = pega('d'); s.disciplina = nd(s.disciplinaId); usou = true }
      if (falta.a && pega('a')) { s.assuntoId = pega('a'); s.assunto = nomeAss.get(s.assuntoId!)?.nome ?? null; s.disciplinaId ??= pega('d') ?? x.d; usou = true }
      if (falta.b && pega('b')) { s.bancaId = pega('b'); s.banca = L.bancas.get(s.bancaId!) ?? null; usou = true }
      if (falta.o && pega('o')) { s.orgaoId = pega('o'); s.orgao = L.orgaos.get(s.orgaoId!) ?? null; usou = true }
      if (falta.y && pega('ano') != null) { s.ano = pega('ano'); usou = true }
      if (usou) fontes.push('a mesma questão repetida já tem classificação')
    }
    const k = String(x.ad ?? '').trim().toLowerCase()
    const pp = k ? peers.get(k) : undefined
    if (pp && (falta.d || falta.a) && !s.disciplinaId) {
      const tot = pp.reduce((a, y) => a + y.n, 0)
      if (tot >= 2) {
        const porD = new Map<string, number>(); for (const p of pp) porD.set(p.d, (porD.get(p.d) ?? 0) + p.n)
        const [dTop, nTop] = [...porD].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
        if (dTop && nTop / tot >= 0.8 && (falta.d || dTop === x.d)) {
          if (falta.d) { s.disciplinaId = dTop; s.disciplina = nd(dTop) }
          const porA = new Map<string, number>(); for (const p of pp) if (p.d === dTop && p.a) porA.set(p.a, (porA.get(p.a) ?? 0) + p.n)
          const [aTop, nA] = [...porA].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
          if (falta.a && aTop && nA / tot >= 0.8 && !s.assuntoId) { s.assuntoId = aTop; s.assunto = nomeAss.get(aTop)?.nome ?? null; s.disciplinaId = dTop; s.disciplina = nd(dTop) }
          if (s.disciplinaId || s.assuntoId) fontes.push(tot + ' questões com o mesmo assunto específico apontam para isso')
        }
      }
    }
    if (falta.a && !s.assuntoId && x.ad) {
      const c = porNomeAss.get(plano(x.ad)) ?? []
      const alvoC = x.d ? c.filter((y) => y.disc === x.d) : c
      if (alvoC.length === 1) {
        s.assuntoId = alvoC[0].id; s.assunto = nomeAss.get(alvoC[0].id)?.nome ?? null
        s.disciplinaId = x.d ?? alvoC[0].disc; s.disciplina = nd(s.disciplinaId)
        fontes.push('o assunto específico coincide com um assunto do cadastro')
      }
    }
    if (fontes.length) { s.fonte = fontes.join(' · '); out[x.id] = s }
  }
  if (SUG.size > 200) SUG.delete(SUG.keys().next().value!)
  SUG.set(ck, { at: Date.now(), v: out })
  return out
}
