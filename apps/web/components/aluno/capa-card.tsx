'use client'

import { useState } from 'react'
import { iconeBanco } from '@/lib/banco-visual'

/** Capa (pôster) do card do simulado, com FALLBACK: se não houver capa OU a imagem
 *  falhar ao carregar (URL morta), mostra o gradiente da cor + ícone do banco —
 *  em vez de um card cinza/quebrado. */
export function CapaCard({ capa, cor, icone }: { capa?: string | null; cor: string; icone?: string | null }) {
  const [erro, setErro] = useState(false)
  const Icon = iconeBanco(icone)
  if (!capa || erro) {
    return (
      <>
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />
        <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />
      </>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={capa} alt="" onError={() => setErro(true)} className="absolute inset-0 h-full w-full transform-gpu object-cover transition-transform duration-500 group-hover:scale-105" />
}
