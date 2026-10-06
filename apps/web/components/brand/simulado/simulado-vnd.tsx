'use client'

// SIMULADO — VND (spec 06, coluna VND). Fase 5 — PREVIEW sobre MOCK (motor de prova intacto).
// Fluxo Entrada → Prova → Resultado, cada tela com estado local (useState) semeado por data/es/mo.
// Peças em ./vnd/*. Identidade: ingresso 3D, verde VND + ouro, timer regressivo, "missão cumprida".

import type { SimScreenProps, Tela } from './types'
import { EntradaVND } from './vnd/entrada'
import { ProvaVND } from './vnd/prova'
import { ResultadoVND } from './vnd/resultado'

export function SimuladoVND({ tela, theme, data, preview, es, mo }: SimScreenProps & { tela: Tela }) {
  if (tela === 'prova') return <ProvaVND theme={theme} data={data} preview={preview} es={es} mo={mo} />
  if (tela === 'resultado') return <ResultadoVND theme={theme} data={data} preview={preview} es={es} mo={mo} />
  return <EntradaVND theme={theme} data={data} preview={preview} es={es} mo={mo} />
}
