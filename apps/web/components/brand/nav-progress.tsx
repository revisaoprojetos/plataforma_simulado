'use client'

// Linha de CARREGAMENTO da plataforma (indeterminada, deslizando "pro lado") — tipo o nprogress
// do design antigo. Fica na BASE do topo (posicionada pelo container, `position:absolute;bottom:0`).
// START: clique em link interno (captura) + voltar/avançar (popstate). FIM: a rota muda
// (usePathname/useSearchParams). Rede de segurança: some sozinha após um tempo máximo, caso a
// navegação seja cancelada. Sem dependência externa.

import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const CSS = `
/* O segmento começa TOTALMENTE fora da tela à ESQUERDA (translateX -110% → atrás da barra lateral) e
   ENTRA DESLIZANDO — dá a impressão de "vir de trás da lateral", nunca aparece inteiro parado na linha.
   Curva ease-out-in suave: entra visível rápido, cruza e sai fora-direita; reinicia atrás da lateral. */
.npg-seg{position:absolute;top:0;height:100%;width:40%;left:0;border-radius:4px;
  background:linear-gradient(90deg,transparent,var(--gold,#F1C232),var(--brand,#8F75FF),transparent);
  box-shadow:0 0 12px 2px color-mix(in oklab,var(--gold,#F1C232) 60%,transparent);
  animation:npg-move 1.4s cubic-bezier(.45,0,.35,1) infinite}
@keyframes npg-move{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}
@media (prefers-reduced-motion:reduce){.npg-seg{animation-duration:2.2s}}
`

function NavProgressInner({ edge = 'bottom' }: { edge?: 'bottom' | 'top' }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const [visivel, setVisivel] = useState(false)
  const maxT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inicioRef = useRef(0)
  const MIN_VISIVEL = 480 // ms — garante que a animação apareça mesmo em navegação INSTANTÂNEA (voltar/cache)

  // Navegação CONCLUÍDA (rota/busca mudou) → finaliza, mas respeitando um tempo MÍNIMO visível
  // (senão o "voltar"/navegação em cache é tão rápido que a barra pisca e some sem dar pra ver).
  useEffect(() => {
    if (maxT.current) clearTimeout(maxT.current)
    if (offT.current) clearTimeout(offT.current)
    const decorrido = inicioRef.current ? Date.now() - inicioRef.current : MIN_VISIVEL
    const espera = Math.max(180, MIN_VISIVEL - decorrido)
    offT.current = setTimeout(() => setVisivel(false), espera)
    return () => { if (offT.current) clearTimeout(offT.current) }
  }, [pathname, search])

  // START: clique em link interno + voltar/avançar.
  useEffect(() => {
    function iniciar() {
      if (offT.current) clearTimeout(offT.current)
      inicioRef.current = Date.now()
      setVisivel(true)
      if (maxT.current) clearTimeout(maxT.current)
      maxT.current = setTimeout(() => setVisivel(false), 12000) // rede de segurança
    }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      const a = alvo?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      if (a.target === '_blank' || a.hasAttribute('download')) return
      const raw = a.getAttribute('href') || ''
      if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return
      try {
        const url = new URL(a.href, location.href)
        if (url.origin !== location.origin) return
        // mesma URL exata → não é navegação
        if (url.pathname === location.pathname && url.search === location.search && url.hash) return
      } catch { return }
      iniciar()
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', iniciar)
    // Navegações PROGRAMÁTICAS (router.push que não passam por <a>, ex.: troca de aba via <button>):
    // quem navega dispara `window.dispatchEvent(new Event('navprogress:start'))`.
    window.addEventListener('navprogress:start', iniciar)
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('popstate', iniciar); window.removeEventListener('navprogress:start', iniciar) }
  }, [])

  if (!visivel) return null
  // bottom:-3px => LOGO ABAIXO da borda do topo; top:0 => no topo do conteúdo (áreas sem topbar, ex.: admin).
  const pos: CSSProperties = edge === 'top'
    ? { position: 'absolute', left: 0, right: 0, top: 0, height: 3.5 }
    : { position: 'absolute', left: 0, right: 0, bottom: -3.5, height: 3.5 }
  return (
    <div aria-hidden="true" style={{ ...pos, overflow: 'hidden', pointerEvents: 'none', zIndex: 6 }}>
      <style>{CSS}</style>
      <span className="npg-seg" />
    </div>
  )
}

/** Barra de navegação — auto-contida em Suspense (useSearchParams exige boundary).
 *  `edge`: 'bottom' (base do topo, padrão) ou 'top' (topo do conteúdo, p/ áreas sem topbar). */
export function NavProgress({ edge }: { edge?: 'bottom' | 'top' } = {}) {
  return (
    <Suspense fallback={null}>
      <NavProgressInner edge={edge} />
    </Suspense>
  )
}
