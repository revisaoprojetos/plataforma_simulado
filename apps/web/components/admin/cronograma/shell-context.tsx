'use client'

import { createContext, useContext } from 'react'

/**
 * COMPATIBILIDADE do redesign de Cronogramas. Dentro do <ShellCronogramas> (layouts de /admin/cronogramas e do shell
 * /admin/revisao/cronograma), com este contexto ligado:
 *  - <CabecalhoArea> (de qualquer página, inclusive legadas) usa eyebrow "Cronogramas" e, DEPOIS do título/descrição/
 *    ações, renderiza BarraSetor + <CronogramasNav/> — a única instância de cada fileira;
 *  - <AdaptativoTabs/> e <CronogramaTabs/> (fachadas) retornam null.
 * Página migrada = usa <TituloTela/>; nada mais a remover. Fora do shell o contexto é false (nada muda).
 */
const Ctx = createContext(false)
export const ShellCronogramasProvider = Ctx.Provider
export function useDentroDoShellCronogramas(): boolean {
  return useContext(Ctx)
}
