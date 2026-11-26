import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import type { Atribuicao } from './acesso-efetivo'

/** try com colunas novas; se a coluna/tabela não existe, cai no SELECT legado; se tudo falhar, []. */
export async function fetchTol<T>(primario: () => any, legado: () => any): Promise<T[]> {
  try { return await fetchAll<T>(primario) } catch { try { return await fetchAll<T>(legado) } catch { return [] } }
}
async function fetchTolByIn<T>(ids: string[], primario: (c: string[]) => any, legado: (c: string[]) => any): Promise<T[]> {
  if (!ids.length) return []
  try { return await fetchAllByIn<T>(ids, primario) } catch { try { return await fetchAllByIn<T>(ids, legado) } catch { return [] } }
}

function atribDe(tipo: 'grupo' | 'aluno', refId: string, r: any): Atribuicao {
  const origem = r?.origem === 'individual' ? 'individual' : r?.origem === 'via_pacote' ? 'via_pacote' : 'avulsa'
  return {
    tipo, grupoId: tipo === 'grupo' ? refId : null, estudanteId: tipo === 'aluno' ? refId : null, origem,
    liberadoDe: r?.liberado_de ?? null, liberadoAte: r?.liberado_ate ?? null,
    // ausentes (SELECT legado) = null → `permsDa` trata como liberado (igual ao gate antigo: atribuição = acesso cheio).
    podeLer: r?.pode_ler ?? null, podeBaixar: r?.pode_baixar ?? null, podeGrifar: r?.pode_grifar ?? null,
  }
}

const TTL_ATRIB_IDS = 60
const chaveAtribIds = (tenantId: string, tipo: 'pasta' | 'doc') => `conteudo:atrib-est-ids:${tenantId}:${tipo}`
/** Invalida o cache dos "nós com atribuição de aluno" (chamar ao gravar atribuições). Best-effort. */
export async function invalidarAtribuicoesCache(tenantId: string): Promise<void> {
  await Promise.all([esquecer(chaveAtribIds(tenantId, 'pasta')), esquecer(chaveAtribIds(tenantId, 'doc'))])
}

/** Atribuição "sentinela": só marca que o nó TEM atribuição de aluno (não casa com ninguém → alunoCasa=false). */
const SENTINELA: Atribuicao = { tipo: 'aluno', grupoId: null, estudanteId: null, origem: 'avulsa' } as Atribuicao

/**
 * Ids de nós (pasta/doc) do tenant que têm ≥1 atribuição de ALUNO (qualquer aluno). RPC agregada (uuid[]),
 * cache 60s por tenant (compartilhado por todos os alunos). null = RPC ausente (migração pendente) → legado.
 */
async function idsComAtribuicaoAluno(svc: any, tenantId: string, tipo: 'pasta' | 'doc'): Promise<Set<string> | null> {
  const arr = await remember<string[] | null>(chaveAtribIds(tenantId, tipo), TTL_ATRIB_IDS, async () => {
    const r = await svc.rpc('fn_ids_com_atribuicao_estudante', { p_tenant: tenantId, p_tipo: tipo })
    if (r.error || !Array.isArray(r.data)) return undefined as any // não cacheia falha
    return r.data as string[]
  })
  return Array.isArray(arr) ? new Set(arr) : null
}

/**
 * Atribuições (grupos + estudantes) por nó, já como `Atribuicao[]`. Tolerante a colunas/tabelas ausentes.
 * Das atribuições de ALUNO só carrega as DO PRÓPRIO `estId` (as dos outros são irrelevantes ao `alunoCasa`);
 * a existência de atribuição de outros alunos entra como sentinela (preserva "nó restrito" = atribs.length>0).
 * Antes: 1 query por requisição puxando TODOS os alunos de TODAS as pastas (milhões de linhas/dia).
 */
export async function carregarAtribuicoes(svc: any, tenantId: string, tipo: 'pasta' | 'doc', ids: string[], estId: string): Promise<Map<string, Atribuicao[]>> {
  const out = new Map<string, Atribuicao[]>()
  if (!ids.length) return out
  const tg = tipo === 'pasta' ? 'simulado_pasta_grupos' : 'simulado_conteudo_documento_grupos'
  const te = tipo === 'pasta' ? 'simulado_pasta_estudantes' : 'simulado_conteudo_documento_estudantes'
  const key = tipo === 'pasta' ? 'pasta_id' : 'documento_id'
  const extra = 'origem, pode_ler, pode_baixar, pode_grifar, liberado_de, liberado_ate'
  const comAtrib = await idsComAtribuicaoAluno(svc, tenantId, tipo)
  const idSet = new Set(ids)
  const estudantes = comAtrib
    // Só as linhas do próprio aluno (índice por estudante_id), 1 query, filtrada em memória pelos ids pedidos.
    ? fetchTol<any>(
        () => svc.from(te).select(`${key}, estudante_id, ${extra}`).eq('tenant_id', tenantId).eq('estudante_id', estId).order('id', { ascending: true }),
        () => svc.from(te).select(`${key}, estudante_id`).eq('tenant_id', tenantId).eq('estudante_id', estId).order('id', { ascending: true }),
      ).then((rows) => rows.filter((r: any) => idSet.has(r[key])))
    : fetchTolByIn<any>(ids,
        (c) => svc.from(te).select(`${key}, estudante_id, ${extra}`).eq('tenant_id', tenantId).in(key, c).order(key, { ascending: true }),
        (c) => svc.from(te).select(`${key}, estudante_id`).eq('tenant_id', tenantId).in(key, c).order(key, { ascending: true }))
  const [grupos, estud] = await Promise.all([
    fetchTolByIn<any>(ids,
      (c) => svc.from(tg).select(`${key}, grupo_id, ${extra}`).eq('tenant_id', tenantId).in(key, c).order(key, { ascending: true }),
      (c) => svc.from(tg).select(`${key}, grupo_id`).eq('tenant_id', tenantId).in(key, c).order(key, { ascending: true })),
    estudantes,
  ])
  const push = (id: string, a: Atribuicao) => { (out.get(id) ?? out.set(id, []).get(id)!).push(a) }
  for (const r of grupos as any[]) push(r[key], atribDe('grupo', r.grupo_id, r))
  for (const r of estud as any[]) push(r[key], atribDe('aluno', r.estudante_id, r))
  if (comAtrib) { const proprios = new Set((estud as any[]).map((r) => r[key])); for (const id of comAtrib) if (idSet.has(id) && !proprios.has(id)) push(id, SENTINELA) }
  return out
}

