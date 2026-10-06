'use client'

// SIMULADO — marca REVISÃO (spec 06, coluna Revisão). Fase 5 do redesign.
// Switch por `tela` (entrada/prova/resultado). Telas PRESENTACIONAIS sobre mock;
// cada uma guarda seu próprio estado local de UI. Porte fiel dos mockups
// design/SimEntradaRevisao* / SimProvaRevisao* / SimResultadoRevisao*.

import type { SimScreenProps, Tela } from './types'
import { EntradaRevisao } from './revisao/entrada'
import { ProvaRevisao } from './revisao/prova'
import { ResultadoRevisao } from './revisao/resultado'

export function SimuladoRevisao({ tela, theme, data, preview, es, mo, real }: SimScreenProps & { tela: Tela }) {
  // IMPORTANTE: encaminhar `real` (backend da entrada) — sem ele a entrada vira mockup (não avança).
  const props: SimScreenProps = { theme, data, preview, es, mo, real }
  if (tela === 'prova') return <ProvaRevisao {...props} />
  if (tela === 'resultado') return <ResultadoRevisao {...props} />
  return <EntradaRevisao {...props} />
}
