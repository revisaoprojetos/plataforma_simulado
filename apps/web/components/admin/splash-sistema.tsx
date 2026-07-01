'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { TelaImersao, type EstiloImersao } from '@/components/admin/tela-imersao'

/** Mostra a tela de imersão uma vez por sessão ao acessar o sistema, e some. */
export function SplashSistema({ estilo, logo, nome, mensagem }: { estilo: EstiloImersao; logo: string | null; nome: string; mensagem: string }) {
  const [show, setShow] = useState(false)
  const [fade, setFade] = useState(false)

  useEffect(() => {
    let visto = false
    try { visto = !!sessionStorage.getItem('splash_sistema_visto') } catch { /* ignore */ }
    if (visto) return
    setShow(true)
    const t1 = setTimeout(() => setFade(true), 1100)
    // Marca como visto só ao FINAL (StrictMode-safe: o 2º efeito reagenda os timers
    // em vez de sair cedo, evitando a splash presa).
    const t2 = setTimeout(() => {
      setShow(false)
      try { sessionStorage.setItem('splash_sistema_visto', '1') } catch { /* ignore */ }
    }, 1450)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (!show) return null
  return (
    <div className={cn('fixed inset-0 z-[200] transition-opacity duration-300', fade && 'pointer-events-none opacity-0')}>
      <TelaImersao estilo={estilo} logo={logo} nome={nome} mensagem={mensagem} />
    </div>
  )
}
