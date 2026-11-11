import 'server-only'
// Camada de LEITURA das telas CS da "Plataforma Revisão" (Membros · Grupos · Calendário · Campanhas · Avisos).
// As páginas só chamam estas funções e renderizam: nenhuma conta/filtragem acontece no render.
// Paginação .range()+count; .in() em chunk (fetchAllByIn, 80); fetchAll sempre com .order() por coluna única.
// Tolerante a migração pendente (20261112040000): colunas/tabelas novas ausentes degradam sem quebrar a tela.
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { isoParaBrtLocal } from '@/lib/brt'
import { getGamConfig, type TituloNivel } from '@/lib/gamificacao/config'
import { cargoParaNivel } from '@/lib/gamificacao/niveis'
import { sqlQuery, grupoContagensSql } from 'data'
import type {
  MembrosFiltro, MembroLinha, MembrosContagens, MembroDetalhe, MembroGrupoVinculo, GrupoOpcao, OrigemGrupo,
  GrupoLinha, GruposKpis, PastaGrupo, CursoOpcao, EventoCal, EventoTipo, CampanhaResumo, ApiConfig,
  AvisoLinha, AvisoLocal, PublicoItem,
} from './cs-tipos'
import { AVISO_LOCAIS, API_PROVEDORES } from './cs-tipos'

export const NADA = '00000000-0000-0000-0000-000000000000'
const DIA = 86_400_000
const corte7d = () => new Date(Date.now() - 7 * DIA).toISOString()

/** Hoje em Brasília (AAAA-MM-DD). */
export function hojeBrt(): string { return isoParaBrtLocal(new Date().toISOString()).slice(0, 10) }
/** AAAA-MM-DD → DD/MM/AAAA. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
/** timestamp → DD/MM/AAAA (Brasília). */
export function dataBrTs(ts: string | null | undefined): string {
  if (!ts) return '—'
  return dataBr(isoParaBrtLocal(ts).slice(0, 10))
}

/** "hoje" / "ontem" / "há N dias" / "nunca" (dias de calendário em Brasília). */
export function ultimoAcessoTxt(ts: string | null | undefined): string {
  if (!ts) return "nunca"
  const d = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z")
  const dias = Math.round((d(hojeBrt()) - d(isoParaBrtLocal(ts))) / DIA)
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : "há " + dias + " dias"
}

const limpaBusca = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim().slice(0, 80)
const colInexistente = (m?: string) => /column|does not exist|schema cache/i.test(m ?? '')

// ═══════════════════════════════ GRUPOS (base compartilhada) ═══════════════════════════════

type GrupoBase = { id: string; nome: string; pai_id: string | null; is_mestre: boolean }

/** Todos os grupos/pastas do tenant (poucos: dezenas/centenas). Tolerante a pai_id/is_mestre ausentes. */
async function todosGrupos(tenantId: string): Promise<GrupoBase[]> {
  const svc = createAdminClient()
  for (const cols of ['id, nome, pai_id, is_mestre', 'id, nome']) {
    try {
      const rows = await fetchAll<any>(() => svc.from('simulado_grupos').select(cols).eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }))
      return rows.map((g) => ({ id: g.id, nome: g.nome, pai_id: g.pai_id ?? null, is_mestre: g.is_mestre === true }))
    } catch { /* tenta a coluna mais pobre */ }
  }
  return []
}

/** grupo_id → origem real (mapeamentos de integração Guru/Curseduca; o resto é manual) + código Guru. */
export async function origemDosGrupos(tenantId: string): Promise<{ origem: Map<string, OrigemGrupo>; guru: Map<string, string> }> {
  const svc = createAdminClient()
  const origem = new Map<string, OrigemGrupo>()
  const guru = new Map<string, string>()
  try {
    const maps = await fetchAll<{ id: string; grupo_id: string | null; provider: string | null; fonte_ref: string | null }>(() =>
      svc.from('simulado_integracao_mapeamentos').select('id, grupo_id, provider, fonte_ref').eq('tenant_id', tenantId).not('grupo_id', 'is', null).order('id', { ascending: true }))
    for (const m of maps) {
      if (!m.grupo_id || !m.provider) continue
      if (m.provider === 'guru') { origem.set(m.grupo_id, 'guru'); if (m.fonte_ref && !guru.has(m.grupo_id)) guru.set(m.grupo_id, m.fonte_ref) }
      else if (m.provider === 'curseduca' && !origem.has(m.grupo_id)) origem.set(m.grupo_id, 'curseduca')
    }
  } catch { /* tabela ausente → tudo manual */ }
  return { origem, guru }
}

