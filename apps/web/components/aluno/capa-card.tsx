'use client'

import { useState } from 'react'
import { iconeBanco } from '@/lib/banco-visual'
import type { CapaViewCfg } from '@/lib/capa-meta'
import { estiloCapaView, estiloCapaDegrade, temEnquadramento } from '@/lib/capa-visual'

/** Capa (pôster/ticket) do card do simulado.
 *  - Novo (não-destrutivo): com `orig` (imagem original) + `cfg` (recorte/desfoque/transparência/degradê
 *    do formato), renderiza por CSS — IDÊNTICO ao que o admin enquadrou, nos dois formatos.
 *  - Fallback: sem enquadramento, usa `capa` com object-cover (comportamento antigo).
 *  - Se não houver capa OU a imagem falhar (URL morta), mostra o gradiente da cor + ícone do banco. */
export function CapaCard({ capa, cor, icone, orig, cfg }: {
  capa?: string | null
  cor: string
  icone?: string | null
  /** Imagem ORIGINAL (não recortada) — base do render por CSS. */
  orig?: string | null
  /** Config do formato exibido (pôster/ticket): recorte + desfoque/transparência/degradê. */
  cfg?: CapaViewCfg | null
}) {
  const [erro, setErro] = useState(false)
  const Icon = iconeBanco(icone)

  // Caminho NOVO: enquadramento não-destrutivo por CSS a partir da original.
  if (!erro && temEnquadramento(orig, cfg)) {
    const deg = estiloCapaDegrade(cfg)
    return (
      <>
        <div className="absolute inset-0 transform-gpu transition-transform duration-500 group-hover/card:scale-105">
          <div className="absolute inset-0" style={estiloCapaView(orig!, cfg)} />
        </div>
        {/* valida a URL da original: se morta, cai no fallback gradiente/ícone */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={orig!} alt="" onError={() => setErro(true)} className="hidden" />
        {deg && <div className="pointer-events-none absolute inset-0" style={deg} />}
      </>
    )
  }

  if (!capa || erro) {
    return (
      <>
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />
        <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10 transition-transform duration-500 group-hover/card:scale-110 group-hover/card:rotate-3" />
      </>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={capa} alt="" onError={() => setErro(true)} className="absolute inset-0 h-full w-full transform-gpu object-cover transition-transform duration-500 group-hover/card:scale-105" />
}
