import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// GET /api/aluno/cadernos — lista os cadernos do aluno com contagem de questões.
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function GET() {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  const svc = createAdminClient()
  const { data: cadernos } = await svc
    .from('simulado_aluno_cadernos')
    .select('id, nome, criado_em')
    .eq('estudante_id', sessao.estudanteId)
    .order('criado_em', { ascending: false })

  const ids = (cadernos ?? []).map((c: any) => c.id)
  // total = questões + itens (comentários de trecho). Uma query por tabela (.in + tally), sem N+1.
  // Se a tabela de itens ainda não existir (migração pendente) o erro é ignorado e só contam as questões.
  const [{ data: itens }, { data: extras }] = ids.length
    ? await Promise.all([
        svc.from('simulado_aluno_caderno_questoes').select('caderno_id').in('caderno_id', ids),
        svc.from('simulado_aluno_caderno_itens').select('caderno_id, tipo').eq('tenant_id', sessao.tenantId).in('caderno_id', ids),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]
  // Contagem por tipo (questões, comentários, grifos, anotações) — um tally só, sem N+1.
  type Cont = { questoes: number; comentarios: number; grifos: number; anotacoes: number }
  const porTipo: Record<string, Cont> = {}
  const cont = (id: string) => (porTipo[id] ??= { questoes: 0, comentarios: 0, grifos: 0, anotacoes: 0 })
  for (const q of itens ?? []) cont(q.caderno_id).questoes++
  for (const i of extras ?? []) {
    const c = cont(i.caderno_id)
    if (i.tipo === 'grifo') c.grifos++; else if (i.tipo === 'anotacao') c.anotacoes++; else c.comentarios++
  }

  return NextResponse.json({
    cadernos: (cadernos ?? []).map((c: any) => {
      const t = porTipo[c.id] ?? { questoes: 0, comentarios: 0, grifos: 0, anotacoes: 0 }
      return { id: c.id, nome: c.nome, total: t.questoes + t.comentarios + t.grifos + t.anotacoes, ...t }
    }),
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

  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_aluno_cadernos')
    .insert({ tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, nome: nome.slice(0, 120) })
    .select('id, nome')
    .single()
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, caderno: { id: data.id, nome: data.nome, total: 0 } })
}
