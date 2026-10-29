import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'

// CONTABILIDADE DE TEMPO DE ESTUDO (Fase 2). Ledger diário (BRT) de segundos por FRENTE.
// Alimentado nos pontos de atividade (finalização de simulado, leitor de lei seca/juris). A leitura do
// desempenho agrega o período. Incremento ATÔMICO via SQL direto; fallback read-modify-write (PostgREST).

export type Frente = 'leitura' | 'legproc' | 'jurisclub' | 'simulado'
const T = 'simulado_tempo_estudo'

const LABEL: Record<Frente, string> = { leitura: 'Leitura de PDF', legproc: 'LegProc', jurisclub: 'JurisClub', simulado: 'Simulados' }
const ORDEM: Frente[] = ['leitura', 'legproc', 'jurisclub', 'simulado']

function diaBrt(ms = Date.now()): string {
  const d = new Date(ms - 3 * 3600_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Credita `segundos` (e opcionalmente `paginas`) à frente, no dia BRT. Idempotente por incremento
 * (nunca lança — a contabilidade é best-effort e não pode quebrar o fluxo do aluno).
 */
export async function registrarTempo(
  svc: SupabaseClient,
  input: { tenantId: string; estudanteId: string; frente: Frente; segundos: number; paginas?: number },
): Promise<void> {
  const { tenantId, estudanteId, frente } = input
  const seg = Math.max(0, Math.round(Number(input.segundos) || 0))
  const pag = Math.max(0, Math.round(Number(input.paginas) || 0))
  if (!tenantId || !estudanteId || !frente || seg <= 0) return
  const dia = diaBrt()
  // Caminho atômico (SQL direto): INSERT ... ON CONFLICT DO UPDATE com soma. `segundos` acumula; `paginas`
  // fica no máximo (o cliente manda o total de páginas lidas até agora, não o delta).
  const r = await sqlQuery(
    `INSERT INTO ${T} (tenant_id, estudante_id, dia, frente, segundos, paginas, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (tenant_id, estudante_id, dia, frente)
       DO UPDATE SET segundos = ${T}.segundos + EXCLUDED.segundos,
                     paginas  = GREATEST(${T}.paginas, EXCLUDED.paginas),
                     atualizado_em = now()`,
    [tenantId, estudanteId, dia, frente, seg, pag],
  )
  if (r !== null) return
  // Fallback PostgREST (SQL direto indisponível): read-modify-write (best-effort, aceita corrida leve).
  try {
    const { data } = await svc.from(T).select('segundos, paginas').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('dia', dia).eq('frente', frente).maybeSingle()
    const atualSeg = Number((data as any)?.segundos ?? 0)
    const atualPag = Number((data as any)?.paginas ?? 0)
    await svc.from(T).upsert(
      { tenant_id: tenantId, estudante_id: estudanteId, dia, frente, segundos: atualSeg + seg, paginas: Math.max(atualPag, pag), atualizado_em: new Date().toISOString() },
      { onConflict: 'tenant_id,estudante_id,dia,frente' },
    )
  } catch { /* best-effort */ }
}

export type TempoAgregado = {
  horasEstudo: number | null
  ritmoPagsHora: number | null
  tempoPorFrente: { frente: string; horas: number }[]
  divisaoTempo: { frente: string; min: number; pct: number }[]
}

/** Agrega o ledger nos últimos `dias` (default 30): horas totais, por frente, divisão % e ritmo. */
export async function agregarTempoEstudo(svc: SupabaseClient, tenantId: string, estId: string, dias = 30): Promise<TempoAgregado | null> {
  if (!tenantId || !estId) return null
  const desde = diaBrt(Date.now() - (dias - 1) * 86400_000)
  let linhas: { frente: string; segundos: number; paginas: number }[] | null = null
  const r = await sqlQuery<{ frente: string; segundos: string; paginas: string }>(
    `SELECT frente, sum(segundos)::text AS segundos, sum(paginas)::text AS paginas
       FROM ${T} WHERE tenant_id = $1 AND estudante_id = $2 AND dia >= $3 GROUP BY frente`,
    [tenantId, estId, desde],
  )
  if (r !== null) {
    linhas = r.map((x) => ({ frente: x.frente, segundos: Number(x.segundos), paginas: Number(x.paginas) }))
  } else {
    try {
      const { data } = await svc.from(T).select('frente, segundos, paginas').eq('tenant_id', tenantId).eq('estudante_id', estId).gte('dia', desde)
      const acc = new Map<string, { segundos: number; paginas: number }>()
      for (const row of (data as any[]) ?? []) { const a = acc.get(row.frente) ?? { segundos: 0, paginas: 0 }; a.segundos += Number(row.segundos) || 0; a.paginas += Number(row.paginas) || 0; acc.set(row.frente, a) }
      linhas = [...acc.entries()].map(([frente, v]) => ({ frente, ...v }))
    } catch { return null }
  }
  if (!linhas || !linhas.length) return { horasEstudo: 0, ritmoPagsHora: null, tempoPorFrente: [], divisaoTempo: [] }

  const porFrente = new Map(linhas.map((l) => [l.frente, l]))
  const totalSeg = linhas.reduce((a, l) => a + l.segundos, 0)
  const totalPag = linhas.reduce((a, l) => a + l.paginas, 0)
  const tempoPorFrente = ORDEM.filter((f) => porFrente.has(f)).map((f) => ({ frente: LABEL[f], horas: Math.round((porFrente.get(f)!.segundos / 3600) * 10) / 10 }))
  const divisaoTempo = ORDEM.filter((f) => porFrente.has(f)).map((f) => {
    const s = porFrente.get(f)!.segundos
    return { frente: LABEL[f], min: Math.round(s / 60), pct: totalSeg ? Math.round((s / totalSeg) * 100) : 0 }
  })
  const horasEstudo = Math.round((totalSeg / 3600) * 10) / 10
  const ritmoPagsHora = totalPag > 0 && totalSeg > 0 ? Math.round((totalPag / (totalSeg / 3600)) * 10) / 10 : null
  return { horasEstudo, ritmoPagsHora, tempoPorFrente, divisaoTempo }
}
