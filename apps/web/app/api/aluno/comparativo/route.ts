import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { montarComparativo } from '@/lib/simulado/comparativo'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'

// Comparativo da turma para o aluno logado — carregado SOB DEMANDA (lazy) quando ele abre a aba
// "Comparativo" no resultado. Assim a página de resultado abre rápido: a parte pesada (respostas de
// todos os participantes) só roda se/quando a aba for aberta — e ainda é memoizada por simulado.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const simuladoId = new URL(request.url).searchParams.get('simulado')
  if (!simuladoId) return NextResponse.json({ error: 'Simulado ausente.' }, { status: 400 })

  const svc = createAdminClient()
  const estId = sessao.estudanteId
  const [{ data: sim }, { data: sess }, { data: estRow }] = await Promise.all([
    svc.from('simulado_simulados').select('id, titulo, regras, status, modo_aplicacao, data_inicio, data_fim').eq('id', simuladoId).is('owner_estudante_id', null).maybeSingle(),
    svc.from('simulado_sessoes_prova').select('id, nota, finalizado_em').eq('estudante_id', estId).eq('simulado_id', simuladoId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada'),
    svc.from('simulado_estudantes').select('classificacao').eq('id', estId).maybeSingle(),
  ])
  if (!sim) return NextResponse.json({ error: 'Simulado não encontrado.' }, { status: 404 })

  const finalizadas = (sess ?? []) as any[]
  const { notaLiberada } = resolverLiberacoes((sim as any).regras, sim, { classificacao: (estRow as any)?.classificacao ?? null })
  // Sem nota liberada ou sem tentativa concluída → não há comparativo a mostrar (o front já trata).
  if (!notaLiberada || !finalizadas.length) return NextResponse.json({ notaLiberada: false })

  // Melhor tentativa (nota; desempate pela mais recente) — mesma regra da página de resultado.
  const melhor = [...finalizadas].sort((a, b) => (Number(b.nota ?? -1) - Number(a.nota ?? -1)) || (new Date(b.finalizado_em ?? 0).getTime() - new Date(a.finalizado_em ?? 0).getTime()))[0]
  const comparativo = await montarComparativo(
    svc, simuladoId,
    { minhaNota: melhor.nota != null ? Number(melhor.nota) : null, minhaSessaoId: melhor.id },
    sessao.tenantId,
  )
  return NextResponse.json({ notaLiberada: true, comparativo })
}
