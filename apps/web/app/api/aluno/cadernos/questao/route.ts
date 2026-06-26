import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

/** Valida que o caderno pertence ao aluno logado. */
async function donoDoCaderno(svc: any, cadernoId: string, estudanteId: string) {
  const { data } = await svc.from('simulado_aluno_cadernos').select('id').eq('id', cadernoId).eq('estudante_id', estudanteId).maybeSingle()
  return !!data
}

// POST — adiciona questão ao caderno.
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: { caderno_id?: string; questao_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Inválido.' }, { status: 400 }) }
  if (!body.caderno_id || !body.questao_id) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })

  const svc = await createServiceClient()
  if (!(await donoDoCaderno(svc, body.caderno_id, sessao.estudanteId))) {
    return NextResponse.json({ message: 'Caderno não encontrado.' }, { status: 403 })
  }

  const { error } = await svc
    .from('simulado_aluno_caderno_questoes')
    .upsert({ caderno_id: body.caderno_id, questao_id: body.questao_id }, { onConflict: 'caderno_id,questao_id' })
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// DELETE — remove questão do caderno.
export async function DELETE(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const cadernoId = searchParams.get('caderno_id')
  const questaoId = searchParams.get('questao_id')
  if (!cadernoId || !questaoId) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })

  const svc = await createServiceClient()
  if (!(await donoDoCaderno(svc, cadernoId, sessao.estudanteId))) {
    return NextResponse.json({ message: 'Caderno não encontrado.' }, { status: 403 })
  }

  await svc.from('simulado_aluno_caderno_questoes').delete().eq('caderno_id', cadernoId).eq('questao_id', questaoId)
  return NextResponse.json({ ok: true })
}
