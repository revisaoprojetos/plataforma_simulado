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
import type { RespostaRapida } from '@/lib/leitura/leitura-rapida'

// "Leitura rápida" — progresso PERSISTIDO do caminho alternativo (leitura + questões num HTML isolado).
// Como o iframe é sandbox (sem same-origin → sem localStorage), a plataforma guarda aqui as respostas
// marcadas, para o aluno SAIR e VOLTAR (retomar) e para saber quando TODAS foram feitas. Ao completar,
// marca concluido_em e credita leitura + quiz (XP + sequência + ranking + medalhas) — mesmo motor do desafio.
// Tolerante: se a migração ainda não rodou, responde ok:false sem quebrar o player.
export const dynamic = 'force-dynamic'

// GET /api/leitura/rapida?documento_id= → estado salvo (para restaurar as marcações ao reabrir).
export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const documentoId = request.nextUrl.searchParams.get('documento_id')
  if (!documentoId) return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })

  const svc = createAdminClient()
  if (!(await docAcessivelAluno(svc, sessao.tenantId, documentoId, sessao.estudanteId))) {
    return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
  }
  try {
    const { data } = await svc.from('simulado_leitura_rapida_progresso')
      .select('respostas, respondidas, total, acertos, concluido_em')
      .eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).eq('documento_id', documentoId).maybeSingle()
    const r = data as any
    return NextResponse.json({
      ok: true,
      respostas: (r?.respostas ?? {}) as Record<string, RespostaRapida>,
      respondidas: Number(r?.respondidas) || 0, total: Number(r?.total) || 0,
      acertos: Number(r?.acertos) || 0, concluido: !!r?.concluido_em,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, respostas: {}, respondidas: 0, total: 0, acertos: 0, concluido: false, message: e?.message })
  }
}

// POST /api/leitura/rapida — auto-save idempotente do progresso. Recebe o MAPA completo de respostas
// marcadas até agora; ao atingir todas (respondidas >= total) conclui o desafio (uma vez).
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: { documento_id?: string; versao?: number; respostas?: Record<string, { alternativa?: string; correta?: boolean }>; total?: number; concluir?: boolean; desafio?: string }
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const documentoId = b.documento_id
  if (!documentoId) return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })

  // Normaliza o mapa de respostas (anti-abuso: só string/bool; teto de 500 chaves).
  const respostas: Record<string, RespostaRapida> = {}
  const ent = Object.entries(b.respostas ?? {}).slice(0, 500)
  for (const [k, v] of ent) {
    if (!v || typeof v !== 'object') continue
    respostas[String(k).slice(0, 80)] = { alternativa: typeof v.alternativa === 'string' ? v.alternativa.slice(0, 16) : undefined, correta: v.correta === true }
  }
  const respondidas = Object.keys(respostas).length
  const acertos = Object.values(respostas).filter((r) => r.correta).length
  const total = Math.max(0, Math.round(Number(b.total) || 0), respondidas)
  const versao = Math.max(1, Math.round(Number(b.versao) || 1))

  const svc = createAdminClient()
  const doc = await docAcessivelAluno(svc, sessao.tenantId, documentoId, sessao.estudanteId, 'id, desafio_ativo')
  if (!doc) return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })

  try {
    // Já concluiu? Checa o GATE (simulado_leitura_progresso), tabela que SEMPRE existe → a conclusão
    // (e os créditos) NÃO dependem da migração da leitura rápida. Créditos disparam UMA vez.
    const { data: gate } = await svc.from('simulado_leitura_progresso')
      .select('concluido_em').eq('estudante_id', sessao.estudanteId).eq('documento_id', documentoId).eq('documento_versao', versao).maybeSingle()
    const jaConcluido = !!(gate as any)?.concluido_em
    // Conclui quando TODAS as questões foram feitas OU quando o aluno clica "Concluir leitura" no player
    // (`concluir`) — o HTML do JurisClub é um slide isolado que não reporta as respostas.
    const concluirAgora = !jaConcluido && (b.concluir === true || (total > 0 && respondidas >= total))
    const concluidoEm = jaConcluido ? (gate as any).concluido_em : (concluirAgora ? new Date().toISOString() : null)

    // Marcações da leitura rápida (retomar) — BEST-EFFORT: se a migração não rodou, NÃO bloqueia a conclusão.
    try {
      await svc.from('simulado_leitura_rapida_progresso').upsert({
        tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id: documentoId,
        respostas, respondidas, total, acertos, concluido_em: concluidoEm, atualizado_em: new Date().toISOString(),
      }, { onConflict: 'estudante_id,documento_id' })
    } catch { /* tabela da leitura rápida ausente → segue (o gate abaixo é o que libera o desafio) */ }

    if (concluirAgora) {
      // MODO TESTE (acesso exclusivo): conclui p/ o testador ver, mas NÃO contabiliza nada.
      const testador = await ehTestadorLeituraDoc(svc, sessao.tenantId, sessao.estudanteId, documentoId)
      if (!testador) {
        // Marca a LEITURA concluída (caminho rápido ignora o tempo mínimo) — LIBERA o desafio do dia.
        await svc.from('simulado_leitura_progresso').upsert({
          tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id: documentoId, documento_versao: versao,
          pct: 100, concluido_em: concluidoEm, atualizado_em: new Date().toISOString(),
        }, { onConflict: 'estudante_id,documento_id,documento_versao' })
        // Gamificação do desafio: leitura (XP) + quiz (combo/sequência). Idempotente por documento no ledger.
        void onLeituraConcluida(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, documentoId })
        void onQuizConcluido(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, documentoId, acertos, total: Math.max(total, respondidas) })
        void avaliarMedalhasPorDocumento(svc, sessao.tenantId, documentoId, sessao.estudanteId)
        void invalidarRankingPorDocumento(svc, sessao.tenantId, documentoId)
        // SEQUÊNCIA DO DESAFIO DE JURISPRUDÊNCIA: grava o DIA DE HOJE (BRT) no ledger imutável
        // (origem='jurisprudencia', meta.dia/meta.desafio) — MESMO marcador do arcade → a conclusão da
        // leitura rápida passa a CONTAR na sequência do juris. Idempotente por ref_id='<desafio>:<hoje>'.
        if (b.desafio) {
          const hoje = diaBRT()
          void svc.from('simulado_xp_eventos').upsert(
            [{ tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, origem: 'jurisprudencia', ref_id: `${b.desafio}:${hoje}`, xp: 0, meta: { dia: hoje, desafio: b.desafio } }],
            { onConflict: 'tenant_id,estudante_id,origem,ref_id', ignoreDuplicates: true },
          ).then(() => {}, () => {})
          // PLACAR do arcade: credita SÓ os pontos das teses/perguntas do dia (sem as bolinhas do
          // labirinto) — ex.: 10×100 = 1000. Quem jogar o labirinto depois pode superar (best = max).
          const desafioRapida = b.desafio
          void creditarTesesLeituraRapida(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, desafioId: desafioRapida, documentoId })
            .then(() => invalidarRankingJuris(sessao.tenantId, desafioRapida))
            .catch(() => {})
        }
      }
    }
    return NextResponse.json({ ok: true, respondidas, total, acertos, concluido: !!concluidoEm, concluiuAgora: concluirAgora })
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Leitura rápida indisponível.' })
  }
}
