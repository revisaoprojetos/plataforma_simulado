'use client'

import { useEffect } from 'react'

/**
 * Registra o Service Worker (public/sw.js) APÓS o load, sem bloquear o carregamento inicial.
 * Só em produção — em dev o SW atrapalharia o Fast Refresh e cacharia chunks instáveis.
 * Quando uma nova versão do SW assume o controle, recarrega uma vez para pegar os assets novos.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const registrar = () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* silencioso */ }) }
    if (document.readyState === 'complete') registrar()
    else window.addEventListener('load', registrar, { once: true })

    // Novo SW assumiu (deploy novo) → recarrega 1x para servir os assets atualizados.
    let recarregou = false
    const onController = () => { if (recarregou) return; recarregou = true; window.location.reload() }
    navigator.serviceWorker.addEventListener('controllerchange', onController)

    return () => {
      window.removeEventListener('load', registrar)
      navigator.serviceWorker.removeEventListener('controllerchange', onController)
    }
  }, [])
  return null
}
