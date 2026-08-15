import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { registrarRelatorioEvento } from '@/lib/relatorio-eventos'
import { dispararWebhook } from '@/lib/webhooks/dispatch'
import { dadosProgressao } from '@/lib/webhooks/payload'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { modalidadesDoAlunoV2, temEntregaV2, carregarEntregaBanco, type ModalidadeAluno } from '@/lib/caderno-teste/entrega-aluno'
import { tipoDoSimulado } from '@/lib/simulado/tipo'

// GET /api/sessoes/resultado?st={sessao_id}
// Dados da central de revisão: resumo + questões com resposta do aluno.
// O gabarito (alternativa correta) só é revelado se liberado pela config do simulado.
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

const LETRAS_ALT = ['A', 'B', 'C', 'D', 'E', 'F']
/** Comentário do gabarito a partir das ALTERNATIVAS (usado nos simulados pessoais, cujos comentários
 *  vêm por alternativa): pega o da correta; senão junta os das alternativas comentadas (A) … B) …). */
function comentarioDasAlternativas(alts: any[], corretaId: string | null): string | null {
  const lista = (alts ?? []).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  const correta = lista.find((a) => a.id === corretaId)
  if (correta?.comentario && String(correta.comentario).trim()) return String(correta.comentario)
  const comentadas = lista.filter((a) => a.comentario && String(a.comentario).trim())
  if (comentadas.length) return comentadas.map((a) => `**${LETRAS_ALT[a.ordem] ?? '•'})** ${String(a.comentario).trim()}`).join('\n\n')
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const st = searchParams.get('st')
  if (!st) return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })

  const supabase = await createServiceClient()
  // Escopo por tenant do subdomínio: impede ver resultado de sessão de OUTRA plataforma
  // passando um st qualquer. O aluno acessa pelo próprio subdomínio, então não quebra.
  const tenantId = await getCurrentTenantId()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, tenant_id, simulado_id, status, nota, posicao_ranking, iniciado_em, finalizado_em, estudante_id')
    .eq('id', st)
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle()
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })

  const admin = createAdminClient()

  // Leituras independentes do resultado em PARALELO (caminho quente: 1000+ alunos na tela de
  // resultado). Antes eram ~8 round-trips em série; todas dependem só de sessao/st.
  const [
    { data: participantes },
    { data: simulado },
    classificacao,
    { data: recs },
    { data: sq },
    { data: respostas },
    { data: disc },
    alunoInfo,
  ] = await Promise.all([
    supabase.from('simulado_sessoes_prova').select('estudante_id').eq('simulado_id', sessao.simulado_id).eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false),
    supabase.from('simulado_simulados').select('titulo, status, data_fim, regras, owner_estudante_id').eq('id', sessao.simulado_id).single(),
    (async (): Promise<string | null> => {
      if (!sessao.estudante_id) return null
      const { data } = await supabase.from('simulado_estudantes').select('classificacao').eq('id', sessao.estudante_id).maybeSingle()
      return (data as any)?.classificacao ?? null
    })(),
    supabase.from('simulado_recorrecoes').select('tipo, executado_em').eq('simulado_id', sessao.simulado_id).order('executado_em', { ascending: false }),
    supabase.from('simulado_prova_questoes').select('ordem, anulada, questoes:simulado_questoes(id, tipo, enunciado, comentario_professor, disciplina_id, disciplinas:simulado_disciplinas(nome), alternativas:simulado_alternativas(id, texto, ordem, comentario))').eq('simulado_id', sessao.simulado_id).order('ordem'),
    supabase.from('simulado_respostas_objetivas').select('questao_id, alternativa_id, correta').eq('sessao_id', st),
    supabase.from('simulado_respostas_discursivas').select('questao_id, texto, status, nota, feedback').eq('sessao_id', st),
    // Nome + e-mail do estudante (cabeçalho) — 2 passos encadeados, mas concorrentes com o resto.
    (async (): Promise<{ nome: string; email: string }> => {
      let nome = 'Estudante', email = ''
      try {
        const { data: est } = await admin.from('simulado_estudantes').select('nome, user_id').eq('id', sessao.estudante_id).maybeSingle()
        if (est?.nome) nome = est.nome as string
        if (est?.user_id) {
          const { data: u } = await admin.from('simulado_users').select('email').eq('id', est.user_id).maybeSingle()
          if (u?.email) email = u.email as string
        }
        if (!email) {
          try { const { data: est2 } = await admin.from('simulado_estudantes').select('email').eq('id', sessao.estudante_id).maybeSingle(); if ((est2 as any)?.email) email = (est2 as any).email } catch { /* estudantes pode não ter email */ }
        }
      } catch { /* sem estudante */ }
      return { nome, email }
    })(),
  ])

  // Engajamento: registra a visualização do relatório — best-effort, NÃO bloqueia a resposta.
  if (sessao.status === 'finalizada' && sessao.tenant_id) {
    void (async () => {
      try {
        await registrarRelatorioEvento(admin, { tenantId: sessao.tenant_id, simuladoId: sessao.simulado_id, estudanteId: sessao.estudante_id, sessaoId: sessao.id, tipo: 'visualizou' })
        void dispararWebhook(sessao.tenant_id, 'estudante.visualizou_relatorio', await dadosProgressao(admin, sessao as any))
      } catch { /* best-effort */ }
    })()
  }

  const totalParticipantes = new Set((participantes ?? []).map((p: any) => p.estudante_id)).size
  const alunoNome = alunoInfo.nome
  const alunoEmail = alunoInfo.email

  const liberacoes = resolverLiberacoes(simulado?.regras as any, simulado ?? {}, { classificacao })
  // Simulado PESSOAL do aluno (owner_estudante_id): gabarito/nota SEMPRE liberados (é o estudo dele).
  const pessoal = !!(simulado as any)?.owner_estudante_id
  const gabaritoLiberado = pessoal || liberacoes.gabaritoLiberado

  // Avisos de mudança de gabarito (anulação/troca) neste simulado → faixa no topo da revisão.
  const recorrecoes = (recs ?? []) as any[]
  const avisoGabarito = recorrecoes.length
    ? {
        total: recorrecoes.length,
        anuladas: recorrecoes.filter((r) => r.tipo === 'anulacao').length,
        trocas: recorrecoes.filter((r) => r.tipo === 'troca_alternativa').length,
        ultima: recorrecoes[0]?.executado_em ?? null,
      }
    : null

  const discMap = new Map((disc ?? []).map((d: any) => [d.questao_id, d]))

  // Gabarito (alternativas corretas) + modalidades do caderno — pós-batch, independentes entre si.
  const bancoBaseIdV2 = (simulado?.regras as any)?.banco_base_id as string | undefined
  const [corretasMap, modalidades] = await Promise.all([
    (async (): Promise<Map<string, string>> => {
      if (!gabaritoLiberado) return new Map<string, string>()
      const questaoIds = (sq ?? []).map((r: any) => r.questoes?.id).filter(Boolean)
      if (!questaoIds.length) return new Map<string, string>()
      const { data: corretas } = await supabase.from('simulado_alternativas').select('id, questao_id').in('questao_id', questaoIds).eq('correta', true)
      return new Map((corretas ?? []).map((a) => [a.questao_id as string, a.id as string]))
    })(),
    (async (): Promise<ModalidadeAluno[]> => {
      if (!bancoBaseIdV2) return []
      const entrega = await carregarEntregaBanco(admin, sessao.tenant_id, bancoBaseIdV2)
      return temEntregaV2(entrega) ? modalidadesDoAlunoV2(entrega) : []
    })(),
  ])
  const cadernoId: string | null = null

  const respMap = new Map((respostas ?? []).map((r) => [r.questao_id as string, r]))
  // Questões anuladas continuam no total e valem ponto para TODOS (não contam como erro/branco).
  const anuladaSet = new Set<string>(
    (sq ?? []).filter((row: any) => row.anulada === true).map((row: any) => row.questoes?.id).filter(Boolean),
  )
  const total = (sq ?? []).length
  const acertos = (respostas ?? []).filter((r) => r.correta && !anuladaSet.has(r.questao_id as string)).length + anuladaSet.size

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
      // Anulada = acerto garantido para todos naquela disciplina.
      if ((row as any).anulada === true || resp?.correta) cur.acertos += 1
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
    const anulada = row.anulada === true
    const resp = respMap.get(q?.id)
    const correta_id = corretasMap.get(q?.id) ?? null
    const d = discMap.get(q?.id)
    return {
      numero: idx + 1,
      id: q?.id,
      tipo: q?.tipo ?? 'objetiva',
      anulada,
      enunciado: q?.enunciado ?? '',
      resposta_aluno: resp?.alternativa_id ?? null,
      // Anulada = ponto garantido (independe do gabarito estar liberado).
      acertou: anulada ? true : (gabaritoLiberado ? resp?.correta ?? false : null),
      // Justificativa (comentário do professor) — só revelada com o gabarito. No simulado pessoal,
      // cai para o comentário das ALTERNATIVAS (formato do import) quando não há comentario_professor.
      justificativa: gabaritoLiberado ? (q?.comentario_professor ?? (pessoal ? comentarioDasAlternativas(q?.alternativas, correta_id) : null)) : null,
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
  // Anuladas não são "em branco" (ponto garantido) — saem da contagem de não respondidas.
  const emBranco = Math.max(0, total - marcadas - anuladaSet.size)
  let tempo: string | null = null
  if (sessao.iniciado_em && sessao.finalizado_em) {
    const seg = Math.max(0, Math.floor((new Date(sessao.finalizado_em as string).getTime() - new Date(sessao.iniciado_em as string).getTime()) / 1000))
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60
    tempo = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

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
    nota_liberada: pessoal || liberacoes.notaLiberada,
    caderno_liberado: liberacoes.cadernoParaAluno,
    aviso_gabarito: avisoGabarito,
    questoes,
  })
}
