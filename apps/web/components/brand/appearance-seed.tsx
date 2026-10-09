'use client'

// Semeia a APARÊNCIA do TOKEN (marca + estilos de login/carregamento) no cache do cliente, para que
// TODOS os loaders do fluxo do simulado (fallback de rota, transições do runner, resultado) sigam a
// marca do simulado — e não a do host. Sem isto, um simulado do VND aberto a partir do host do admin
// (Revisão) pisca o carregamento roxo do Revisão. Força a sobrescrita (o host pode já ter populado o
// cache com outra marca). Segue o padrão de priming no corpo do render já usado no shell do portal.

import { useRef } from 'react'
import { primeAppearanceForce, type Appearance } from '@/lib/brand/use-appearance'

export function AppearanceSeed({ appearance }: { appearance: Partial<Appearance> }) {
  const feito = useRef(false)
  if (!feito.current) {
    primeAppearanceForce(appearance)
    feito.current = true
  }
  return null
}