/** Opções de grupo (não-pasta, fora da pasta "Encerrados") para selects de liberar/novo membro/evento. */
export async function gruposOpcoes(tenantId: string, incluirEncerrados = false): Promise<GrupoOpcao[]> {
  return remember(chaveRelatorio(tenantId, 'cs-grupos-opcoes', incluirEncerrados ? 1 : 0), 60, async () => {
    const todos = await todosGrupos(tenantId)
    const nomePasta = new Map(todos.filter((g) => g.is_mestre).map((g) => [g.id, g.nome]))
    return todos
      .filter((g) => !g.is_mestre)
      .map((g) => ({ id: g.id, nome: g.nome, pasta: g.pai_id ? nomePasta.get(g.pai_id) ?? null : null }))
      .filter((g) => incluirEncerrados || !/encerrad/i.test(g.pasta ?? ''))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  })
}

/** Cursos (produtos ativos) que um grupo pode liberar. */
export async function cursosOpcoes(tenantId: string): Promise<CursoOpcao[]> {
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_produtos').select('id, nome').eq('tenant_id', tenantId).eq('ativo', true).order('ordem', { ascending: true }).order('id', { ascending: true }).limit(500)
    return (data ?? []).map((p: any) => ({ id: p.id, nome: p.nome }))
  } catch { return [] }
}

/** grupo_id → cursos (produtos) que ele libera, via simulado_produto_itens(tipo_item='grupo'). */
async function cursosDosGrupos(tenantId: string, grupoIds: string[]): Promise<Map<string, { id: string; nome: string }[]>> {
  const out = new Map<string, { id: string; nome: string }[]>()
  if (!grupoIds.length) return out
  const svc = createAdminClient()
  try {
    const itens = await fetchAllByIn<{ id: string; produto_id: string; item_id: string }>(grupoIds, (chunk) =>
      svc.from('simulado_produto_itens').select('id, produto_id, item_id').eq('tenant_id', tenantId).eq('tipo_item', 'grupo').eq('ativo', true).in('item_id', chunk).order('id', { ascending: true }))
    const pids = [...new Set(itens.map((i) => i.produto_id))]
    const nomes = new Map<string, string>()
    const prods = await fetchAllByIn<{ id: string; nome: string }>(pids, (chunk) => svc.from('simulado_produtos').select('id, nome').in('id', chunk).order('id', { ascending: true }))
    for (const p of prods) nomes.set(p.id, p.nome)
    for (const i of itens) {
      const n = nomes.get(i.produto_id); if (!n) continue
      const arr = out.get(i.item_id) ?? []; arr.push({ id: i.produto_id, nome: n }); out.set(i.item_id, arr)
    }
  } catch { /* tabela de produtos ausente → sem cursos */ }
  return out
}

export function validadeTexto(g: { validade_tipo?: string | null; validade_meses?: number | null; validade_ate?: string | null }, maxExp: string | null, semExp: number, total: number): string {
  if (g.validade_tipo === 'meses_apos_compra' && g.validade_meses) return `${g.validade_meses} ${g.validade_meses === 1 ? 'mês' : 'meses'} após a compra`
  if (g.validade_tipo === 'ate_data' && g.validade_ate) return `até ${dataBr(g.validade_ate)}`
  if (g.validade_tipo === 'vitalicio') return 'Vitalício'
  if (!total) return '—'
  if (!maxExp) return 'Vitalício'
  return `até ${dataBrTs(maxExp)}`
}

type AggGrupo = { total: number; vencendo: number; maxExp: string | null; semExp: number }

