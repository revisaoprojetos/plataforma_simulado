import { getGamConfig, type MissaoTipo } from './config'
import { diaLocal } from './datas'
import { missoesDoDia } from './rodizio'
import { awardXp } from './xp'

type Evento = 'finalizou_simulado' | 'acertou_questao' | 'praticou'
const MAP: Record<Evento, MissaoTipo> = {
  finalizou_simulado: 'finalizar_simulado',
  acertou_questao: 'acertar_n',
  praticou: 'praticar_n',
}

/**
 * Avança as missões do DIA que respondem ao evento e concede a recompensa ao completar.
 * A linha de progresso é por (aluno, missão, dia) — o próprio `dia` faz o reset diário.
 * A recompensa é idempotente pela unique do ledger (refId = missao:dia).
 */
export async function progredirMissoes(
  svc: any,
  { tenantId, estudanteId, evento, quantidade = 1 }: { tenantId: string; estudanteId: string; evento: Evento; quantidade?: number },
): Promise<void> {
  const config = await getGamConfig(svc, tenantId)
  if (!config?.ativo) return
  const alvo = MAP[evento]
  const hoje = diaLocal(config.timezone)
  // Só progride nas missões que VALEM hoje (seleção ativa + rodízio).
  const missoes = missoesDoDia(config.missoes_def ?? [], config.missoes_config, hoje).filter((m) => m.tipo === alvo)
  if (!missoes.length) return
  for (const m of missoes) {
    const { data: prog } = await svc
      .from('simulado_missao_progresso')
      .select('id, progresso, recompensa_dada')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('missao_id', m.id).eq('dia', hoje)
      .maybeSingle()
    if (prog?.recompensa_dada) continue

    const novo = (prog?.progresso ?? 0) + quantidade
    const completa = novo >= m.meta
    if (prog) {
      await svc.from('simulado_missao_progresso')
        .update({ progresso: novo, completa, recompensa_dada: completa, atualizado_em: new Date().toISOString() })
        .eq('id', prog.id)
    } else {
      // Tolerante a corrida: se outra requisição criou a linha, o unique ignora o insert.
      await svc.from('simulado_missao_progresso')
        .upsert(
          [{ tenant_id: tenantId, estudante_id: estudanteId, missao_id: m.id, dia: hoje, progresso: novo, completa, recompensa_dada: completa }],
          { onConflict: 'tenant_id,estudante_id,missao_id,dia', ignoreDuplicates: true },
        )
    }
    if (completa) await awardXp(svc, { tenantId, estudanteId, origem: 'missao', refId: `${m.id}:${hoje}`, xp: m.xp, meta: { missao: m.id } })
  }
}
