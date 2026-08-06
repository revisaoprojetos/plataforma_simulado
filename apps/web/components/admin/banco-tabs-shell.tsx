'use client'

import type React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs } from '@/components/ui/tabs'

/**
 * Abas do banco dirigidas por URL (`?tab=`). Trocar de aba faz uma navegação server-side, então o
 * servidor renderiza SÓ a aba ativa (as demais são condicionais no page). Isso elimina a contenção
 * de carregar todas as abas juntas — a aba Estudantes caiu de ~21s para ~9s só com isso. As abas
 * pesadas ficam com Suspense, então a troca mostra um esqueleto e o conteúdo streama.
 */
export function BancoTabsShell({ value, children }: { value: string; children: React.ReactNode }) {
  const router = useRouter()
  const sp = useSearchParams()
  return (
    <Tabs
      value={value}
      onValueChange={(v: string) => {
        const p = new URLSearchParams(sp?.toString() ?? '')
        p.set('tab', v)
        router.push(`?${p.toString()}`, { scroll: false })
      }}
    >
      {children}
    </Tabs>
  )
}
