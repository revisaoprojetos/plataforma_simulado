import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { onPraticaRespondida } from '@/lib/gamificacao'

// POST /api/leitura/resposta — responde uma questão inline da leitura (validação server-side).
export const dynamic = 'force-dynamic'
const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: { documento_id?: string; questao_id?: string; alternativa_id?: string }
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const { documento_id, questao_id, alternativa_id } = b
  if (!documento_id || !questao_id || !alternativa_id) return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })

  const svc = createAdminClient()

  // A questão precisa estar realmente anexada a este documento (evita responder qualquer questão).
  const { data: vinc } = await svc.from('simulado_documento_questoes')
    .select('id').eq('tenant_id', sessao.tenantId).eq('documento_id', documento_id).eq('questao_id', questao_id).eq('deletado', false).maybeSingle()
  if (!vinc) return NextResponse.json({ message: 'Questão não pertence a este documento.' }, { status: 400 })

  // Resolve correta/letra pelas alternativas (autoridade do servidor).
  const { data: alts } = await svc.from('simulado_alternativas').select('id, correta, ordem').eq('questao_id', questao_id).order('ordem')
  const idx = (alts ?? []).findIndex((a: any) => a.id === alternativa_id)
  if (idx < 0) return NextResponse.json({ message: 'Alternativa inválida.' }, { status: 400 })
  const alt = (alts as any[])[idx]
  const correta = !!alt.correta
  const corretaId = (alts as any[]).find((a) => a.correta)?.id ?? null

  const { data: disc } = await svc.from('simulado_questoes').select('disciplina_id').eq('id', questao_id).maybeSingle()

  const { data: up, error } = await svc.from('simulado_leitura_respostas').upsert(
    {
      tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id, questao_id,
      alternativa_id, correta, snapshot_gabarito: { alternativa_id, correta, letra: LETRA[idx] ?? '?', correta_id: corretaId },
      respondido_em: new Date().toISOString(),
    },
    { onConflict: 'estudante_id,documento_id,questao_id' },
  ).select('id').single()
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  // Gamificação: XP por acerto (idempotente por respostaId no ledger).
  void onPraticaRespondida(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, respostaId: (up as any).id, correta, disciplinaId: (disc as any)?.disciplina_id ?? null })

  return NextResponse.json({ ok: true, correta, correta_id: corretaId, letra: LETRA[idx] ?? '?' })
}
