import 'server-only'
import { contatoEstudante, COLS_CONTATO } from '@/lib/webhooks/payload'
import { dispararWebhook } from '@/lib/webhooks/dispatch'
import { eventoDoTipo, interpolarMensagem, type EngajamentoTipo, type EngajamentoGatilho } from './engajamento-tipos'

export * from './engajamento-tipos'

/**
 * Dispara um evento de engajamento para um aluno, de forma IDEMPOTENTE (o log evita repetir o mesmo
 * `ref`): registra no log e, se for a 1ª vez, envia o webhook (`engajamento.<tipo>`) com o contato do
 * aluno + o bloco `engajamento` (streak/dias/marco/mensagem já interpolada). Best-effort: nunca lança.
 * Retorna true se ENVIOU agora (útil p/ contagem no cron). Fica dormente se a tabela de log não existir.
 */
export async function dispararEngajamento(
  svc: any,
  args: { tenantId: string; estudanteId: string; tipo: EngajamentoTipo; ref: string; gatilho: EngajamentoGatilho; streakAtual: number; streakMaior?: number; diasInativo?: number; marco?: number },
): Promise<boolean> {
  const { tenantId, estudanteId, tipo, ref, gatilho } = args
  try {
    // Idempotência: só segue se a inserção "pegou" (sem conflito). Sem a tabela → dormente (não envia).
    const { data: inserido, error: logErr } = await svc
      .from('simulado_gamificacao_engajamento_log')
      .upsert({ tenant_id: tenantId, estudante_id: estudanteId, tipo, ref }, { onConflict: 'tenant_id,estudante_id,tipo,ref', ignoreDuplicates: true })
      .select('id')
    if (logErr || !inserido?.length) return false

    const { data: est } = await svc.from('simulado_estudantes').select(COLS_CONTATO).eq('id', estudanteId).eq('tenant_id', tenantId).maybeSingle()
    if (!est) return false
    const contact = contatoEstudante(est, estudanteId)

    const vars = {
      nome: (est.nome ?? '').split(' ')[0] || 'estudante',
      dias: args.diasInativo ?? gatilho.dias ?? args.streakAtual,
      marco: args.marco ?? '',
      streak: args.streakAtual,
      maior: args.streakMaior ?? args.streakAtual,
    }
    const mensagem = interpolarMensagem(gatilho.mensagem, vars)

    await dispararWebhook(tenantId, eventoDoTipo(tipo) as any, {
      contact,
      engajamento: {
        tipo,
        dias: args.diasInativo ?? gatilho.dias ?? null,
        marco: args.marco ?? null,
        streak_atual: args.streakAtual,
        streak_maior: args.streakMaior ?? args.streakAtual,
        mensagem,
      },
    })
    return true
  } catch {
    return false
  }
}
