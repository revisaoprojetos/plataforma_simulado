'use client'

import { createContext, useContext } from 'react'

/** origens_permitidas do tenant (simulado_embed_config), entregues pelo servidor no layout do /embed. */
const Ctx = createContext<readonly string[]>([])

export function EmbedOrigensProvider({ origens, children }: { origens: string[]; children: React.ReactNode }) {
  return <Ctx.Provider value={origens}>{children}</Ctx.Provider>
}

export function useEmbedOrigens(): readonly string[] {
  return useContext(Ctx)
}
