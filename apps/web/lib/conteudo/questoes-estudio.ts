import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// BANCO DE QUESTÕES do Estúdio (admin): lista + facetas + opções das questões DE UM banco (simulado_questao_pasta).
// Tudo no servidor, SQL agregado. Facetas = núcleo compartilhado (lib/filtros/facetas-core). Sempre isolado por tenant ($1).
// Sem SQL direto (DATABASE_URL ausente) a lista cai num fallback PostgREST SEM os filtros do card (`degradado: true`).

import { sqlQuery } from '@/lib/data/sql'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { calcularFacetasCore } from '@/lib/filtros/facetas-core'
import { DIMS_ADMIN } from '@/lib/filtros/questoes-sql'
import {
  ORDEM_BANCO_SQL, baseBancoSql, idsDaContagem, ordemBanco, whereBancoSql,
  type ContagensEstudio, type FacetasEstudio, type FiltrosEstudio, type OpcoesEstudio,
} from './questoes-estudio-filtros'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FALLBACK = 5000
const MAX_LISTA = 5000

export interface LinhaBancoEstudio {
  id: string; numero: number; enunciado: string; tipo: string | null; ano: number | null; nivel_dificuldade: string | null; status: string | null
  comentario_professor: string | null; assunto_detalhe: string | null; cargo: string | null
  disciplina: string | null; assunto: string | null; banca: string | null; orgao: string | null
}
export interface OpcoesListagem { sort?: string | null; dir?: 'asc' | 'desc'; page?: number; pp?: number; somenteId?: string }

/** Facetas (total + contagem por opção) do banco, com os filtros do card aplicados (cada dimensão ignora o próprio filtro). */
export async function facetasBancoEstudio(tenantId: string, bancoId: string, f: FiltrosEstudio): Promise<FacetasEstudio | null> {
  if (!UUID.test(bancoId)) return null
  const base = baseBancoSql(tenantId, bancoId, f)
  const r = await calcularFacetasCore({ sql: base.sql, params: base.params }, f.sel, DIMS_ADMIN)
  return r ? { total: r.total, contagens: r.contagens as ContagensEstudio } : null
}

/** Opções do card = o que EXISTE no banco (chaves da contagem sem filtros) com nomes do cadastro do tenant; assuntos trazem os ancestrais (árvore). */
export async function opcoesBancoEstudio(tenantId: string, base: ContagensEstudio): Promise<OpcoesEstudio> {
  const ids = (d: 'disciplina' | 'assunto' | 'banca' | 'orgao' | 'etiqueta') => idsDaContagem(base, d).filter((x) => UUID.test(x))
  const nomes = async (tabela: string, lista: string[], extraWhere = '') => lista.length
    ? (await sqlQuery<{ id: string; nome: string }>(`select id::text as id, nome from ${tabela} where tenant_id = $1 and id = any($2::uuid[])${extraWhere} order by nome`, [tenantId, lista])) ?? []
    : []
  const idsAss = ids('assunto')
  const [disciplinas, bancas, orgaos, etiquetas, assuntos, detalhes] = await Promise.all([
    nomes('simulado_disciplinas', ids('disciplina')),
    nomes('simulado_bancas', ids('banca')),
    nomes('simulado_orgaos', ids('orgao')),
    nomes('simulado_etiquetas', ids('etiqueta'), ' and deletado = false'),
    idsAss.length
      ? sqlQuery<{ id: string; nome: string; pai_id: string | null; disciplina_id: string | null }>(
        `with recursive t as (
           select a.id, a.nome, a.pai_id, a.disciplina_id from simulado_assuntos a where a.tenant_id = $1 and a.id = any($2::uuid[])
           union
           select p.id, p.nome, p.pai_id, p.disciplina_id from simulado_assuntos p join t on p.id = t.pai_id where p.tenant_id = $1
         ) select id::text as id, nome, pai_id::text as pai_id, disciplina_id::text as disciplina_id from t order by nome`, [tenantId, idsAss]).then((r) => r ?? [])
      : Promise.resolve([]),
    // tópico específico (assunto_detalhe) → a que assunto pertence (só os que existem nas contagens do banco)
    idsDaContagem(base, 'detalhe').length
      ? sqlQuery<{ assunto_id: string; nome: string }>(
        `select distinct q.assunto_id::text as assunto_id, nullif(btrim(q.assunto_detalhe), '') as nome
           from simulado_questoes q where q.tenant_id = $1 and q.deletado = false and q.assunto_id is not null
            and nullif(btrim(q.assunto_detalhe), '') = any($2::text[]) order by 2`, [tenantId, idsDaContagem(base, 'detalhe')]).then((r) => r ?? [])
      : Promise.resolve([]),
  ])
  const ptbr = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
  return {
    disciplinas, bancas, orgaos, etiquetas, assuntos, detalhes: detalhes.filter((d) => !!d.nome),
    cargos: idsDaContagem(base, 'cargo').sort(ptbr),
    anos: idsDaContagem(base, 'ano').map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => b - a),
  }
}

/** Contagem total do banco (sem filtros). */
export async function contarQuestoesDoBanco(tenantId: string, bancoId: string): Promise<number | null> {
  const b = baseBancoSql(tenantId, bancoId, { q: '', com: '' })
  const r = await sqlQuery<{ n: number }>(`select count(*)::int as n from simulado_questoes q where ${b.sql}`, b.params)
  return r ? Number(r[0]?.n ?? 0) : null
}

