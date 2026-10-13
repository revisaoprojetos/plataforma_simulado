import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { docAcessivelAluno } from '@/lib/leitura/acesso'
import { ehTestadorLeituraDoc } from '@/lib/leitura/testadores'
import { onLeituraConcluida, onQuizConcluido } from '@/lib/gamificacao'
import { invalidarRankingPorDocumento } from '@/lib/leitura/ranking'
import { avaliarMedalhasPorDocumento } from '@/lib/leitura/carimbos'
import { diaBRT } from '@/lib/jurisprudencia/sequencia'
import { creditarTesesLeituraRapida } from '@/lib/jurisprudencia/conteudo'
import { invalidarRankingJuris } from '@/lib/jurisprudencia/ranking'

// POST /api/leitura/quiz-tentativa — registra UMA tentativa concluída do quiz "Questões do conteúdo".
// Cada conclusão (inclusive refazer) vira uma tentativa contabilizada. Tolerante: se a migração da
// tabela ainda não rodou, responde ok:false sem quebrar o quiz.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: { documento_id?: string; acertos?: number; total?: number; respostas?: Record<string, boolean>; desafio?: string }
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const { documento_id } = b
  if (!documento_id) return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  const total = Math.max(0, Math.round(Number(b.total) || 0))
  const acertos = Math.max(0, Math.min(total, Math.round(Number(b.acertos) || 0)))

  const svc = createAdminClient()
  // Gate: só registra em documento publicado/visível ao aluno (fecha IDOR).
  if (!(await docAcessivelAluno(svc, sessao.tenantId, documento_id, sessao.estudanteId))) {
    return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
  }

  try {
    // Próximo número de tentativa = maior existente + 1 (por aluno+documento).
    const { data: ult } = await svc.from('simulado_leitura_quiz_tentativas')
      .select('tentativa_num').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).eq('documento_id', documento_id)
      .order('tentativa_num', { ascending: false }).limit(1).maybeSingle()
    const tentativaNum = ((ult as any)?.tentativa_num ?? 0) + 1
    const nota = total > 0 ? Math.round((acertos / total) * 10000) / 100 : 0
    const { error } = await svc.from('simulado_leitura_quiz_tentativas').insert({
      tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id,
      tentativa_num: tentativaNum, acertos, total, nota, respostas: b.respostas ?? null,
    })
    if (error) return NextResponse.json({ ok: false, message: error.message })
    // MODO TESTE (acesso exclusivo): registra a tentativa (p/ o testador ver o resultado), mas NÃO
    // contabiliza nada — sem XP/combo, sem medalhas e sem mexer no ranking.
    const testador = await ehTestadorLeituraDoc(svc, sessao.tenantId, sessao.estudanteId, documento_id)
    if (!testador) {
      // Gamificação: atividade + bônus de COMBO por gabaritar a aula (uma vez por documento; per-acerto já
      // é creditado nas respostas inline). Fire-and-forget: nunca quebra o registro da tentativa.
      void onQuizConcluido(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, documentoId: documento_id, acertos, total })
      // Medalhas colecionáveis do módulo (carimbos + conquistas): avalia/concede na conclusão do quiz.
      void avaliarMedalhasPorDocumento(svc, sessao.tenantId, documento_id, sessao.estudanteId)
      // Concluir o quiz muda aulas/sequência/pontos no ranking → invalida o cache do módulo na hora
      // (o ranking é por respostas; sem isto só atualizava após o TTL de 5 min). Best-effort.
      void invalidarRankingPorDocumento(svc, sessao.tenantId, documento_id)
      // JURISPRUDÊNCIA (modo "questoes"): concluir o quiz conta como "FEZ O DIA" — igual a leitura rápida.
      // Marca a LEITURA concluída (gate → libera o JOGAR), credita leitura (XP), grava o dia na sequência
      // do juris (ledger origem='jurisprudencia') e credita os pontos das teses (sem as bolinhas do
      // labirinto; best=max). Só quando a conclusão vem do arcade da juris (`desafio` presente).
      if (b.desafio) {
        const desafioId = b.desafio
        try {
          const { data: docd } = await svc.from('simulado_documentos').select('versao').eq('id', documento_id).eq('tenant_id', sessao.tenantId).maybeSingle()
          const versao = Math.max(1, Math.round(Number((docd as any)?.versao) || 1))
          const agora = new Date().toISOString()
          await svc.from('simulado_leitura_progresso').upsert(
            { tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id, documento_versao: versao, pct: 100, concluido_em: agora, atualizado_em: agora },
            { onConflict: 'estudante_id,documento_id,documento_versao' },
          )
          void onLeituraConcluida(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, documentoId: documento_id })
          const hoje = diaBRT()
          void svc.from('simulado_xp_eventos').upsert(
            [{ tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, origem: 'jurisprudencia', ref_id: `${desafioId}:${hoje}`, xp: 0, meta: { dia: hoje, desafio: desafioId } }],
            { onConflict: 'tenant_id,estudante_id,origem,ref_id', ignoreDuplicates: true },
          ).then(() => {}, () => {})
          void creditarTesesLeituraRapida(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, desafioId, documentoId: documento_id })
            .then(() => invalidarRankingJuris(sessao.tenantId, desafioId)).catch(() => {})
        } catch { /* best-effort: nunca quebra o registro da tentativa */ }
      }
    }
    return NextResponse.json({ ok: true, tentativa_num: tentativaNum, acertos, total, nota })
  } catch (e: any) {
    // Migração ausente → não quebra o quiz.
    return NextResponse.json({ ok: false, message: e?.message ?? 'Tentativas indisponíveis.' })
  }
}
