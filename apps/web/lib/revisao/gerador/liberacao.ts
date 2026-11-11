import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { hojeBrt, lerCfgLiberacao, mapaDocsCronograma, type CfgLiberacao } from '@/lib/cronograma/adaptativo/liberacao'
import { limparBusca, norm, ordenarPor, paginarMemoria } from './comum-ger3'

// Sub-aba "Liberação" (Gerador): leitura do painel de liberação por data + listas de EXCEÇÕES (grupos e alunos) paginadas no servidor.
// A gravação continua na action existente `salvarPainelLiberacao` (checkPermission + auditoria + revalidate).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const soUuids = (l: string[]) => l.filter((x) => UUID.test(x))

export interface BaseLiberacao {
  cfg: CfgLiberacao; hoje: string
  conteudo: { aulas: number; legproc: number; materiais: number }
  /** planos de cronograma adaptativo ativos (contagem exata; não é "alunos distintos") */
  planos: number
}
export interface LinhaExcecao { id: string; nome: string; detalhe: string | null }
export interface PaginaExcecoes { itens: LinhaExcecao[]; total: number; pagina: number }

export async function carregarBaseLiberacao(svc: SupabaseClient, tenantId: string): Promise<BaseLiberacao> {
  const [cfg, mapa, planos] = await Promise.all([
    lerCfgLiberacao(svc, tenantId),
    mapaDocsCronograma(svc, tenantId),
    svc.from('simulado_cronograma_adaptativo_plano').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('arquivada', false).eq('exemplo', false),
  ])
  return { cfg, hoje: hojeBrt(), conteudo: { aulas: mapa.aulas, legproc: mapa.legproc, materiais: mapa.materiais }, planos: planos.count ?? 0 }
}

/** Todos os grupos do tenant (`.range()`+count), com a marca de quais estão isentos na config SALVA. */
export async function listarGruposLiberacao(svc: SupabaseClient, tenantId: string, isentos: string[], o: {
  q?: string; situ?: string; dir: 'asc' | 'desc'; pagina: number; porPagina: number
}): Promise<PaginaExcecoes> {
  const ids = soUuids(isentos)
  if (o.situ === 'isento' && !ids.length) return { itens: [], total: 0, pagina: 1 }
  let qb = svc.from('simulado_grupos').select('id, nome', { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
  const q = limparBusca(o.q)
  if (q) qb = qb.ilike('nome', `%${q}%`)
  if (o.situ === 'isento') qb = qb.in('id', ids)
  if (o.situ === 'nao' && ids.length) qb = qb.not('id', 'in', `(${ids.join(',')})`)
  const de = (o.pagina - 1) * o.porPagina
  const { data, count, error } = await qb.order('nome', { ascending: o.dir === 'asc' }).order('id').range(de, de + o.porPagina - 1)
  if (error) throw error
  return {
    total: count ?? 0, pagina: o.pagina,
    itens: ((data ?? []) as Array<{ id: string; nome: string | null }>).map((g) => ({ id: g.id, nome: g.nome || 'Grupo', detalhe: null })),
  }
}

/** Alunos na lista de exceções SALVA: busca por chunk de 80 ids, filtra/ordena/pagina no servidor. */
export async function listarAlunosExcecao(svc: SupabaseClient, tenantId: string, alunoIds: string[], o: {
  q?: string; dir: 'asc' | 'desc'; pagina: number; porPagina: number
}): Promise<PaginaExcecoes> {
  const ids = soUuids(alunoIds)
  if (!ids.length) return { itens: [], total: 0, pagina: 1 }
  const rows = await fetchAllByIn<{ id: string; nome: string | null; email: string | null }>(ids, (ch) =>
    svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).in('id', ch).order('id') as never, { chunk: 80 })
  const q = norm(o.q ?? '')
  let l = rows.map((e) => ({ id: e.id, nome: e.nome || 'Aluno', detalhe: e.email }))
  if (q) l = l.filter((e) => norm(`${e.nome} ${e.detalhe ?? ''}`).includes(q))
  l = ordenarPor(l, (e) => e.nome, o.dir)
  const pg = paginarMemoria(l, o.pagina, o.porPagina)
  return { itens: pg.itens, total: pg.total, pagina: pg.pagina }
}
