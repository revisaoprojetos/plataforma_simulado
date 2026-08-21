import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { onLeituraConcluida } from '@/lib/gamificacao'

// POST /api/leitura/progresso — auto-save idempotente do progresso de leitura.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: { documento_id?: string; versao?: number; pct?: number; artigo_max?: number; tempo_inc?: number; concluir?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const { documento_id, versao } = body
  if (!documento_id || !versao) return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })

  const svc = createAdminClient()

  // Documento (regras do desafio) — valida acesso/tenant implícito pela leitura da regra.
  const { data: doc } = await svc.from('simulado_documentos')
    .select('id, desafio_ativo, desafio_exige_fim, desafio_tempo_min')
    .eq('id', documento_id).eq('tenant_id', sessao.tenantId).maybeSingle()
  if (!doc) return NextResponse.json({ message: 'Documento não encontrado.' }, { status: 404 })

  // Estado atual (para acumular tempo e manter o máximo de %/artigo).
  const { data: atual } = await svc.from('simulado_leitura_progresso')
    .select('pct, artigo_max, tempo_seg, concluido_em')
    .eq('estudante_id', sessao.estudanteId).eq('documento_id', documento_id).eq('documento_versao', versao).maybeSingle()

  const pctNovo = Math.max(Number((atual as any)?.pct ?? 0), Math.min(100, Math.max(0, Math.round(Number(body.pct ?? 0)))))
  const artigoMax = Math.max(Number((atual as any)?.artigo_max ?? 0), Math.max(0, Math.round(Number(body.artigo_max ?? 0))))
  const tempoInc = Math.min(120, Math.max(0, Math.round(Number(body.tempo_inc ?? 0)))) // teto por chamada (anti-abuso)
  const tempoSeg = Number((atual as any)?.tempo_seg ?? 0) + tempoInc

  // Já concluído? mantém. Senão, avalia critérios do desafio quando o cliente pede "concluir".
  let concluidoEm: string | null = (atual as any)?.concluido_em ?? null
  let concluiuAgora = false
  if (!concluidoEm && body.concluir && (doc as any).desafio_ativo) {
    const okFim = !(doc as any).desafio_exige_fim || pctNovo >= 100
    const minSeg = (Number((doc as any).desafio_tempo_min) || 0) * 60
    const okTempo = tempoSeg >= minSeg
    if (okFim && okTempo) { concluidoEm = new Date().toISOString(); concluiuAgora = true }
  }

  const { error } = await svc.from('simulado_leitura_progresso').upsert(
    {
      tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id, documento_versao: versao,
      pct: pctNovo, artigo_max: artigoMax, tempo_seg: tempoSeg, concluido_em: concluidoEm, atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'estudante_id,documento_id,documento_versao' },
  )
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  // Gamificação só na PRIMEIRA conclusão (idempotente por documento no ledger de qualquer forma).
  if (concluiuAgora) void onLeituraConcluida(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, documentoId: documento_id })

  return NextResponse.json({ ok: true, pct: pctNovo, concluido: !!concluidoEm })
}
