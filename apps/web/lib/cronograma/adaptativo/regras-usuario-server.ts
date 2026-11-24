import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { lerRegistroOverlay } from '@/lib/admin/fluxo/overlay-server'
import { overlayEhVazio } from '@/lib/admin/fluxo/overlay'
import type { RegrasMotor } from './regras'
import { compilarRegrasUsuario } from './regras-usuario'

export const ADAPTADOR_ADAPTATIVO = 'cronograma-adaptativo'

/**
 * Aplica as REGRAS DO USUÁRIO (overlay do Fluxo) sobre as regras do motor do tenant. Sem overlay / sem tabela / sem regra com efeito
 * devolve A MESMA referência de `base` (saída do motor idêntica). Regra inválida é ignorada (nunca derruba a geração).
 */
export async function aplicarRegrasUsuarioDoTenant(svc: SupabaseClient, tenantId: string, base: RegrasMotor): Promise<RegrasMotor> {
  try {
    const reg = await lerRegistroOverlay(svc, tenantId, ADAPTADOR_ADAPTATIVO)
    if (overlayEhVazio(reg.overlay)) return base
    return compilarRegrasUsuario(base, reg.overlay).regras
  } catch { return base }
}
