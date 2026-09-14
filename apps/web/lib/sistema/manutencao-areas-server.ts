import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import {
  normalizarManutencaoAreas, normalizarMapaAreas, normalizarLiberados, ocultarDiscursivaDe,
  AREAS_MANUTENCAO, AREAS_MANUTENCAO_ALUNO, type ManutencaoAreas, type ManutencaoLiberados,
} from './manutencao-areas'

/**
 * Lê o mapa de áreas em manutenção do tenant atual. Seleciona só o caminho jsonb
 * (`tema->manutencao_areas`) para NÃO puxar os logos base64 do tema. Fail-open: qualquer
 * erro → nada em manutenção (nunca trancar por bug de leitura).
 */
export async function getManutencaoAreas(): Promise<ManutencaoAreas> {
  try {
    const tid = await getCurrentTenantId()
    const svc = createAdminClient()
    const base = svc.from('simulado_tenants').select('m:tema->manutencao_areas')
    const { data } = tid
      ? await base.eq('id', tid).maybeSingle()
      : await base.eq('ativo', true).limit(1).maybeSingle()
    return normalizarManutencaoAreas((data as { m?: unknown } | null)?.m)
  } catch {
    return normalizarManutencaoAreas(null)
  }
}

/** A discursiva deve ser escondida agora? (env global OU manutenção por-tenant.) Para server components. */
export async function getOcultarDiscursiva(): Promise<boolean> {
  return ocultarDiscursivaDe(await getManutencaoAreas())
}

/** Allowlist (ids de ADMIN liberados por área) do tenant atual. Fail-open: erro → vazio. */
export async function getManutencaoAreasLiberados(): Promise<ManutencaoLiberados> {
  try {
    const tid = await getCurrentTenantId()
    const svc = createAdminClient()
    const base = svc.from('simulado_tenants').select('m:tema->manutencao_areas_liberados')
    const { data } = tid
      ? await base.eq('id', tid).maybeSingle()
      : await base.eq('ativo', true).limit(1).maybeSingle()
    return normalizarLiberados((data as { m?: unknown } | null)?.m, AREAS_MANUTENCAO)
  } catch {
    return normalizarLiberados(null, AREAS_MANUTENCAO)
  }
}

/** Manutenção das áreas do ALUNO (ativos + allowlist de estudantes) do tenant atual. Fail-open. */
export async function getManutencaoAluno(): Promise<{ ativos: ManutencaoAreas; liberados: ManutencaoLiberados }> {
  try {
    const tid = await getCurrentTenantId()
    const svc = createAdminClient()
    const base = svc.from('simulado_tenants').select('a:tema->manutencao_aluno, l:tema->manutencao_aluno_liberados')
    const { data } = tid
      ? await base.eq('id', tid).maybeSingle()
      : await base.eq('ativo', true).limit(1).maybeSingle()
    const row = (data as { a?: unknown; l?: unknown } | null) ?? {}
    return {
      ativos: normalizarMapaAreas(row.a, AREAS_MANUTENCAO_ALUNO),
      liberados: normalizarLiberados(row.l, AREAS_MANUTENCAO_ALUNO),
    }
  } catch {
    return { ativos: normalizarMapaAreas(null, AREAS_MANUTENCAO_ALUNO), liberados: normalizarLiberados(null, AREAS_MANUTENCAO_ALUNO) }
  }
}
