'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmar } from '@/components/ui/confirm-dialog'

const MSG = 'Você fez alterações que ainda não foram salvas. Se sair agora, elas serão perdidas. Deseja continuar mesmo assim?'

/**
 * Guarda edições não salvas: avisa ao recarregar/fechar a aba (beforeunload) e ao
 * navegar internamente por um link (pop-up de confirmação). `current` é o estado
 * editável — comparado (JSON) com o baseline; chame `markSaved()` após salvar.
 */
export function useUnsavedGuard(current: unknown): { dirty: boolean; markSaved: () => void } {
  const curJson = JSON.stringify(current)
  const baseline = useRef(curJson)
  const [, bump] = useState(0)
  const dirty = curJson !== baseline.current
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const router = useRouter()

  const markSaved = useCallback(() => { baseline.current = JSON.stringify(current); bump((n) => n + 1) }, [current])

  // Recarregar / fechar / navegar por URL → prompt nativo do navegador.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Navegação interna via <a> (sidebar, topo, cards) → intercepta e confirma.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      let url: URL
      try { url = new URL(a.href, location.href) } catch { return }
      if (url.origin !== location.origin) return
      if (url.pathname + url.search === location.pathname + location.search) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation() // evita 2 diálogos quando mais de uma aba está com edições
      const dest = url.pathname + url.search + url.hash
      void confirmar({ titulo: 'Alterações não salvas', mensagem: MSG, confirmar: 'Sair sem salvar', cancelar: 'Continuar editando', destrutivo: true })
        .then((ok) => { if (ok) { dirtyRef.current = false; baseline.current = curJson; router.push(dest) } })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [router, curJson])

  return { dirty, markSaved }
}
