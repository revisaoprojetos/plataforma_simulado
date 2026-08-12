'use client'

import { useEffect } from 'react'

// Registra a atividade diária (streak) uma vez ao carregar o portal, fora do render RSC.
// Fire-and-forget: erros são silenciosos (gamificação nunca atrapalha a navegação).
export function GamificacaoPing() {
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/aluno/gamificacao/ping', { method: 'POST', signal: controller.signal }).catch(() => {})
    return () => controller.abort()
  }, [])
  return null
}
