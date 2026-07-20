import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { registrarRelatorioEvento } from '@/lib/relatorio-eventos'
import { dispararWebhook } from '@/lib/webhooks/dispatch'
import { dadosProgressao } from '@/lib/webhooks/payload'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { modalidadesDoAluno, type ModalidadeAluno } from '@/lib/caderno-designer/entrega-aluno'
import { tipoDoSimulado } from '@/lib/simulado/tipo'

// GET /api/sessoes/resultado?st={sessao_id}
// Dados da central de revisão: resumo + questões com resposta do aluno.
// O gabarito (alternativa correta) só é revelado se liberado pela config do simulado.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const st = searchParams.get('st')
  if (!st) return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, tenant_id, simulado_id, status, nota, posicao_ranking, iniciado_em, finalizado_em, estudante_id')
    .eq('id', st)
    .maybeSingle()
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })

  // Engajamento: registra a visualização do relatório (só quando já finalizado).
  if (sessao.status === 'finalizada' && sessao.tenant_id) {
    const admin = createAdminClient()
    await registrarRelatorioEvento(admin, {
      tenantId: sessao.tenant_id, simuladoId: sessao.simulado_id, estudanteId: sessao.estudante_id, sessaoId: sessao.id, tipo: 'visualizou',
    })
    await dispararWebhook(sessao.tenant_id, 'estudante.visualizou_relatorio', await dadosProgressao(admin, sessao as any))
  }

  // Total de participantes (alunos distintos finalizados, exceto testes) — contexto do ranking.
  const { data: participantes } = await supabase
    .from('simulado_sessoes_prova')
    .select('estudante_id')
    .eq('simulado_id', sessao.simulado_id)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .eq('deletado', false)
  const totalParticipantes = new Set((participantes ?? []).map((p: any) => p.estudante_id)).size

  const { data: simulado } = await supabase
    .from('simulado_simulados')
    .select('titulo, status, data_fim, regras')
    .eq('id', sessao.simulado_id)
    .single()

  // Classificação do aluno (para o público do caderno: todos | só passaporte).
  let classificacao: string | null = null
  if (sessao.estudante_id) {
    const { data: est } = await supabase.from('simulado_estudantes').select('classificacao').eq('id', sessao.estudante_id).maybeSingle()
    classificacao = (est as any)?.classificacao ?? null
  }
  const liberacoes = resolverLiberacoes(simulado?.regras as any, simulado ?? {}, { classificacao })
  const gabaritoLiberado = liberacoes.gabaritoLiberado

  const { data: sq } = await supabase
    .from('simulado_prova_questoes')
    .select('ordem, questoes:simulado_questoes(id, tipo, enunciado, comentario_professor, disciplina_id, disciplinas:simulado_disciplinas(nome), alternativas:simulado_alternativas(id, texto, ordem))')
    .eq('simulado_id', sessao.simulado_id)
    .eq('anulada', false)
    .order('ordem')

  const { data: respostas } = await supabase
    .from('simulado_respostas_objetivas')
    .select('questao_id, alternativa_id, correta')
    .eq('sessao_id', st)

  // Respostas discursivas desta sessão (com correção, se houver).
  const { data: disc } = await supabase
    .from('simulado_respostas_discursivas')
    .select('questao_id, texto, status, nota, feedback')
    .eq('sessao_id', st)
  const discMap = new Map((disc ?? []).map((d: any) => [d.questao_id, d]))

  // Para revelar o gabarito, buscamos as alternativas corretas separadamente.
  let corretasMap = new Map<string, string>() // questao_id -> alternativa_id correta
  if (gabaritoLiberado) {
    const questaoIds = (sq ?? []).map((r: any) => r.questoes?.id).filter(Boolean)
    if (questaoIds.length) {
      const { data: corretas } = await supabase
        .from('simulado_alternativas')
        .select('id, questao_id')
        .in('questao_id', questaoIds)
        .eq('correta', true)
      corretasMap = new Map((corretas ?? []).map((a) => [a.questao_id as string, a.id as string]))
    }
  }

  const respMap = new Map((respostas ?? []).map((r) => [r.questao_id as string, r]))
  const total = (sq ?? []).length
  const acertos = (respostas ?? []).filter((r) => r.correta).length

  // Estatística por matéria/disciplina (só quando o gabarito está liberado).
  let statsPorDisciplina: Array<{ disciplina: string; acertos: number; total: number; percentual: number }> = []
  if (gabaritoLiberado) {
    const agg = new Map<string, { acertos: number; total: number }>()
    for (const row of sq ?? []) {
      const q = (row as any).questoes
      const disc = q?.disciplinas?.nome ?? 'Sem matéria'
      const resp = respMap.get(q?.id)
      const cur = agg.get(disc) ?? { acertos: 0, total: 0 }
      cur.total += 1
      if (resp?.correta) cur.acertos += 1
      agg.set(disc, cur)
    }
    statsPorDisciplina = [...agg.entries()]
      .map(([disciplina, v]) => ({
        disciplina,
        acertos: v.acertos,
        total: v.total,
        percentual: v.total > 0 ? Math.round((v.acertos / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }

  const questoes = (sq ?? []).map((row: any, idx: number) => {
    const q = row.questoes
    const resp = respMap.get(q?.id)
    const correta_id = corretasMap.get(q?.id) ?? null
    const d = discMap.get(q?.id)
    return {
      numero: idx + 1,
      id: q?.id,
      tipo: q?.tipo ?? 'objetiva',
      enunciado: q?.enunciado ?? '',
      resposta_aluno: resp?.alternativa_id ?? null,
      acertou: gabaritoLiberado ? resp?.correta ?? false : null,
      // Justificativa (comentário do professor) — só revelada com o gabarito.
      justificativa: gabaritoLiberado ? (q?.comentario_professor ?? null) : null,
      // Para discursiva: a resposta escrita + estado da correção.
      discursiva: q?.tipo === 'discursiva' && d
        ? { texto: d.texto ?? '', status: d.status, nota: d.nota, feedback: d.feedback }
        : null,
      alternativas: (q?.alternativas ?? [])
        .slice()
        .sort((a: any, b: any) => a.ordem - b.ordem)
        .map((a: any) => ({
          id: a.id,
          texto: a.texto,
          correta: gabaritoLiberado ? a.id === correta_id : undefined,
        })),
    }
  })

  // Marcadas / em branco + tempo (para a tela de encerramento).
  const marcadas = questoes.filter((q: any) => q.tipo === 'discursiva' ? !!q.discursiva?.texto : !!q.resposta_aluno).length
  const emBranco = Math.max(0, total - marcadas)
  let tempo: string | null = null
  if (sessao.iniciado_em && sessao.finalizado_em) {
    const seg = Math.max(0, Math.floor((new Date(sessao.finalizado_em as string).getTime() - new Date(sessao.iniciado_em as string).getTime()) / 1000))
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60
    tempo = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const admin = createAdminClient()

  // Dados do estudante vinculado (nome + e-mail) para o cabeçalho do encerramento.
  let alunoNome = 'Estudante'
  let alunoEmail = ''
  try {
    const { data: est } = await admin.from('simulado_estudantes').select('nome, user_id').eq('id', sessao.estudante_id).maybeSingle()
    if (est?.nome) alunoNome = est.nome as string
    if (est?.user_id) {
      const { data: u } = await admin.from('simulado_users').select('email').eq('id', est.user_id).maybeSingle()
      if (u?.email) alunoEmail = u.email as string
    }
    if (!alunoEmail) {
      try {
        const { data: est2 } = await admin.from('simulado_estudantes').select('email').eq('id', sessao.estudante_id).maybeSingle()
        if ((est2 as any)?.email) alunoEmail = (est2 as any).email
      } catch { /* estudantes pode não ter coluna email */ }
    }
  } catch { /* sem estudante */ }

  // Caderno vinculado + suas modalidades (para o download "como você fez" por modalidade).
  let cadernoId: string | null = null
  let modalidades: ModalidadeAluno[] = []
  try {
    const qids = questoes.map((q: any) => q.id).filter(Boolean)
    if (qids.length) {
      const { data: qp } = await admin.from('simulado_questao_pasta').select('pasta_id').in('questao_id', qids)
      const pastaIds = [...new Set((qp ?? []).map((r: any) => r.pasta_id))]
      if (pastaIds.length) {
        const { data: cads } = await admin.from('simulado_cadernos_designer').select('id, config').eq('tenant_id', sessao.tenant_id).order('atualizado_em', { ascending: false })
        const cad = (cads ?? []).find((c: any) => c.config?.bancoId && pastaIds.includes(c.config.bancoId))
        cadernoId = (cad?.id as string) ?? null
        if (cad) {
          const tipo = tipoDoSimulado(questoes.map((q: any) => q.tipo))
          modalidades = modalidadesDoAluno(cad.config, tipo)
        }
      }
    }
  } catch { /* sem caderno */ }

  return NextResponse.json({
    titulo: simulado?.titulo ?? 'Simulado',
    nota: sessao.nota ?? null,
    acertos,
    total,
    marcadas,
    em_branco: emBranco,
    tempo,
    aluno_nome: alunoNome,
    aluno_email: alunoEmail,
    iniciado_em: sessao.iniciado_em ?? null,
    finalizado_em: sessao.finalizado_em ?? null,
    estudante_id: sessao.estudante_id ?? null,
    caderno_id: cadernoId,
    modalidades,
    posicao: sessao.posicao_ranking ?? null,
    total_participantes: totalParticipantes ?? 0,
    stats_por_disciplina: statsPorDisciplina,
    gabarito_liberado: gabaritoLiberado,
    nota_liberada: liberacoes.notaLiberada,
    caderno_liberado: liberacoes.cadernoParaAluno,
    questoes,
  })
}
