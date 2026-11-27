import 'server-only'
import type { createAdminClient } from '@/lib/supabase/server'
import { sqlQuery } from '@/lib/data/sql'

// Trava do PURGE/exclusão (Fase 9 do plano): partes e seleções por meta apontam para o documento com ON DELETE
// RESTRICT — o purge de 30 dias falharia em lote se não for checado antes. Este módulo é INDEPENDENTE de
// dependencias-documento(-pura).ts; o ponto de integração está descrito no fim do arquivo.
// Tabela ausente (migração 16 pendente) = nada vinculado. Qualquer outro erro = FALHA FECHADA (lança).

type Svc = ReturnType<typeof createAdminClient>
export interface DependenciasPartes { partes: number; partesAtivas: number; selecoes: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHUNK = 80
const MAX_FALLBACK_IDS = 40
const tabelaAusente = (m?: string) => /42P01|PGRST205|does not exist|schema cache/i.test(m ?? '')

export const ROTULOS_PARTES = {
  partes: ['parte de documento', 'partes de documento'],
  selecoes: ['seleção de meta (parte/documento)', 'seleções de meta (parte/documento)'],
} as const

/** Contagem de partes (todas, inclusive arquivadas — a FK RESTRICT não distingue) e seleções por documento. */
export async function dependenciasPartesPorDocumento(svc: Svc, tenantId: string, documentoIds: string[]): Promise<Map<string, DependenciasPartes>> {
  const ids = [...new Set(documentoIds.filter((x) => UUID.test(x)))]
  const out = new Map<string, DependenciasPartes>()
  const get = (id: string) => { let v = out.get(id); if (!v) { v = { partes: 0, partesAtivas: 0, selecoes: 0 }; out.set(id, v) } return v }
  for (let i = 0; i < ids.length; i += CHUNK) {
    const lote = ids.slice(i, i + CHUNK)
    const [p, s] = await Promise.all([
      sqlQuery<{ id: string; n: number; ativas: number }>(
        `SELECT documento_id::text AS id, count(*)::int AS n, count(*) FILTER (WHERE NOT arquivada)::int AS ativas
           FROM simulado_conteudo_partes WHERE tenant_id = $1 AND documento_id = ANY($2::uuid[]) GROUP BY 1`, [tenantId, lote]),
      sqlQuery<{ id: string; n: number }>(
        `SELECT documento_id::text AS id, count(*)::int AS n FROM simulado_conteudo_selecao_meta WHERE tenant_id = $1 AND documento_id = ANY($2::uuid[]) GROUP BY 1`, [tenantId, lote]),
    ])
    if (p && s) {
      for (const r of p) { const v = get(r.id); v.partes = Number(r.n); v.partesAtivas = Number(r.ativas) }
      for (const r of s) get(r.id).selecoes = Number(r.n)
      continue
    }
    // Fallback PostgREST (poucos ids); senão falha fechada.
    if (lote.length > MAX_FALLBACK_IDS) throw new Error(`verificação de partes/seleções indisponível para ${lote.length} documentos`)
    for (const id of lote) {
      const base = (t: string) => (svc as any).from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('documento_id', id)
      const [a, b, c] = await Promise.all([base('simulado_conteudo_partes'), base('simulado_conteudo_partes').eq('arquivada', false), base('simulado_conteudo_selecao_meta')])
      for (const r of [a, b, c]) if (r.error && !tabelaAusente(`${r.error.code ?? ''} ${r.error.message}`)) throw new Error(r.error.message)
      const v = { partes: a.count ?? 0, partesAtivas: b.count ?? 0, selecoes: c.count ?? 0 }
      if (v.partes || v.selecoes) out.set(id, v)
    }
  }
  return out
}

/** Frase para a mensagem de bloqueio (ex.: "2 partes de documento, 1 seleção de meta…"). Vazio se não há nada. */
export function resumoDependenciasPartes(d: DependenciasPartes | undefined): string {
  if (!d) return ''
  const f = (n: number, r: readonly [string, string]) => `${n.toLocaleString('pt-BR')} ${n === 1 ? r[0] : r[1]}`
  const out: string[] = []
  if (d.partes > 0) out.push(f(d.partes, ROTULOS_PARTES.partes))
  if (d.selecoes > 0) out.push(f(d.selecoes, ROTULOS_PARTES.selecoes))
  return out.join(', ')
}

/**
 * PONTO DE INTEGRAÇÃO (ainda NÃO ligado):
 *  1. dependencias-documento-pura.ts: acrescentar 'partes' | 'selecoes' em `TipoDependencia` e em `ROTULOS`
 *     (reusar `ROTULOS_PARTES` daqui).
 *  2. dependencias-documento.ts → função que monta `Dependencias` por documento (onde `BLOCOS_CONTEUDO` é contado):
 *     chamar `dependenciasPartesPorDocumento(svc, tenantId, ids)` e `somarDependencia(dep, 'partes', n.selecoes)`.
 *     Decisão pendente (plano §10.4): partes SÓ ARQUIVADAS (partes>0, partesAtivas=0, selecoes=0) não devem bloquear;
 *     nesse caso o purge precisa apagar as partes arquivadas do documento ANTES do DELETE do documento (RESTRICT).
 *     Seleções (selecoes>0) sempre bloqueiam.
 *  3. Purge/lixeira: usar o mesmo mapa antes do DELETE em lote.
 */
export function bloqueiaPurgePorPartes(d: DependenciasPartes | undefined): boolean {
  if (!d) return false
  return d.selecoes > 0 || d.partesAtivas > 0
}
