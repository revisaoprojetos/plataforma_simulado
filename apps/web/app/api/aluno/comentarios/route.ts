import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { rateLimit } from '@/lib/rate-limit'

// GET /api/aluno/comentarios?questao_id=X — comentários do professor + de alunos aprovados.
export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  const questaoId = new URL(request.url).searchParams.get('questao_id')
  if (!questaoId) return NextResponse.json({ comentarios: [] })

  const svc = await createServiceClient()
  const { data } = await svc
    .from('simulado_comentarios_questao')
    .select('id, autor_id, tipo, texto, aprovado, criado_em')
    .eq('tenant_id', sessao.tenantId)
    .eq('questao_id', questaoId)
    .order('criado_em', { ascending: true })

  // Mostra: comentários do professor + de alunos aprovados + os do próprio aluno (mesmo pendentes).
  const visiveis = (data ?? []).filter(
    (c: any) => c.tipo === 'professor' || c.aprovado || c.autor_id === sessao.estudanteId,
  )

  const alunoIds = [...new Set(visiveis.filter((c: any) => c.tipo === 'aluno').map((c: any) => c.autor_id))]
  const { data: alunos } = alunoIds.length
    ? await svc.from('simulado_estudantes').select('id, nome').in('id', alunoIds)
    : { data: [] as any[] }
  const nomeMap = new Map((alunos ?? []).map((a: any) => [a.id, a.nome]))

  const comentarios = visiveis.map((c: any) => ({
    id: c.id,
    tipo: c.tipo,
    texto: c.texto,
    aprovado: c.aprovado,
    autor: c.tipo === 'professor' ? 'Professor' : (nomeMap.get(c.autor_id) ?? 'Aluno'),
    em: c.criado_em,
    meu: c.autor_id === sessao.estudanteId,
  }))

  return NextResponse.json({ comentarios })
}

// POST /api/aluno/comentarios — aluno adiciona comentário (entra pendente de moderação).
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: { questao_id?: string; texto?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }
  const texto = body.texto?.trim()
  if (!body.questao_id || !texto) return NextResponse.json({ message: 'Comentário vazio.' }, { status: 400 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`coment:${sessao.estudanteId}:${ip}`, 10, 5 * 60 * 1000).ok) {
    return NextResponse.json({ message: 'Muitos comentários. Aguarde um pouco.' }, { status: 429 })
  }

  const svc = await createServiceClient()
  const { error } = await svc.from('simulado_comentarios_questao').insert({
    tenant_id: sessao.tenantId,
    questao_id: body.questao_id,
    autor_id: sessao.estudanteId,
    tipo: 'aluno',
    texto: texto.slice(0, 2000),
    aprovado: false,
  })
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
