import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Preferências do perfil do aluno (Meta diária + toggles) — guardadas em simulado_estudantes.perfil_prefs (jsonb).
export interface PerfilPrefs {
  metaDiaria: number
  lembrete: boolean
  resumoSemanal: boolean
  aparecerRanking: boolean
  modoFoco: boolean
}

export const PERFIL_PREFS_PADRAO: PerfilPrefs = {
  metaDiaria: 20,
  lembrete: true,
  resumoSemanal: true,
  aparecerRanking: true,
  modoFoco: false,
}

const METAS_VALIDAS = [10, 20, 40, 60]

export function normalizarPrefs(raw: any): PerfilPrefs {
  const r = raw && typeof raw === 'object' ? raw : {}
  const meta = Number(r.metaDiaria)
  return {
    metaDiaria: METAS_VALIDAS.includes(meta) ? meta : PERFIL_PREFS_PADRAO.metaDiaria,
    lembrete: typeof r.lembrete === 'boolean' ? r.lembrete : PERFIL_PREFS_PADRAO.lembrete,
    resumoSemanal: typeof r.resumoSemanal === 'boolean' ? r.resumoSemanal : PERFIL_PREFS_PADRAO.resumoSemanal,
    aparecerRanking: typeof r.aparecerRanking === 'boolean' ? r.aparecerRanking : PERFIL_PREFS_PADRAO.aparecerRanking,
    modoFoco: typeof r.modoFoco === 'boolean' ? r.modoFoco : PERFIL_PREFS_PADRAO.modoFoco,
  }
}

export async function lerPerfilPrefs(svc: SupabaseClient, estudanteId: string): Promise<PerfilPrefs> {
  try {
    const { data } = await svc.from('simulado_estudantes').select('perfil_prefs').eq('id', estudanteId).maybeSingle()
    return normalizarPrefs((data as any)?.perfil_prefs)
  } catch {
    return { ...PERFIL_PREFS_PADRAO }
  }
}
