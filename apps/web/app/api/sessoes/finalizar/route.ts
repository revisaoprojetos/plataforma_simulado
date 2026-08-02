import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { rankearSimulado } from '@/lib/ranking'
import { contextoNota, calcularNota } from '@/lib/simulado/nota'
import { dispararWebhook } from '@/lib/webhooks/dispatch'
import { dadosProgressao } from '@/lib/webhooks/payload'
import { publicarAoVivo } from '@/lib/realtime/pubsub'

// POST /api/sessoes/finalizar — finaliza a sessão e calcula a nota.
//
// `respostas` (opcional): o mapa COMPLETO do que o aluno marcou no cliente
// (questao_id -> alternativa_id). Antes de corrigir, o servidor RECONCILIA esse
// mapa com o que está no banco e grava o que faltou/divergiu — assim nenhuma
// questão marcada fica de fora se um auto-save falhou no meio da prova.
export async function POST(request: NextRequest) {
  let body: { sessao_id?: string; respostas?: Record<string, string> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  const { sessao_id } = body
  const marcadas = body.respostas && typeof body.respostas === 'object' ? body.respostas : {}
  if (!sessao_id) {
    return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, status, tenant_id, estudante_id')
    .eq('id', sessao_id)
    .maybeSingle()

  if (!sessao) {
    return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  }

  // ── RECONCILIAÇÃO (só enquanto a sessão está aberta) ────────────────────────
  // Garante que TUDO que o aluno marcou esteja salvo antes da correção.
  let recuperadas = 0
  const marcadasIds = Object.keys(marcadas)
  if (sessao.status !== 'finalizada' && marcadasIds.length > 0) {
    // Guard de integridade: só reconcilia questões que pertencem a ESTE simulado.
    const { data: pqSet } = await supabase
      .from('simulado_prova_questoes')
      .select('questao_id')
      .eq('simulado_id', sessao.simulado_id)
    const doSimulado = new Set((pqSet ?? []).map((r: any) => r.questao_id))

    // O que já está gravado, para comparar (faltando OU divergente do que o aluno marcou).
    const { data: jaSalvas } = await supabase
      .from('simulado_respostas_objetivas')
      .select('questao_id, alternativa_id')
      .eq('sessao_id', sessao_id)
    const salvoDe = new Map((jaSalvas ?? []).map((r: any) => [r.questao_id, r.alternativa_id]))

    const pendentes = marcadasIds.filter((q) => doSimulado.has(q) && salvoDe.get(q) !== marcadas[q])
    if (pendentes.length > 0) {
      // Resolve letra/correta em lote (mesma lógica do auto-save, por ordem da alternativa).
      const { data: alts } = await supabase
        .from('simulado_alternativas')
        .select('id, questao_id, correta, ordem')
        .in('questao_id', pendentes)
        .order('ordem')
      const porQuestao = new Map<string, any[]>()
      for (const a of (alts ?? []) as any[]) {
        const arr = porQuestao.get(a.questao_id) ?? []
        arr.push(a)
        porQuestao.set(a.questao_id, arr)
      }
      const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']
      const rows: any[] = []
      for (const q of pendentes) {
        const lista = porQuestao.get(q)
        if (!lista) continue
        const idx = lista.findIndex((a) => a.id === marcadas[q])
        if (idx < 0) continue // alternativa inválida para a questão — ignora (não corrompe)
        const a = lista[idx]
        rows.push({
          tenant_id: sessao.tenant_id,
          sessao_id,
          questao_id: q,
          alternativa_id: a.id,
          correta: a.correta,
          pontuacao: a.correta ? 1 : 0,
          snapshot_gabarito: { alternativa_id: a.id, correta: a.correta, letra: LETRA[idx] ?? '?' },
          respondido_em: new Date().toISOString(),
        })
      }
      if (rows.length > 0) {
        const { error } = await supabase
          .from('simulado_respostas_objetivas')
          .upsert(rows, { onConflict: 'sessao_id,questao_id' })
        if (!error) recuperadas = rows.length
      }
    }
  }

  // Nota canônica (mesma regra de anulação usada na re-correção — fonte única).
  const ctx = await contextoNota(supabase, sessao.simulado_id)
  const { data: respostas } = await supabase
    .from('simulado_respostas_objetivas')
    .select('questao_id, correta')
    .eq('sessao_id', sessao_id)
  const totalQ = ctx.totalQuestoes - [...ctx.anuladas.values()].filter((p) => p === 'desconsidera').length
  const acertos = (respostas ?? []).filter((r: any) => r.correta && !ctx.anuladas.has(r.questao_id)).length
    + [...ctx.anuladas.values()].filter((p) => p === 'pontua_todos').length
  const nota = calcularNota((respostas ?? []) as any[], ctx)

  if (sessao.status !== 'finalizada') {
    await supabase
      .from('simulado_sessoes_prova')
      .update({ status: 'finalizada', finalizado_em: new Date().toISOString(), nota })
      .eq('id', sessao_id)

    await supabase.from('simulado_sessao_eventos').insert({
      tenant_id: sessao.tenant_id,
      sessao_id,
      tipo: 'finalizou',
    })

    await rankearSimulado(supabase, sessao.simulado_id)
    void publicarAoVivo(sessao.simulado_id) // realtime: painel "Ao Vivo" (Fase 2)

    // Notifica sistemas externos (webhooks/n8n): estudante finalizou. Fire-and-forget: não segura
    // a resposta ao aluno pela entrega/retry do webhook (só o dadosProgressao, um read rápido, é aguardado).
    void dispararWebhook(sessao.tenant_id, 'estudante.finalizou',
      await dadosProgressao(supabase, sessao, { nota: Math.round(nota * 100) / 100, acertos, total: totalQ }))
  }

  // Posição final do aluno (após o recálculo).
  const { data: ranked } = await supabase
    .from('simulado_sessoes_prova')
    .select('posicao_ranking')
    .eq('id', sessao_id)
    .maybeSingle()

  return NextResponse.json({ nota, acertos, total: totalQ, posicao: ranked?.posicao_ranking ?? null, recuperadas })
}
