import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// GET /api/aluno/cadernos — lista os cadernos do aluno com contagem de questões.
export async function GET() {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  const svc = await createServiceClient()
  const { data: cadernos } = await svc
    .from('simulado_aluno_cadernos')
    .select('id, nome, criado_em')
    .eq('estudante_id', sessao.estudanteId)
    .order('criado_em', { ascending: false })

  const ids = (cadernos ?? []).map((c: any) => c.id)
  const { data: itens } = ids.length
    ? await svc.from('simulado_aluno_caderno_questoes').select('caderno_id').in('caderno_id', ids)
    : { data: [] as any[] }
  const contagem: Record<string, number> = {}
  for (const i of itens ?? []) contagem[i.caderno_id] = (contagem[i.caderno_id] ?? 0) + 1

  return NextResponse.json({
    cadernos: (cadernos ?? []).map((c: any) => ({ id: c.id, nome: c.nome, total: contagem[c.id] ?? 0 })),
  })
}

// POST /api/aluno/cadernos — cria um caderno.
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: { nome?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }
  const nome = body.nome?.trim()
  if (!nome) return NextResponse.json({ message: 'Informe um nome.' }, { status: 400 })

  const svc = await createServiceClient()
  const { data, error } = await svc
    .from('simulado_aluno_cadernos')
    .insert({ tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, nome: nome.slice(0, 120) })
    .select('id, nome')
    .single()
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, caderno: { id: data.id, nome: data.nome, total: 0 } })
}
