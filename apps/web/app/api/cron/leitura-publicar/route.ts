import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { invalidarRankingLeitura } from '@/lib/leitura/ranking'

export const dynamic = 'force-dynamic'

/**
 * Publica as aulas de leitura AGENDADAS cuja data (`publicacao.publicarEm`) já chegou.
 * Protegido por CRON_SECRET; chamado pelo worker (setInterval 60s). Idempotente.
 *
 * Por quê: uma aula agendada fica com `publicado=false` + `publicacao.estado='visualizavel'`
 * (aparece "libera em X", bloqueada). NADA a liberava na data → ficava travada até publicar à mão,
 * e a trilha mostrava "liberada" enquanto os gates (que exigem `publicado=true`) barravam → trava/erro.
 * Aqui, quando `publicarEm <= agora`, viramos `publicado=true` + estado 'publicada' — assim TODOS os
 * gates/ranking passam a valer uniformemente (sem estado meio-liberado). Invalida o ranking do módulo.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const svc = createAdminClient()
  const agora = Date.now()

  // Candidatas: agendadas (estado 'visualizavel') e ainda não publicadas. Filtro fino de data em JS
  // (evita quirks de comparar jsonb->>data no PostgREST). São poucas por tenant.
  let cands: any[] = []
  try {
    const { data, error } = await svc
      .from('simulado_documentos')
      .select('id, tenant_id, pasta_id, publicacao')
      .eq('deletado', false)
      .eq('publicado', false)
      .eq('publicacao->>estado', 'visualizavel')
    if (error) {
      // Coluna publicacao ausente (migração antiga) → nada a fazer.
      if (/publicacao|column|schema cache/i.test(error.message)) return NextResponse.json({ ok: true, publicadas: 0, obs: 'sem coluna publicacao' })
      throw error
    }
    cands = data ?? []
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Falha ao listar agendadas.' }, { status: 500 })
  }

  const venceram = cands.filter((d) => {
    const p = d.publicacao
    const em = p && typeof p === 'object' ? p.publicarEm : null
    return em && new Date(em).getTime() <= agora
  })

  let publicadas = 0
  const modulos = new Set<string>() // tenant_id::pasta_id p/ invalidar o ranking uma vez
  for (const d of venceram) {
    const novaPub = { ...(d.publicacao as object), estado: 'publicada' }
    const { error } = await svc
      .from('simulado_documentos')
      .update({ publicado: true, publicacao: novaPub, atualizado_em: new Date().toISOString() })
      .eq('id', d.id).eq('tenant_id', d.tenant_id)
    if (!error) { publicadas++; modulos.add(`${d.tenant_id}::${d.pasta_id ?? '__geral__'}`) }
  }

  // Ranking do módulo muda (nova aula publicada entra na conta) → invalida na hora.
  for (const key of modulos) {
    const [tid, mod] = key.split('::')
    try { await invalidarRankingLeitura(tid, mod) } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, publicadas, candidatas: cands.length })
}
