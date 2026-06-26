import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// POST /api/aluno/favoritos — alterna (toggle) o favorito da questão para o aluno logado.
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: { questao_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }
  const questaoId = body.questao_id
  if (!questaoId) return NextResponse.json({ message: 'Questão ausente.' }, { status: 400 })

  const svc = await createServiceClient()

  const { data: existente } = await svc
    .from('simulado_favoritos')
    .select('id')
    .eq('estudante_id', sessao.estudanteId)
    .eq('questao_id', questaoId)
    .maybeSingle()

  if (existente) {
    await svc.from('simulado_favoritos').delete().eq('id', existente.id)
    return NextResponse.json({ favorito: false })
  }

  const { error } = await svc.from('simulado_favoritos').insert({
    tenant_id: sessao.tenantId,
    estudante_id: sessao.estudanteId,
    questao_id: questaoId,
  })
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  return NextResponse.json({ favorito: true })
}
