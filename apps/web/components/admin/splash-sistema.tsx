'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { TelaImersao, type EstiloImersao } from '@/components/admin/tela-imersao'

/** Mostra a tela de imersão uma vez por sessão ao acessar o sistema, e some. */
export function SplashSistema({ estilo, logo, nome, mensagem }: { estilo: EstiloImersao; logo: string | null; nome: string; mensagem: string }) {
  const [show, setShow] = useState(false)
  const [fade, setFade] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem('splash_sistema_visto')) return
      sessionStorage.setItem('splash_sistema_visto', '1')
    } catch { /* ignore */ }
    setShow(true)
    const t1 = setTimeout(() => setFade(true), 1100)
    const t2 = setTimeout(() => setShow(false), 1450)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (!show) return null
  return (
    <div className={cn('fixed inset-0 z-[200] transition-opacity duration-300', fade && 'pointer-events-none opacity-0')}>
      <TelaImersao estilo={estilo} logo={logo} nome={nome} mensagem={mensagem} />
    </div>
  )
}
