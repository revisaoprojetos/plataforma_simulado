'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { confirmar } from '@/components/ui/confirm-dialog'

const MSG = 'Você fez alterações que ainda não foram salvas. Se sair agora, elas serão perdidas. Deseja continuar mesmo assim?'
const flagKey = () => 'unsaved-guard:' + location.pathname

/** Este load foi um RELOAD da mesma página (F5/refresh), não uma navegação nova? */
function foiReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav) return nav.type === 'reload'
    return (performance as any).navigation?.type === 1
  } catch { return false }
}

// Registro global dos guards ativos → permite a ações que NÃO são <a> (ex.: botão "Sair"/logout)
// checarem edições pendentes e reusarem o mesmo pop-up de confirmação.
const guardsAtivos = new Set<() => boolean>()
let saidaConfirmada = false

/** Há QUALQUER formulário guardado com edições não salvas na tela? */
export function temAlteracoesNaoSalvas(): boolean {
  return [...guardsAtivos].some((fn) => { try { return fn() } catch { return false } })
}

/**
 * Chame antes de uma saída que não passa por um <a> (ex.: botão "Sair"/logout). Se houver
 * edições pendentes, mostra o pop-up do guard e só resolve `true` se o usuário confirmar
 * descartar; nesse caso libera o `beforeunload` para não prompt-ar de novo nessa saída.
 */
export async function confirmarDescartarAlteracoes(): Promise<boolean> {
  if (!temAlteracoesNaoSalvas()) return true
  const ok = await confirmar({ titulo: 'Alterações não salvas', mensagem: MSG, confirmar: 'Sair sem salvar', cancelar: 'Continuar editando', destrutivo: true })
  if (ok) saidaConfirmada = true
  return ok
}

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

  // Registra este guard no conjunto global (p/ o botão "Sair" checar edições fora de um <a>).
  useEffect(() => {
    const fn = () => dirtyRef.current
    guardsAtivos.add(fn)
    return () => { guardsAtivos.delete(fn) }
  }, [])

  // Recarregar / fechar / navegar por URL → prompt nativo do navegador. Ao sair com edições
  // pendentes, marca um flag por página p/ avisar (toast) se o load seguinte for um reload.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current || saidaConfirmada) return
      try { sessionStorage.setItem(flagKey(), '1') } catch { /* ignore */ }
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Ao montar: se a página foi RECARREGADA tendo edições não salvas, avisa que elas se perderam.
  // Limpa o flag sempre (evita aviso falso em navegações normais). Com vários formulários na mesma
  // página, o 1º efeito remove o flag → os demais não repetem o toast.
  useEffect(() => {
    try {
      const had = sessionStorage.getItem(flagKey())
      sessionStorage.removeItem(flagKey())
      if (had && foiReload()) {
        toast.warning('A página foi recarregada e as alterações não salvas foram perdidas.', { duration: 6000 })
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
