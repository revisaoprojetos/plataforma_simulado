import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// GET /api/aluno/discursiva?questao_id=X — resposta atual do aluno (texto + correção).
export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  const questaoId = new URL(request.url).searchParams.get('questao_id')
  if (!questaoId) return NextResponse.json({ resposta: null })

  const svc = await createServiceClient()
  const { data } = await svc
    .from('simulado_respostas_discursivas')
    .select('id, texto, status, nota, feedback')
    .eq('questao_id', questaoId)
    .eq('estudante_id', sessao.estudanteId)
    .is('sessao_id', null)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  let competencias: any[] = []
  if (data?.status === 'corrigida') {
    const { data: cc } = await svc
      .from('simulado_correcao_competencias')
      .select('nota, comentario, competencia_id, simulado_competencias(nome, pontos)')
      .eq('resposta_id', data.id)
    competencias = (cc ?? []).map((c: any) => ({ nome: c.simulado_competencias?.nome, pontos: c.simulado_competencias?.pontos, nota: c.nota, comentario: c.comentario }))
  }

  return NextResponse.json({ resposta: data, competencias })
}

// POST /api/aluno/discursiva — envia/atualiza a resposta (modo prática, sem sessão de prova).
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: { questao_id?: string; texto?: string }
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Inválido.' }, { status: 400 }) }
  const texto = body.texto?.trim()
  if (!body.questao_id || !texto) return NextResponse.json({ message: 'Escreva sua resposta.' }, { status: 400 })

  const svc = await createServiceClient()

  // Já existe uma resposta de prática? Se ainda pendente, atualiza; se corrigida, bloqueia reedição.
  const { data: existente } = await svc
    .from('simulado_respostas_discursivas')
    .select('id, status')
    .eq('questao_id', body.questao_id)
    .eq('estudante_id', sessao.estudanteId)
    .is('sessao_id', null)
    .maybeSingle()

  if (existente) {
    if (existente.status === 'corrigida') {
      return NextResponse.json({ message: 'Esta resposta já foi corrigida.' }, { status: 409 })
    }
    const { error } = await svc
      .from('simulado_respostas_discursivas')
      .update({ texto: texto.slice(0, 20000), status: 'pendente', atualizado_em: new Date().toISOString() })
      .eq('id', existente.id)
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await svc.from('simulado_respostas_discursivas').insert({
    tenant_id: sessao.tenantId,
    questao_id: body.questao_id,
    estudante_id: sessao.estudanteId,
    sessao_id: null,
    texto: texto.slice(0, 20000),
    status: 'pendente',
  })
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
