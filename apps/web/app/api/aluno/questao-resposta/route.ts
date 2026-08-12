import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { onPraticaRespondida } from '@/lib/gamificacao'

// POST /api/aluno/questao-resposta — registra UMA tentativa avulsa (prática no Banco de Questões).
// Cada tentativa vira um registro (histórico) — o aluno pode refazer quantas vezes quiser.
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: { questao_id?: string; alternativa_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }
  const { questao_id, alternativa_id } = body
  if (!questao_id || !alternativa_id) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })

  const svc = await createServiceClient()
  try {
    // Validação server-side: a alternativa pertence à questão; correta e disciplina vêm do banco (não do cliente).
    const { data: alt } = await svc.from('simulado_alternativas').select('id, questao_id, correta').eq('id', alternativa_id).maybeSingle()
    if (!alt || alt.questao_id !== questao_id) return NextResponse.json({ message: 'Alternativa inválida.' }, { status: 400 })
    const { data: q } = await svc.from('simulado_questoes').select('disciplina_id, tenant_id').eq('id', questao_id).maybeSingle()
    if (!q || q.tenant_id !== sessao.tenantId) return NextResponse.json({ message: 'Questão inválida.' }, { status: 400 })

    const { data: inserida } = await svc.from('simulado_respostas_avulsas').insert({
      tenant_id: sessao.tenantId,
      estudante_id: sessao.estudanteId,
      questao_id,
      alternativa_id,
      disciplina_id: q.disciplina_id ?? null,
      correta: !!alt.correta,
    }).select('id').single()

    // Gamificação: XP de prática + streak/missões/conquistas (idempotente por resposta). Fire-and-forget.
    if (inserida?.id) {
      void onPraticaRespondida(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, respostaId: inserida.id, correta: !!alt.correta, disciplinaId: q.disciplina_id ?? null })
    }
    return NextResponse.json({ ok: true, correta: !!alt.correta })
  } catch {
    // Tabela ainda não migrada — não quebra a prática do aluno.
    return NextResponse.json({ ok: true, pendente: true })
  }
}