async function agregadosGrupos(tenantId: string, ids: string[]): Promise<Map<string, AggGrupo>> {
  const m = new Map<string, AggGrupo>()
  if (!ids.length) return m
  const rows = await sqlQuery<{ grupo_id: string; total: number; vencendo: number; max_exp: string | Date | null; sem_exp: number }>(
    `SELECT grupo_id, count(*)::int AS total,
            count(*) FILTER (WHERE expira_em IS NOT NULL AND expira_em >= now() AND expira_em < now() + interval '30 days')::int AS vencendo,
            max(expira_em) AS max_exp,
            count(*) FILTER (WHERE expira_em IS NULL)::int AS sem_exp
       FROM simulado_grupo_membros
      WHERE tenant_id = $1 AND grupo_id = ANY($2::uuid[])
      GROUP BY grupo_id`, [tenantId, ids])
  if (rows) {
    for (const id of ids) m.set(id, { total: 0, vencendo: 0, maxExp: null, semExp: 0 })
    for (const r of rows) m.set(r.grupo_id, { total: Number(r.total) || 0, vencendo: Number(r.vencendo) || 0, maxExp: r.max_exp ? new Date(r.max_exp as any).toISOString() : null, semExp: Number(r.sem_exp) || 0 })
    return m
  }
  // Fallback PostgREST (sem DATABASE_URL, ou sem a coluna expira_em): contagem por grupo; sem vencimento.
  const svc = createAdminClient()
  const c = await grupoContagensSql(ids, tenantId)
  if (c) for (const r of c) m.set(r.grupo_id, { total: Number(r.total) || 0, vencendo: 0, maxExp: null, semExp: Number(r.total) || 0 })
  else await Promise.all(ids.map(async (id) => {
    const { count } = await svc.from('simulado_grupo_membros').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('grupo_id', id)
    m.set(id, { total: count ?? 0, vencendo: 0, maxExp: null, semExp: count ?? 0 })
  }))
  return m
}

/** KPIs da tela de Grupos (tenant inteiro; cache 60 s). */
export async function gruposKpis(tenantId: string): Promise<GruposKpis> {
  return remember(chaveRelatorio(tenantId, 'cs-grupos-kpis'), 60, async () => {
    const todos = (await todosGrupos(tenantId)).filter((g) => !g.is_mestre)
    const ids = todos.map((g) => g.id)
    const sql = await sqlQuery<{ vinculos: number; vencendo: number }>(
      `SELECT count(*)::int AS vinculos,
              count(DISTINCT grupo_id) FILTER (WHERE expira_em IS NOT NULL AND expira_em >= now() AND expira_em < now() + interval '30 days')::int AS vencendo
         FROM simulado_grupo_membros WHERE tenant_id = $1 AND grupo_id = ANY($2::uuid[])`, [tenantId, ids])
    let vinculos = 0, vencendo = 0
    if (sql && sql[0]) { vinculos = Number(sql[0].vinculos) || 0; vencendo = Number(sql[0].vencendo) || 0 }
    else {
      const c = await agregadosGrupos(tenantId, ids)
      for (const a of c.values()) { vinculos += a.total; if (a.vencendo > 0) vencendo++ }
    }
    const comCurso = await cursosDosGrupos(tenantId, ids)
    const semCurso = todos.filter((g) => !(comCurso.get(g.id)?.length)).length
    return { grupos: todos.length, vinculos, vencendo, semCurso }
  })
}

