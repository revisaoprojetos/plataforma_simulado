import 'server-only'

/**
 * Leitura de checks/notas de uma emissão COM reencaixe por chave estável.
 *
 * Se a meta de um check/nota não existe mais (apagada e recriada por edição/importação antiga),
 * mas `chave_meta` casa com uma meta ATUAL do cronograma, a linha é reencaixada nela — e o
 * `meta_id` é corrigido no banco (best-effort) para as próximas leituras serem diretas.
 * Sem a migration (coluna ausente) o comportamento é o antigo.
 */

import { fetchAll } from '@/lib/supabase/fetch-all'
import { reencaixarPorChave } from './chave-meta'
import { colunaAusente } from './compat-legado'
import type { ProgressoEmissao } from './progresso-tipos'

type Tabela = 'simulado_cronograma_meta_checks' | 'simulado_cronograma_meta_notas' | 'simulado_cronograma_meta_progresso'

/**
 * Coalescência de leituras idênticas e concorrentes (mesmo processo): a abertura do cronograma lia a lista de
 * metas atuais (id+chave) 4x em paralelo (checks, notas, parcial, conteúdo). Aqui a 1ª promessa é compartilhada
 * por `ttlMs` (curto: só absorve rajada da MESMA requisição; não é cache de dados). Falha não fica guardada.
 */
const emVoo = new Map<string, { p: Promise<unknown>; exp: number }>()
export function coalescer<T>(chave: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const agora = Date.now()
  const ex = emVoo.get(chave)
  if (ex && ex.exp > agora) return ex.p as Promise<T>
  if (emVoo.size > 200) for (const [k, v] of emVoo) if (v.exp <= agora) emVoo.delete(k)
  const p = fn()
  emVoo.set(chave, { p, exp: agora + ttlMs })
  p.catch(() => { if (emVoo.get(chave)?.p === p) emVoo.delete(chave) })
  return p
}

export async function lerProgressoReencaixado<T extends Record<string, any>>(
  svc: any,
  tenantId: string,
  cronogramaId: string,
  emissaoId: string,
  tabela: Tabela,
  /** Colunas de valor além de meta_id/chave_meta, separadas por vírgula (ex.: 'marcada_em, data, titulo'). */
  campos: string,
): Promise<({ meta_id: string } & T)[]> {
  type Linha = { meta_id: string; chave_meta?: string | null } & T
  const ler = (cols: string) =>
    fetchAll<Linha>(() =>
      svc.from(tabela).select(cols).eq('tenant_id', tenantId).eq('emissao_id', emissaoId).order('meta_id') as never,
    )

  let linhas: Linha[]
  let comChave = true
  try {
    linhas = await ler(`meta_id, chave_meta, ${campos}`)
  } catch (e) {
    if (!colunaAusente(e as { message?: string; code?: string })) throw e
    comChave = false
    linhas = await ler(`meta_id, ${campos}`)
  }
  if (!comChave || !linhas.length || !linhas.some((l) => l.chave_meta)) return linhas

  // Metas atuais do cronograma (id + chave): 1-2 requisições leves, só quando há progresso gravado.
  let atuais: { id: string; chave: string | null }[]
  try {
    atuais = await coalescer(`metas-atuais:${tenantId}:${cronogramaId}`, 3000, () =>
      fetchAll<{ id: string; chave: string | null }>(() =>
        svc.from('simulado_cronograma_metas').select('id, chave').eq('tenant_id', tenantId).eq('cronograma_id', cronogramaId).order('id') as never,
      ),
    )
  } catch {
    return linhas
  }
  const { linhas: saida, reencaixadas } = reencaixarPorChave(linhas, atuais)

  if (reencaixadas.length) {
    // Aguardado (se o aluno desmarcar logo depois, o meta_id já está corrigido no banco), mas EM LOTES PARALELOS
    // (antes 1 UPDATE por linha em série dentro do GET: N round-trips). Acontece uma vez; depois a leitura é direta.
    try {
      for (let i = 0; i < reencaixadas.length; i += 10) {
        await Promise.all(reencaixadas.slice(i, i + 10).map((r) =>
          svc.from(tabela).update({ meta_id: r.para }).eq('tenant_id', tenantId).eq('emissao_id', emissaoId).eq('meta_id', r.de)))
      }
    } catch {
      /* best-effort: a leitura já devolve reencaixado */
    }
  }
  return saida
}

export type { ProgressoEmissao } from './progresso-tipos'

/**
 * Progresso de uma emissão calculado no SERVIDOR por contagem agregada (head + count exact):
 * não carrega as linhas. A UI só exibe estes números — nunca recalcula percentual.
 */
export async function progressoDaEmissao(svc: any, tenantId: string, cronogramaId: string, emissaoId: string): Promise<ProgressoEmissao> {
  const [c, m] = await Promise.all([
    svc.from('simulado_cronograma_meta_checks').select('meta_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('emissao_id', emissaoId),
    svc.from('simulado_cronograma_metas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('cronograma_id', cronogramaId),
  ])
  const total = Math.max(0, (m?.count as number | null) ?? 0)
  const feitas = Math.min(Math.max(0, (c?.count as number | null) ?? 0), total || Number.MAX_SAFE_INTEGER)
  const pct = total ? Math.round((feitas / total) * 100) : 0
  return { feitas, total, pct, pctRotulo: feitas > 0 && pct === 0 ? '<1%' : `${pct}%` }
}
