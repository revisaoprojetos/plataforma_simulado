import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import {
  FONTES_VINCULO, acumular, descreverVinculos, mensagemRecusa, mensagemRecusaBanco, particionarQuestoes,
  type DetalheVinculo, type FonteVinculo, type MapaDependencias, type QuestaoBloqueada,
} from './dependencias-questao-puro'

export * from './dependencias-questao-puro'

/**
 * TRAVA CENTRAL de exclusão de QUESTÕES (regra: nada de delete/soft-delete de questão que tenha
 * vínculo — respostas, simulados, documentos/quiz, cronograma, cadernos, re-correções).
 *
 * Lê só (service role). Falha FECHADO: se não for possível verificar uma tabela (erro que não seja
 * "tabela inexistente"), lança — quem chama deve recusar a exclusão.
 *
 * Caminho rápido: SQL direto (count por questão, usa os índices por questao_id). Fallback: PostgREST,
 * 1 linha por questão encontrada (qtd=1 = "pelo menos 1").
 */

const TABELA_INEXISTENTE = /does not exist|could not find the table|schema cache|relation .* not found/i

async function contarPorSql(f: FonteVinculo, ids: string[]): Promise<{ id: string; n: number }[] | null> {
  const filtroDel = f.comDeletado ? ' and not coalesce(deletado, false)' : ''
  const rows = await sqlQuery<{ id: string; n: number }>(
    `select questao_id::text as id, count(*)::int as n from public.${f.tabela} where questao_id = any($1::uuid[])${filtroDel} group by questao_id`,
    [ids],
  )
  return rows
}

async function contarPorPostgrest(svc: SupabaseClient, f: FonteVinculo, ids: string[]): Promise<{ id: string; n: number }[]> {
  const achados: { id: string; n: number }[] = []
  for (let i = 0; i < ids.length; i += 80) {
    const restantes = new Set(ids.slice(i, i + 80))
    // Uma consulta de 1 linha por questão ainda não encontrada (limit 1): robusto ao teto de 1000 linhas.
    while (restantes.size) {
      let q = svc.from(f.tabela).select('questao_id').in('questao_id', [...restantes]).limit(1)
      if (f.comDeletado) q = q.eq('deletado', false)
      const { data, error } = await q
      if (error) {
        if (TABELA_INEXISTENTE.test(error.message ?? '')) return achados
        throw new Error(`Falha ao verificar vínculos em ${f.tabela}: ${error.message}`)
      }
      const id = (data?.[0] as any)?.questao_id as string | undefined
      if (!id) break
      achados.push({ id, n: 1 })
      restantes.delete(id)
    }
  }
  return achados
}

/**
 * Vínculos de várias questões, em lote. Retorna questaoId → detalhes (só quem tem vínculo).
 * `tenantId` é mantido na assinatura (as questões já foram resolvidas no tenant pelo chamador);
 * a checagem de vínculo NÃO filtra por tenant de propósito (conservador: qualquer linha bloqueia).
 */
export async function dependenciasQuestoes(svc: SupabaseClient, _tenantId: string | null, ids: string[]): Promise<MapaDependencias> {
  const mapa: MapaDependencias = new Map()
  const lista = [...new Set((ids ?? []).filter(Boolean))]
  if (!lista.length) return mapa
  const CHUNK_SQL = 500
  await Promise.all(FONTES_VINCULO.map(async (f) => {
    let achados: { id: string; n: number }[] = []
    let okSql = true
    for (let i = 0; i < lista.length; i += CHUNK_SQL) {
      const r = await contarPorSql(f, lista.slice(i, i + CHUNK_SQL))
      if (r === null) { okSql = false; break }
      achados.push(...r)
    }
    if (!okSql) achados = await contarPorPostgrest(svc, f, lista)
    for (const a of achados) acumular(mapa, f, a.id, a.n)
  }))
  return mapa
}