function linha(r: any): LinhaBancoEstudio {
  return {
    id: r.id, numero: Number(r.numero ?? 0), enunciado: r.enunciado ?? '', tipo: r.tipo ?? null, ano: typeof r.ano === 'number' ? r.ano : (r.ano != null ? Number(r.ano) : null),
    nivel_dificuldade: r.nivel_dificuldade ?? null, status: r.status ?? null, comentario_professor: r.comentario_professor ?? null,
    assunto_detalhe: r.assunto_detalhe ?? null, cargo: r.cargo ?? null,
    disciplina: r.disciplina ?? null, assunto: r.assunto ?? null, banca: r.banca ?? null, orgao: r.orgao ?? null,
  }
}

/**
 * Questões do banco já filtradas/ordenadas/paginadas NO BANCO. `page/pp` ausentes = todas (até 5000, p/ telas em modo local).
 * Numeração estável = ordem de criação dentro do banco (independe dos filtros).
 */
export async function listarQuestoesBanco(
  svc: SupabaseClient, tenantId: string, bancoId: string, f: FiltrosEstudio, o: OpcoesListagem = {},
): Promise<{ rows: LinhaBancoEstudio[]; total: number; degradado: boolean }> {
  const dir = o.dir === 'desc' ? 'desc' : 'asc'
  const chave = ordemBanco(o.sort)
  const w = whereBancoSql(tenantId, bancoId, f, o.somenteId)
  const paginado = !!(o.pp && o.pp > 0)
  const pp = paginado ? o.pp! : MAX_LISTA
  const page = Math.max(1, o.page ?? 1)
  const params = [...w.params, pp, (page - 1) * pp]
  const lim = `$${params.length - 1}`, off = `$${params.length}`
  const SQL = `
    with b as (
      select q.id, row_number() over (order by q.created_at, q.id)::int as numero
      from simulado_questoes q
      where q.tenant_id = $1 and q.deletado = false
        and q.id in (select qp.questao_id from simulado_questao_pasta qp where qp.tenant_id = $1 and qp.pasta_id = $2::uuid)
    )
    select q.id, b.numero, q.enunciado, q.tipo, q.ano, q.nivel_dificuldade, q.status, q.comentario_professor, q.assunto_detalhe, q.cargo,
           d.nome as disciplina, a.nome as assunto, bc.nome as banca, o.nome as orgao, count(*) over ()::int as total
    from simulado_questoes q
    join b on b.id = q.id
    left join simulado_disciplinas d on d.id = q.disciplina_id
    left join simulado_assuntos a on a.id = q.assunto_id
    left join simulado_bancas bc on bc.id = q.banca_id
    left join simulado_orgaos o on o.id = q.orgao_id
    where ${w.sql}
    order by ${ORDEM_BANCO_SQL[chave]} ${dir} nulls last, b.numero
    limit ${lim} offset ${off}`
  const r = await sqlQuery<any>(SQL, params)
  if (r) {
    if (!r.length && page > 1) {
      const c = await sqlQuery<{ n: number }>(`select count(*)::int as n from simulado_questoes q where ${w.sql}`, w.params)
      return { rows: [], total: Number(c?.[0]?.n ?? 0), degradado: false }
    }
    return { rows: r.map(linha), total: Number(r[0]?.total ?? 0), degradado: false }
  }
  return listarFallback(svc, tenantId, bancoId, f, o, { dir, chave, pp, page, paginado })
}

/** Fallback sem SQL direto: PostgREST, ignora os filtros do card (só `q` e "com/sem comentário"). */
async function listarFallback(
  svc: SupabaseClient, tenantId: string, bancoId: string, f: FiltrosEstudio, o: OpcoesListagem,
  p: { dir: 'asc' | 'desc'; chave: string; pp: number; page: number; paginado: boolean },
): Promise<{ rows: LinhaBancoEstudio[]; total: number; degradado: boolean }> {
  const vinc = await fetchAll<{ questao_id: string }>(() =>
    svc.from('simulado_questao_pasta').select('questao_id').eq('tenant_id', tenantId).eq('pasta_id', bancoId).order('questao_id', { ascending: true }))
  const ids = vinc.map((v) => v.questao_id).slice(0, MAX_FALLBACK)
  const todas = ids.length
    ? await fetchAllByIn<any>(ids, (chunk) =>
      svc.from('simulado_questoes')
        .select('id, enunciado, tipo, ano, nivel_dificuldade, status, comentario_professor, assunto_detalhe, cargo, created_at, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome), bancas:simulado_bancas(nome), orgaos:simulado_orgaos(nome)')
        .in('id', chunk).eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }), { chunk: 80 })
    : []
  todas.sort((a: any, b: any) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id).localeCompare(String(b.id)))
  const numerados: LinhaBancoEstudio[] = todas.map((x: any, i: number) => linha({ ...x, numero: i + 1, disciplina: x.disciplinas?.nome, assunto: x.assuntos?.nome, banca: x.bancas?.nome, orgao: x.orgaos?.nome }))
  const ql = f.q.toLowerCase()
  const com = (x: LinhaBancoEstudio) => !!(x.comentario_professor && x.comentario_professor.trim())
  let lista = numerados.filter((x) => (!o.somenteId || x.id === o.somenteId)
    && (!ql || x.enunciado.toLowerCase().includes(ql)) && (f.com === '' || (f.com === 'com') === com(x)))
  const mult = p.dir === 'asc' ? 1 : -1
  const rank: Record<string, number> = { facil: 0, medio: 1, dificil: 2 }
  lista = [...lista].sort((a, b) => {
    if (p.chave === 'ano') return ((a.ano ?? 0) - (b.ano ?? 0)) * mult
    if (p.chave === 'dificuldade') return ((rank[a.nivel_dificuldade ?? ''] ?? 99) - (rank[b.nivel_dificuldade ?? ''] ?? 99)) * mult
    return (a.numero - b.numero) * mult
  })
  const rows = p.paginado ? lista.slice((p.page - 1) * p.pp, p.page * p.pp) : lista
  return { rows, total: lista.length, degradado: true }
}
