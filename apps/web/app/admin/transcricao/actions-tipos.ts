import type { Provedor } from '@/lib/ia/config'

export interface StatusIA { configurado: boolean; provider?: Provedor; providerLabel?: string; modelo?: string; mascara?: string; testadaEm?: string | null }
