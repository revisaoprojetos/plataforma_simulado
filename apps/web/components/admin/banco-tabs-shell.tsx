'use client'

import type React from 'react'
import { useEffect, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Tabs } from '@/components/ui/tabs'

/**
 * Abas dirigidas por URL (`?tab=`). Trocar de aba faz uma navegação server-side, então o servidor
 * renderiza SÓ a aba ativa (as demais são condicionais no page) — evita carregar tudo junto.
 *
 * `prefetch`: lista de valores de aba a PRÉ-CARREGAR em background no 1º render (router.prefetch).
 * Com isso, quando o admin abre o simulado, as demais abas já vão sendo preparadas no servidor e a
 * troca fica instantânea (o conteúdo já está no cache do Next). Cada aba deve ter carga otimizada.
 */
export function BancoTabsShell({ value, children, prefetch }: { value: string; children: React.ReactNode; prefetch?: string[] }) {
  const router = useRouter()
  const sp = useSearchParams()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!prefetch?.length || !pathname) return
    for (const t of prefetch) {
      if (t === value) continue
      const p = new URLSearchParams(sp?.toString() ?? '')
      p.set('tab', t)
      router.prefetch(`${pathname}?${p.toString()}`)
    }
    // Só no 1º render (por pathname): pré-carrega as OUTRAS abas uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <>
      {/* Barra de progresso na troca de aba: MESMA "linha que passa" do loader de rota (loading-bar) e
          com loader-atrasado (fica invisível por ~400ms) → em troca rápida/prefetchada não pisca; só
          aparece, suave, quando demora. */}
      {pending && (
        <div className="loader-atrasado fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-primary/15" aria-hidden>
          <div className="loading-bar-fill h-full bg-primary" />
        </div>
      )}
      <Tabs
        value={value}
        onValueChange={(v: string) => {
          const p = new URLSearchParams(sp?.toString() ?? '')
          p.set('tab', v)
          startTransition(() => router.push(`?${p.toString()}`, { scroll: false }))
        }}
      >
        {children}
      </Tabs>
    </>
  )
}