/** Pastas (grupos mestre) + "Todos" + "Sem pasta" com contagem de grupos. */
export async function gruposPastas(tenantId: string): Promise<PastaGrupo[]> {
  const todos = await todosGrupos(tenantId)
  const filhos = todos.filter((g) => !g.is_mestre)
  const out: PastaGrupo[] = [{ id: null, nome: 'Todos', total: filhos.length }]
  for (const p of todos.filter((g) => g.is_mestre).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    out.push({ id: p.id, nome: p.nome, total: filhos.filter((g) => g.pai_id === p.id).length })
  const sem = filhos.filter((g) => !g.pai_id).length
  if (sem > 0) out.push({ id: 'sem', nome: 'Sem pasta', total: sem })
  return out
}

export type GruposParams = { pasta: string; q: string; sort: string; dir: 'asc' | 'desc'; page: number; pp: number }

export async function gruposLista(tenantId: string, p: GruposParams): Promise<{ rows: GrupoLinha[]; total: number }> {
  const svc = createAdminClient()
  const nomePasta = new Map((await todosGrupos(tenantId)).filter((g) => g.is_mestre).map((g) => [g.id, g.nome]))
  const q = limpaBusca(p.q)
  const colsRicas = 'id, nome, pai_id, is_mestre, codigo_externo, validade_tipo, validade_meses, validade_ate'
  const colsMedias = 'id, nome, pai_id, is_mestre, codigo_externo'
  let data: any[] | null = null, count: number | null = null
  for (const cols of [colsRicas, colsMedias, 'id, nome']) {
    let qb: any = svc.from('simulado_grupos').select(cols, { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
    if (cols.includes('is_mestre')) qb = qb.eq('is_mestre', false)
    if (cols.includes('pai_id')) {
      if (p.pasta === 'sem') qb = qb.is('pai_id', null)
      else if (p.pasta && p.pasta !== 'todos') qb = qb.eq('pai_id', p.pasta)
    }
    if (q) qb = qb.ilike('nome', `%${q}%`)
    const col = p.sort === 'nome' ? 'nome' : 'nome'
    const r = await qb.order(col, { ascending: p.dir === 'asc' }).order('id', { ascending: true }).range((p.page - 1) * p.pp, p.page * p.pp - 1)
    if (!r.error) { data = r.data; count = r.count; break }
    if (!colInexistente(r.error.message)) break
  }
  const base = data ?? []
  const ids = base.map((g) => g.id as string)
  const [agg, orig, cursos] = await Promise.all([agregadosGrupos(tenantId, ids), origemDosGrupos(tenantId), cursosDosGrupos(tenantId, ids)])
  const rows: GrupoLinha[] = base.map((g) => {
    const a = agg.get(g.id) ?? { total: 0, vencendo: 0, maxExp: null, semExp: 0 }
    const codigoGuru = orig.guru.get(g.id) ?? null
    return {
      id: g.id, nome: g.nome,
      pasta: g.pai_id ? nomePasta.get(g.pai_id) ?? null : null, pastaId: g.pai_id ?? null,
      origem: orig.origem.get(g.id) ?? (g.codigo_externo ? 'curseduca' : 'manual'),
      membros: a.total, vencendo30: a.vencendo,
      validade: validadeTexto(g, a.maxExp, a.semExp, a.total),
      validadeTipo: g.validade_tipo ?? null, validadeMeses: g.validade_meses ?? null,
      validadeAte: g.validade_ate ?? null, codigoGuru, cursos: cursos.get(g.id) ?? [],
    }
  })
  return { rows, total: count ?? rows.length }
}

// ═══════════════════════════════ MEMBROS ═══════════════════════════════

export async function membrosContagens(tenantId: string): Promise<MembrosContagens> {
  return remember(chaveRelatorio(tenantId, 'cs-membros-cont'), 120, async () => {
    const svc = createAdminClient()
    const base = () => svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false)
    const c7 = corte7d()
    const [tot, bloq, risco, semana] = await Promise.all([
      base(),
      base().eq('acesso_bloqueado', true),
      base().eq('acesso_bloqueado', false).lt('ultimo_acesso_em', c7),
      base().gte('ultimo_acesso_em', c7),
    ])
    const total = tot.count ?? 0
    if (bloq.error && colInexistente(bloq.error.message)) return { migrado: false, total, ativos: total, risco: 0, bloqueados: 0, semana: 0 }
    const bloqueados = bloq.count ?? 0, r = risco.count ?? 0
    return { migrado: true, total: total - bloqueados, ativos: Math.max(0, total - bloqueados - r), risco: r, bloqueados, semana: semana.count ?? 0 }
  })
}

/** Títulos (cargos) de nível da gamificação do tenant — cache 5 min (config muda raramente). */
async function titulosGam(svc: any, tenantId: string): Promise<TituloNivel[]> {
  return remember(chaveRelatorio(tenantId, 'cs-gam-titulos'), 300, async () => {
    const cfg = await getGamConfig(svc, tenantId).catch(() => null)
    return (cfg?.nivel_curva?.titulos ?? []) as TituloNivel[]
  }).catch(() => [] as TituloNivel[])
}

export type MembrosParams = { f: MembrosFiltro; q: string; sort: string; dir: 'asc' | 'desc'; page: number; pp: number; totalHint?: number }
const SORT_MEMBROS: Record<string, string> = { nome: 'nome', email: 'email', ultimo_acesso: 'ultimo_acesso_em', cadastro: 'created_at' }

export async function membrosLista(tenantId: string, p: MembrosParams): Promise<{ rows: MembroLinha[]; total: number; migrado: boolean }> {
  const svc = createAdminClient()
  const q = limpaBusca(p.q)
  const c7 = corte7d()
  // sem busca, o total já é conhecido (contagens em cache) → dispensa o count exato (a parte mais lenta em 21 mil linhas)
  const usaHint = !q && p.totalHint != null
  const montar = (cols: string, migrado: boolean) => {
    let qb: any = svc.from('simulado_estudantes').select(cols, usaHint ? undefined : { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
    if (migrado) {
      if (p.f === 'bloq') qb = qb.eq('acesso_bloqueado', true)
      else if (p.f === 'risco') qb = qb.eq('acesso_bloqueado', false).lt('ultimo_acesso_em', c7)
      else if (p.f === 'ativos') qb = qb.eq('acesso_bloqueado', false).or(`ultimo_acesso_em.is.null,ultimo_acesso_em.gte.${c7}`)
    }
    if (q) {
      const ors = [`nome.ilike.%${q}%`, `email.ilike.%${q}%`, `cpf.ilike.%${q}%`, `telefone.ilike.%${q}%`]
      if (q.includes('@')) ors.push(`emails_secundarios.cs.{${q.toLowerCase().replace(/[{}]/g, '')}}`)
      qb = qb.or(ors.join(','))
    }
    const col = SORT_MEMBROS[p.sort] ?? (migrado ? 'ultimo_acesso_em' : 'nome')
    const dir = SORT_MEMBROS[p.sort] ? p.dir === 'asc' : (migrado ? false : true)
    return qb.order(migrado ? col : (col === 'ultimo_acesso_em' ? 'nome' : col), { ascending: dir, nullsFirst: false }).order('id', { ascending: true }).range((p.page - 1) * p.pp, p.page * p.pp - 1)
  }
  let migrado = true
  const COLS = 'id, nome, email, avatar, perfil_avatar_cor, perfil_capa, created_at'
  let r = await montar(`${COLS}, acesso_bloqueado, ultimo_acesso_em`, true)
  if (r.error && colInexistente(r.error.message)) { migrado = false; r = await montar(COLS, false) }
  if (r.error && colInexistente(r.error.message)) r = await montar('id, nome, email, created_at', false) // sem avatar no schema
  const base: any[] = r.data ?? []
  const ids = base.map((e) => e.id as string)
  const [gm, gam, cfg] = await Promise.all([
    fetchAllByIn<{ id: string; estudante_id: string }>(ids, (chunk) =>
      svc.from('simulado_grupo_membros').select('id, estudante_id').eq('tenant_id', tenantId).in('estudante_id', chunk).order('id', { ascending: true })),
    // nível de gamificação (só leitura) — tolerante: tabela/coluna ausente = sem nível
    fetchAllByIn<{ estudante_id: string; nivel: number | null }>(ids, (chunk) =>
      svc.from('simulado_gamificacao_estudante').select('estudante_id, nivel').eq('tenant_id', tenantId).in('estudante_id', chunk).order('estudante_id', { ascending: true })).catch(() => []),
    titulosGam(svc, tenantId),
  ])
  const nGrupos = new Map<string, number>()
  for (const m of gm) nGrupos.set(m.estudante_id, (nGrupos.get(m.estudante_id) ?? 0) + 1)
  const nivelDe = new Map<string, number>()
  for (const g of gam) if (g.nivel != null) nivelDe.set(g.estudante_id, g.nivel)
  const titulos = cfg
  const rows: MembroLinha[] = base.map((e) => {
    const bloqueado = e.acesso_bloqueado === true
    const ult: string | null = e.ultimo_acesso_em ?? null
    const nivel = nivelDe.get(e.id) ?? null
    const cargo = nivel != null ? cargoParaNivel(nivel, titulos) : null
    return {
      id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null, bloqueado, ultimoAcesso: ult, ultimoTxt: ultimoAcessoTxt(ult), grupos: nGrupos.get(e.id) ?? 0, risco: !bloqueado && !!ult && ult < c7,
      avatar: e.avatar ?? null, avatarCor: e.perfil_avatar_cor ?? null, perfilCapa: e.perfil_capa ?? null, nivel, cargo: cargo?.titulo || null, cargoIcone: cargo?.icone ?? null,
    }
  })
  return { rows, total: usaHint ? p.totalHint! : (r.count ?? rows.length), migrado }
}

/** Detalhe de 1 membro (painel da direita): grupos com validade/origem, grupos liberáveis e métricas do plano. */
export async function membroDetalhe(tenantId: string, id: string): Promise<MembroDetalhe | null> {
  const svc = createAdminClient()
  let est: any = null
  {
    const r = await svc.from('simulado_estudantes').select('id, nome, email, acesso_bloqueado, ultimo_acesso_em').eq('tenant_id', tenantId).eq('id', id).eq('deletado', false).maybeSingle()
    if (r.error && colInexistente(r.error.message)) {
      est = (await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).eq('id', id).eq('deletado', false).maybeSingle()).data
    } else est = r.data
  }
  if (!est) return null
  const [vincRes, todos, orig, opcoes] = await Promise.all([
    (async () => {
      const r = await svc.from('simulado_grupo_membros').select('id, grupo_id, expira_em').eq('tenant_id', tenantId).eq('estudante_id', id).order('id', { ascending: true }).limit(500)
      if (r.error && colInexistente(r.error.message)) return ((await svc.from('simulado_grupo_membros').select('id, grupo_id').eq('tenant_id', tenantId).eq('estudante_id', id).order('id', { ascending: true }).limit(500)).data ?? []) as any[]
      return (r.data ?? []) as any[]
    })(),
    (async () => {
      for (const cols of ['id, nome, is_mestre, validade_tipo, validade_meses, validade_ate', 'id, nome, is_mestre', 'id, nome']) {
        const r = await svc.from('simulado_grupos').select(cols).eq('tenant_id', tenantId).eq('deletado', false).limit(2000)
        if (!r.error) return (r.data ?? []) as any[]
      }
      return [] as any[]
    })(),
    origemDosGrupos(tenantId),
    gruposOpcoes(tenantId),
  ])
  const gById = new Map(todos.map((g) => [g.id as string, g]))
  const grupos: MembroGrupoVinculo[] = []
  for (const v of vincRes) {
    const g = gById.get(v.grupo_id); if (!g || g.is_mestre) continue
    const validade = v.expira_em ? `até ${dataBrTs(v.expira_em)}` : validadeTexto(g, null, 0, 0) === '—' ? 'Sem validade' : validadeTexto(g, null, 0, 0)
    grupos.push({ grupoId: g.id, nome: g.nome, validade, origem: orig.origem.get(g.id) ?? 'manual' })
  }
  const meus = new Set(grupos.map((g) => g.grupoId))
  const liberaveis = opcoes.filter((o) => !meus.has(o.id))
  const ult: string | null = est.ultimo_acesso_em ?? null
  const bloqueado = est.acesso_bloqueado === true
  return {
    id: est.id, nome: est.nome ?? 'Aluno', email: est.email ?? null, bloqueado, ultimoAcesso: ult, ultimoTxt: ultimoAcessoTxt(ult),
    risco: !bloqueado && !!ult && ult < corte7d(), grupos, liberaveis, metricas: await metricasPlano(tenantId, id),
  }
}

/** Métricas do plano fixado do aluno (Cronograma Adaptativo): % concluído, metas na última semana, média de estrelas. */
export async function metricasPlano(tenantId: string, estId: string): Promise<MembroDetalhe['metricas']> {
  const vazio = { planoPct: null, metasSemana: null, mediaEstrelas: null }
  try {
    const svc = createAdminClient()
    const { data: planos } = await svc.from('simulado_cronograma_adaptativo_plano').select('id, fixado, arquivada, criado_em').eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false).order('fixado', { ascending: false }).order('criado_em', { ascending: false }).limit(1)
    const plano = planos?.[0] as { id: string } | undefined
    if (!plano) return vazio
    const c7 = corte7d()
    const [tot, feitas, sem, est] = await Promise.all([
      svc.from('simulado_cronograma_adaptativo_plano_meta').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('plano_id', plano.id),
      svc.from('simulado_cronograma_adaptativo_meta').select('meta_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('plano_id', plano.id).eq('estado', 'done'),
      svc.from('simulado_cronograma_adaptativo_meta').select('meta_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('plano_id', plano.id).eq('estado', 'done').gte('atualizado_em', c7),
      svc.from('simulado_cronograma_adaptativo_meta').select('estrelas').eq('tenant_id', tenantId).eq('plano_id', plano.id).not('estrelas', 'is', null).limit(1000),
    ])
    const t = tot.count ?? 0
    const e = (est.data ?? []) as { estrelas: number }[]
    return {
      planoPct: t > 0 ? Math.round(((feitas.count ?? 0) / t) * 100) : null,
      metasSemana: sem.count ?? 0,
      mediaEstrelas: e.length ? Math.round((e.reduce((a, x) => a + Number(x.estrelas), 0) / e.length) * 10) / 10 : null,
    }
  } catch { return vazio }
}

// ═══════════════════════════════ CALENDÁRIO ═══════════════════════════════

export async function eventosPeriodo(tenantId: string, de: string, ate: string): Promise<{ eventos: EventoCal[]; ok: boolean }> {
  const svc = createAdminClient()
  const r = await svc.from('simulado_eventos_calendario').select('id, titulo, tipo, data, hora, grupo_id, link, lembrete_1h').eq('tenant_id', tenantId).gte('data', de).lte('data', ate).order('data', { ascending: true }).order('hora', { ascending: true }).order('id', { ascending: true }).range(0, 999)
  if (r.error) return { eventos: [], ok: false }
  const rows = (r.data ?? []) as any[]
  const gids = [...new Set(rows.map((e) => e.grupo_id).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()
  const gs = await fetchAllByIn<{ id: string; nome: string }>(gids, (chunk) => svc.from('simulado_grupos').select('id, nome').in('id', chunk).order('id', { ascending: true }))
  for (const g of gs) nomes.set(g.id, g.nome)
  return {
    ok: true,
    eventos: rows.map((e) => ({
      id: e.id, titulo: e.titulo, tipo: e.tipo as EventoTipo, data: String(e.data).slice(0, 10), hora: String(e.hora).slice(0, 5),
      grupoId: e.grupo_id ?? null, grupoNome: e.grupo_id ? nomes.get(e.grupo_id) ?? null : null, link: e.link ?? null, lembrete: e.lembrete_1h !== false,
    })),
  }
}

// ═══════════════════════════════ CAMPANHAS ═══════════════════════════════

export async function apiConfig(tenantId: string): Promise<{ cfg: ApiConfig; ok: boolean }> {
  const svc = createAdminClient()
  const r = await svc.from('simulado_campanha_api_config').select('provedor, numero, conectada').eq('tenant_id', tenantId).maybeSingle()
  const padrao: ApiConfig = { provedor: API_PROVEDORES[0], numero: '', conectada: false }
  if (r.error) return { cfg: padrao, ok: false }
  const d = r.data as any
  return { ok: true, cfg: d ? { provedor: d.provedor ?? padrao.provedor, numero: d.numero ?? '', conectada: d.conectada === true } : padrao }
}

export async function campanhasRecentes(tenantId: string, canal: 'email' | 'api', limite = 6): Promise<CampanhaResumo[]> {
  const svc = createAdminClient()
  const r = await svc.from('simulado_campanhas').select('id, canal, assunto, mensagem, publico, estimativa, status, agendado_para, criado_em, entregues_pct, abriram_pct, clicaram_pct')
    .eq('tenant_id', tenantId).eq('canal', canal).order('criado_em', { ascending: false }).order('id', { ascending: true }).limit(limite)
  if (r.error) return []
  return ((r.data ?? []) as any[]).map((c) => ({
    id: c.id, canal: c.canal, titulo: c.assunto || String(c.mensagem).slice(0, 60), criadoEm: c.criado_em,
    publicoTxt: ((c.publico ?? []) as PublicoItem[]).map((p) => p.nome).join(', ') || '—', estimativa: c.estimativa ?? 0,
    status: c.status, agendadoPara: c.agendado_para ?? null,
    p1: c.canal === 'api' ? c.entregues_pct ?? null : c.abriram_pct ?? null,
    p2: c.canal === 'api' ? c.abriram_pct ?? null : c.clicaram_pct ?? null,
    p3: c.canal === 'api' ? c.clicaram_pct ?? null : null,
  }))
}

// ═══════════════════════════════ AVISOS ═══════════════════════════════

export type AvisosParams = { q: string; local: string; sort: string; dir: 'asc' | 'desc'; page: number; pp: number }
const SORT_AVISOS: Record<string, string> = { titulo: 'titulo', ate: 'ate', ativo: 'ativo', criado: 'criado_em' }

function localDe(b: { local?: string | null; tipo?: string | null }): AvisoLocal {
  if (b.local && AVISO_LOCAIS.some((l) => l.k === b.local)) return b.local as AvisoLocal
  return b.tipo === 'popup' ? 'popup' : b.tipo === 'hero' ? 'banner' : 'faixa'
}

export async function avisosLista(tenantId: string, p: AvisosParams): Promise<{ rows: AvisoLinha[]; total: number; migrado: boolean }> {
  const svc = createAdminClient()
  const q = limpaBusca(p.q)
  const montar = (cols: string, migrado: boolean) => {
    let qb: any = svc.from('simulado_banners').select(cols, { count: 'exact' }).eq('tenant_id', tenantId)
    if (q) qb = qb.ilike('titulo', `%${q}%`)
    const loc = AVISO_LOCAIS.find((l) => l.k === p.local)
    if (loc) {
      if (migrado) qb = qb.or(`local.eq.${loc.k},and(local.is.null,tipo.eq.${loc.k === 'faixa' ? 'banner' : loc.k === 'popup' ? 'popup' : 'hero'})`)
      else qb = qb.eq('tipo', loc.k === 'faixa' ? 'banner' : loc.k === 'popup' ? 'popup' : 'hero')
    }
    const col = SORT_AVISOS[p.sort] && (migrado || SORT_AVISOS[p.sort] !== 'ate') ? SORT_AVISOS[p.sort] : 'criado_em'
    const asc = SORT_AVISOS[p.sort] ? p.dir === 'asc' : false
    return qb.order(col, { ascending: asc, nullsFirst: false }).order('id', { ascending: true }).range((p.page - 1) * p.pp, p.page * p.pp - 1)
  }
  let migrado = true
  let r = await montar('id, tipo, titulo, imagem_url, ativo, criado_em, local, grupo_id, ate', true)
  if (r.error && colInexistente(r.error.message)) { migrado = false; r = await montar('id, tipo, titulo, imagem_url, ativo, criado_em', false) }
  const base: any[] = r.data ?? []
  const gids = [...new Set(base.map((b) => b.grupo_id).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()
  const gs = await fetchAllByIn<{ id: string; nome: string }>(gids, (chunk) => svc.from('simulado_grupos').select('id, nome').in('id', chunk).order('id', { ascending: true }))
  for (const g of gs) nomes.set(g.id, g.nome)
  // "Sai do ar" dos avisos criados no editor rico (agendaFim guardado no tema) quando a coluna `ate` está vazia.
  let agendaFim: Record<string, { agendaFim?: string }> = {}
  try { const { data: t } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle(); agendaFim = ((t?.tema as any)?.banner_destaques ?? {}) } catch { /* sem tema */ }
  const rows: AvisoLinha[] = base.map((b) => ({
    id: b.id, titulo: b.titulo ?? '(sem título)', local: localDe(b), grupoNome: b.grupo_id ? nomes.get(b.grupo_id) ?? null : null,
    ate: b.ate ?? (agendaFim[b.id]?.agendaFim ? new Date(agendaFim[b.id].agendaFim as string).toISOString() : null),
    ativo: b.ativo !== false, tem_imagem: !!b.imagem_url,
  }))
  return { rows, total: r.count ?? rows.length, migrado }
}
