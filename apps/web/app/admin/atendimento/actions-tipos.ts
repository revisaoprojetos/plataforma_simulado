// Tipos exportados por atendimento/actions.ts — fora do 'use server' para não quebrar o next build.

import type { Duvida, DuvidaMensagem } from '@/lib/duvidas/tipos'

export type ThreadDuvida = {
  duvida: Duvida
  mensagens: DuvidaMensagem[]
  estudanteNome: string
  estudanteEmail: string | null
}
