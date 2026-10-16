import 'server-only'
import type { createAdminClient } from '@/lib/supabase/server'
import { MARATONA, MARATONA_LANCADA, type MaratonaConfig } from './config'

type Svc = ReturnType<typeof createAdminClient>

export interface DesafioMaratonaResolvido {
  /** Pasta real do desafio (folder_area='maratona'), ou null se ainda não existe. */
  pastaId: string | null
  /** Config EFETIVA do card (defaults + edição do admin + contagens reais vinculadas). */
  config: MaratonaConfig
  /** Lançado? (flag do admin em desafio_jogo.config.lancada; fallback = constante). */
  lancada: boolean
}

/**
 * Resolve o desafio Maratona para o ALUNO: lê a pasta real + a config editada no admin
 * (desafio_jogo.config) e VINCULA as contagens reais (simulados na pasta / alunos com acesso) quando
 * os campos estão em modo automático. Assim o card do aluno reflete exatamente o que existe de verdade.
 */
export async function carregarDesafioMaratona(svc: Svc, tenantId: string): Promise<DesafioMaratonaResolvido> {
  const base: MaratonaConfig = { ...MARATONA }
  let pastaId: string | null = null
  let cfg: Record<string, any> = {}
  let lancada = MARATONA_LANCADA
  try {
    const { data } = await svc.from('simulado_pastas').select('id, desafio_jogo')
      .eq('tenant_id', tenantId).eq('folder_area', 'maratona').order('created_at', { ascending: true }).limit(1)
    const row = (data ?? [])[0] as { id: string; desafio_jogo?: any } | undefined
    if (row) {
      pastaId = row.id
      const c = row.desafio_jogo?.config
      if (c && typeof c === 'object') { cfg = c; if (typeof c.lancada === 'boolean') lancada = c.lancada }
    }
  } catch { /* folder_area/desafio_jogo ausente → usa defaults */ }

  let simulados = 0, inscritos = 0
  if (pastaId) {
    try { const { count } = await svc.from('simulado_simulados').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('pasta_id', pastaId); simulados = count ?? 0 } catch { /* 0 */ }
    try { const { count } = await svc.from('simulado_pasta_estudantes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('pasta_id', pastaId); inscritos = count ?? 0 } catch { /* 0 */ }
  }

  const config: MaratonaConfig = { ...base, ...cfg }
  config.qtdSimulados = cfg.qtdSimuladosAuto !== false ? simulados : (cfg.qtdSimulados ?? base.qtdSimulados)
  config.inscritos = cfg.inscritosAuto !== false ? inscritos : (cfg.inscritos ?? base.inscritos)
  return { pastaId, config, lancada }
}
