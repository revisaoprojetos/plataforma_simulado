import 'server-only'
import type { Provider, ProviderAdapter } from '@/lib/integracoes/tipos'
import { curseducaAdapter } from '@/lib/integracoes/providers/curseduca'
import { guruAdapter } from '@/lib/integracoes/providers/guru'

/** Registro de adaptadores por provedor. Fonte única para o núcleo/UI/crons. */
const ADAPTERS: Partial<Record<Provider, ProviderAdapter>> = {
  curseduca: curseducaAdapter,
  guru: guruAdapter,
}

export function getAdapter(provider: Provider): ProviderAdapter | null {
  return ADAPTERS[provider] ?? null
}

/** Provedores atualmente disponíveis (têm adaptador registrado). */
export function provedoresDisponiveis(): Provider[] {
  return Object.keys(ADAPTERS) as Provider[]
}
