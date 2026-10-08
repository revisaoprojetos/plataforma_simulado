import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { onPraticaRespondida } from '@/lib/gamificacao'
import { docAcessivelAluno } from '@/lib/leitura/acesso'
import { ehTestadorLeituraDoc } from '@/lib/leitura/testadores'

// POST /api/leitura/resposta — responde uma questão inline da leitura (validação server-side).
export const dynamic = 'force-dynamic'
const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: { documento_id?: string; questao_id?: string; alternativa_id?: string }
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const { documento_id, questao_id, alternativa_id } = b
  if (!documento_id || !questao_id || !alternativa_id) return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })

  const svc = createAdminClient()

  // Gate anti-IDOR: só responde questões de documento publicado/visível ao aluno (evita creditar XP
  // e vazar gabarito de conteúdo restrito).
  if (!(await docAcessivelAluno(svc, sessao.tenantId, documento_id, sessao.estudanteId))) {
    return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
  }

  // MODO TESTE (acesso exclusivo): ignora gates e grava sem contabilizar (refaz à vontade).
  const testador = await ehTestadorLeituraDoc(svc, sessao.tenantId, sessao.estudanteId, documento_id)

  // Regras do módulo (opcionais, default OFF): SEQUENCIAL (só responde um dia com os anteriores
  // concluídos) e BLOQUEAR REFAZER (questão já respondida não pode ser re-respondida — trava o quiz
  // após concluir). A flag de refazer é usada logo abaixo, na hora de gravar. Testador pula tudo.
  let bloquearRefazer = false
  if (!testador) try {
    const { data: docAtual } = await svc.from('simulado_documentos').select('pasta_id, ordem').eq('id', documento_id).eq('tenant_id', sessao.tenantId).maybeSingle()
    const pastaId = (docAtual as any)?.pasta_id
    if (pastaId) {
      const { data: pasta } = await svc.from('simulado_pastas').select('regra_sequencial, quiz_bloquear_refazer').eq('id', pastaId).eq('tenant_id', sessao.tenantId).maybeSingle()
      bloquearRefazer = (pasta as any)?.quiz_bloquear_refazer === true
      if ((pasta as any)?.regra_sequencial === true) {
        const { data: antes } = await svc.from('simulado_documentos').select('id').eq('tenant_id', sessao.tenantId).eq('pasta_id', pastaId).eq('deletado', false).eq('publicado', true).lt('ordem', (docAtual as any)?.ordem ?? 0)
        const antesIds = (antes ?? []).map((a: any) => a.id)
        if (antesIds.length) {
          const [qz, rp] = await Promise.all([
            svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', sessao.tenantId).eq('deletado', false).in('documento_id', antesIds),
            svc.from('simulado_leitura_respostas').select('documento_id, questao_id').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).in('documento_id', antesIds),
          ])
          const qpd = new Map<string, Set<string>>(); for (const q of (qz.data ?? []) as any[]) (qpd.get(q.documento_id) ?? qpd.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)
          const apd = new Map<string, Set<string>>(); for (const r of (rp.data ?? []) as any[]) (apd.get(r.documento_id) ?? apd.set(r.documento_id, new Set()).get(r.documento_id)!).add(r.questao_id)
          const pendente = antesIds.some((id: string) => { const qs = qpd.get(id); if (!qs || qs.size === 0) return false; const ans = apd.get(id) ?? new Set<string>(); return ![...qs].every((x) => ans.has(x)) })
          if (pendente) return NextResponse.json({ message: 'Conclua a aula anterior antes de responder esta.' }, { status: 403 })
        }
      }
    }
  } catch { /* coluna/tabela ausente → não bloqueia (comportamento livre) */ }

  // A questão precisa estar realmente anexada a este documento (evita responder qualquer questão) —
  // seja como questão INLINE da leitura (simulado_documento_questoes) OU como "Questões do conteúdo"
  // do mini-simulado (simulado_documento_quiz_questoes). Aceitar as duas fontes.
  const [vincInline, vincQuiz] = await Promise.all([
    svc.from('simulado_documento_questoes').select('id').eq('tenant_id', sessao.tenantId).eq('documento_id', documento_id).eq('questao_id', questao_id).eq('deletado', false).maybeSingle(),
    svc.from('simulado_documento_quiz_questoes').select('id').eq('tenant_id', sessao.tenantId).eq('documento_id', documento_id).eq('questao_id', questao_id).eq('deletado', false).maybeSingle(),
  ])
  if (!vincInline.data && !vincQuiz.data) return NextResponse.json({ message: 'Questão não pertence a este documento.' }, { status: 400 })

  // Resolve correta/letra pelas alternativas (autoridade do servidor).
  const { data: alts } = await svc.from('simulado_alternativas').select('id, correta, ordem').eq('questao_id', questao_id).order('ordem')
  const idx = (alts ?? []).findIndex((a: any) => a.id === alternativa_id)
  if (idx < 0) return NextResponse.json({ message: 'Alternativa inválida.' }, { status: 400 })
  const alt = (alts as any[])[idx]
  const correta = !!alt.correta
  const corretaId = (alts as any[]).find((a) => a.correta)?.id ?? null

  const { data: disc } = await svc.from('simulado_questoes').select('disciplina_id').eq('id', questao_id).maybeSingle()

  // PRINCIPAL = WRITE-ONCE: a 1ª resposta de cada questão fica IMUTÁVEL (data, alternativa e acerto).
  // REFAZER o quiz NUNCA sobrescreve o principal — senão o "dia de conclusão" migra e QUEBRA a
  // sequência (foi o bug da aluna que refez e o registro pulou de dia). O redo é guardado como
  // TENTATIVA SEPARADA em /api/leitura/quiz-tentativa (tentativa_num+1), então nada se perde.
  const { data: jaResp } = await svc.from('simulado_leitura_respostas')
    .select('id').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
    .eq('documento_id', documento_id).eq('questao_id', questao_id).maybeSingle()
  // BLOQUEAR REFAZER: questão já respondida + módulo com a trava ligada → não re-responde (quiz travado).
  if (bloquearRefazer && jaResp) return NextResponse.json({ message: 'Este quiz já foi concluído e não pode ser refeito.', bloqueado: 'refazer' }, { status: 403 })

  // ON CONFLICT DO NOTHING (ignoreDuplicates): insere só na 1ª vez; refazer é IGNORADO (principal intacto).
  // TESTADOR: sobrescreve (ignoreDuplicates=false) p/ poder refazer sempre; e nunca credita XP.
  const { data: up, error } = await svc.from('simulado_leitura_respostas').upsert(
    {
      tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id, questao_id,
      alternativa_id, correta, snapshot_gabarito: { alternativa_id, correta, letra: LETRA[idx] ?? '?', correta_id: corretaId },
      respondido_em: new Date().toISOString(),
    },
    { onConflict: 'estudante_id,documento_id,questao_id', ignoreDuplicates: !testador },
  ).select('id').maybeSingle()
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  // XP por acerto SÓ quando realmente gravou a 1ª resposta (up != null); refazer (ignorado) não re-credita.
  // Testador nunca contabiliza (sem XP/streak).
  if (up && !testador) void onPraticaRespondida(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, respostaId: (up as any).id, correta, disciplinaId: (disc as any)?.disciplina_id ?? null })

  return NextResponse.json({ ok: true, correta, correta_id: corretaId, letra: LETRA[idx] ?? '?', jaRespondida: !!jaResp })
}
