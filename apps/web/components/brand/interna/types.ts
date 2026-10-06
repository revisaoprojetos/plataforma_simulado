// Contrato mínimo compartilhado das TELAS INTERNAS (spec 05). Cada página (Perfil/Resultado/
// Cronograma) define seu próprio mock/estado internamente; aqui só o shape comum de entrada.

import type { Brand, InternaTheme } from './interna-tokens'

export type { Brand, InternaTheme }

export interface InternaScreenProps {
  brand: Brand
  theme: InternaTheme
  /** Aba/seção inicial (chave varia por página; cada switch valida internamente). */
  tab?: string
  /** Prévia (sem efeitos colaterais/navegação real). */
  preview?: boolean
}