export type ResultadoBloqueio = {
  /** Ids sem vínculo — podem ser excluídos. */
  livres: string[]
  /** Ids recusados, com motivo e detalhe por tipo. */
  bloqueadas: QuestaoBloqueada[]
  /** Mensagem pt-BR pronta para toast ('' se nada bloqueado). */
  mensagem: string
}

/**
 * Particiona `ids` em livres × bloqueadas. Não apaga nada. Anexa código curto (`codigo`) às mensagens quando existir.
 */
export async function bloquearSeTemVinculos(
  svc: SupabaseClient,
  tenantId: string | null,
  ids: string[],
  opts: { acao?: string } = {},
): Promise<ResultadoBloqueio> {
  const mapa = await dependenciasQuestoes(svc, tenantId, ids)
  const { livres, bloqueadas } = particionarQuestoes(ids, mapa)
  let rotulos: Map<string, string> | undefined
  if (bloqueadas.length) {
    try {
      const meta = await fetchAllByIn<{ id: string; codigo: string | null }>(
        bloqueadas.slice(0, 10).map((b) => b.id),
        (c) => svc.from('simulado_questoes').select('id, codigo').in('id', c).order('id', { ascending: true }),
        { chunk: 80, rotulo: 'dependencias-questao:codigo' },
      )
      rotulos = new Map(meta.filter((m) => m.codigo).map((m) => [m.id, String(m.codigo)]))
    } catch { /* rótulo é só cosmético */ }
  }
  return { livres, bloqueadas, mensagem: mensagemRecusa(bloqueadas, { acao: opts.acao, rotulos }) }
}

/** Ids de questões vinculadas a um banco (simulado_questao_pasta). Um banco por vez ⇒ questao_id é único na ordenação. */
async function questoesDoBanco(svc: SupabaseClient, bancoId: string): Promise<string[]> {
  const rows = await fetchAll<{ questao_id: string }>(
    () => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).order('questao_id', { ascending: true }),
    1000,
    'dependencias-questao:banco',
  )
  return rows.map((r) => r.questao_id)
}

export type DependenciasBanco = { total: number; emUso: number; resumo: string; mensagem: string }

/**
 * Banco/pasta de questões: só pode ser excluído se NENHUMA questão dele estiver em simulado/resposta/documento/etc.
 * (a exclusão do banco não apaga as questões, mas o caminho de purge/CASCADE e o histórico exigem a trava).
 */
export async function dependenciasBanco(svc: SupabaseClient, tenantId: string | null, bancoId: string, nomeBanco: string | null = null): Promise<DependenciasBanco> {
  const ids = await questoesDoBanco(svc, bancoId)
  if (!ids.length) return { total: 0, emUso: 0, resumo: '', mensagem: '' }
  const mapa = await dependenciasQuestoes(svc, tenantId, ids)
  const soma = new Map<string, DetalheVinculo>()
  for (const det of mapa.values()) for (const d of det) {
    const k = d.rotulo
    const ex = soma.get(k)
    if (ex) ex.qtd += d.qtd; else soma.set(k, { ...d })
  }
  const emUso = mapa.size
  if (!emUso) return { total: ids.length, emUso: 0, resumo: '', mensagem: '' }
  const resumo = descreverVinculos([...soma.values()])
  return { total: ids.length, emUso, resumo, mensagem: mensagemRecusaBanco(nomeBanco, emUso, resumo) }
}

/**
 * Para o purge/lixeira: dentre `ids` (já soft-deletados), devolve os que podem ser apagados DEFINITIVAMENTE.
 * Mesma regra de vínculos; usado por excluirDefinitivo e pelo cron lixeira-purge.
 */
export async function filtrarPurgaveisQuestoes(svc: SupabaseClient, tenantId: string | null, ids: string[]): Promise<{ purgaveis: string[]; retidas: QuestaoBloqueada[] }> {
  const { livres, bloqueadas } = await bloquearSeTemVinculos(svc, tenantId, ids)
  return { purgaveis: livres, retidas: bloqueadas }
}
