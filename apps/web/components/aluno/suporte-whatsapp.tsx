'use client'

// Botão FLUTUANTE de suporte por WhatsApp (canto inferior direito do portal do aluno, todas as marcas).
// Abre o wa.me com a mensagem pronta e ALTERNA entre os números a cada clique (rodízio): o 1º número de
// cada aluno é sorteado (divide a demanda entre os atendentes) e o índice fica no localStorage.
// No celular sobe acima da down bar; some nos LEITORES (grifos/ferramentas ocupam o rodapé).
// O botão pode ser ARRASTADO (mouse/toque): ao soltar ele é PUXADO com animação para o canto mais próximo
// e fica ali (nunca fica solto pela tela). O canto escolhido fica no localStorage.
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const CHAVE_CANTO = 'suporte-wa-canto'
const LIMIAR_ARRASTE = 6 // px de movimento até virar arraste (abaixo disso é clique)
type Canto = 'tl' | 'tr' | 'bl' | 'br'
type Pos = { right: number; bottom: number }

const NUMEROS = ['556596486736', '556596269997'] // +55 65 9648-6736 · +55 65 9626-9997
const MENSAGEM = 'Quero falar com suporte'
const CHAVE = 'suporte-wa-idx'

// Rotas de leitura em tela cheia: o botão atrapalharia a barra de ferramentas/grifo.
const ESCONDER = [
  /^\/aluno\/biblioteca\/[^/]+/, // leitor da Biblioteca
  /^\/aluno\/nova\/painel\/leitor/, // leitor do painel
  /^\/aluno\/leitura\/[^/]+/, // leitor da Lei Seca
  /^\/aluno\/leitura-rapida/,
]

function proximoNumero(): string {
  let i: number
  try {
    const salvo = localStorage.getItem(CHAVE)
    i = salvo === null ? Math.floor(Math.random() * NUMEROS.length) : (Number(salvo) || 0) % NUMEROS.length
    localStorage.setItem(CHAVE, String((i + 1) % NUMEROS.length))
  } catch {
    i = Math.floor(Math.random() * NUMEROS.length) // sem storage (aba anônima/bloqueado): sorteia
  }
  return NUMEROS[i]
}

export function SuporteWhatsApp() {
  const pathname = usePathname() || ''
  const btnRef = useRef<HTMLButtonElement>(null)
  const [canto, setCanto] = useState<Canto | null>(null) // null = posição padrão do CSS (canto inferior direito)
  const [livre, setLivre] = useState<Pos | null>(null) // posição enquanto arrasta
  const [encaixando, setEncaixando] = useState(false)
  const [tick, setTick] = useState(0) // força recálculo do canto ao redimensionar
  const drag = useRef<{ sx: number; sy: number; right: number; bottom: number; moved: boolean } | null>(null)
  const ignorarClique = useRef(false)

  // Coordenadas (right/bottom, em px) de um canto, respeitando margens, barra inferior do celular e topo.
  const coordsDoCanto = useCallback((c: Canto): Pos => {
    const el = btnRef.current
    const w = el?.offsetWidth ?? 56, h = el?.offsetHeight ?? 56
    const W = window.innerWidth, H = window.innerHeight
    const mx = W < 768 ? 16 : 20
    const mbBaixo = W < 768 ? 92 : 20 // no celular sobe acima da down bar
    const mbTopo = W < 768 ? 64 : 76 // abaixo do cabeçalho
    return {
      right: c === 'tr' || c === 'br' ? mx : Math.max(mx, W - w - mx),
      bottom: c === 'bl' || c === 'br' ? mbBaixo : Math.max(mbBaixo, H - h - mbTopo),
    }
  }, [])

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_CANTO)
      if (salvo === 'tl' || salvo === 'tr' || salvo === 'bl' || salvo === 'br') setCanto(salvo)
    } catch { /* sem storage: fica no canto padrão */ }
    const aoRedimensionar = () => setTick((t) => t + 1)
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [])

  if (ESCONDER.some((r) => r.test(pathname))) return null

  function iniciarArraste(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const r = e.currentTarget.getBoundingClientRect()
    drag.current = { sx: e.clientX, sy: e.clientY, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function mover(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < LIMIAR_ARRASTE) return
    d.moved = true
    setEncaixando(false)
    setLivre({ right: d.right - dx, bottom: d.bottom - dy })
  }
  function soltar(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d?.moved) return
    ignorarClique.current = true // o click que segue o arraste não abre o WhatsApp
    setTimeout(() => { ignorarClique.current = false }, 60) // soltou fora do botão: não deixa a flag presa
    // Canto mais próximo = quadrante onde o CENTRO do botão está.
    const r = e.currentTarget.getBoundingClientRect()
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const novo: Canto = (cy < window.innerHeight / 2 ? 't' : 'b') + (cx < window.innerWidth / 2 ? 'l' : 'r') as Canto
    // Anima do ponto onde soltou até o canto (o 'livre' atual vira o ponto de partida da transição).
    setEncaixando(true)
    setCanto(novo)
    setLivre(null)
    try { localStorage.setItem(CHAVE_CANTO, novo) } catch { /* ignora */ }
    setTimeout(() => setEncaixando(false), 450)
  }

  function abrir() {
    if (ignorarClique.current) { ignorarClique.current = false; return }
    const url = `https://wa.me/${proximoNumero()}?text=${encodeURIComponent(MENSAGEM)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <style>{`
        .sup-wa{position:fixed;right:20px;bottom:calc(env(safe-area-inset-bottom) + 20px);z-index:50;display:inline-flex;align-items:center;gap:10px;height:56px;padding:0 18px 0 14px;border:0;border-radius:999px;background:var(--pn-25d366,#25D366);color:#fff;font:inherit;font-size:14px;font-weight:700;box-shadow:0 10px 28px -8px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.04);cursor:pointer;transition:transform .2s,box-shadow .2s}
        .sup-wa:hover{transform:translateY(-2px);box-shadow:0 14px 32px -8px rgba(0,0,0,.4)}
        .sup-wa:active{transform:scale(.96)}
        .sup-wa{touch-action:none;-webkit-user-select:none;user-select:none}
        .sup-wa.arrastando{cursor:grabbing;transition:none;transform:scale(1.08);opacity:1;box-shadow:0 16px 36px -8px rgba(0,0,0,.45)}
        /* Puxada para o canto: mola suave (leve ultrapassagem) em right/bottom. */
        .sup-wa.encaixando{transition:right .42s cubic-bezier(.34,1.45,.5,1),bottom .42s cubic-bezier(.34,1.45,.5,1),transform .2s,box-shadow .2s}
        @media (prefers-reduced-motion:reduce){.sup-wa.encaixando{transition:none}}
        .sup-wa:focus-visible{outline:3px solid var(--pn-128c7e,#128C7E);outline-offset:3px}
        .sup-wa .sup-txt{white-space:nowrap}
        /* Tablet e telas baixas (celular deitado): só o ícone, menor e translúcido — cobre menos botões da página. */
        @media (max-width:1023px),(max-height:480px){
          .sup-wa{right:12px;width:46px;height:46px;padding:0;justify-content:center;opacity:.9}
          .sup-wa .sup-txt{display:none}
        }
        @media (max-height:480px){.sup-wa{bottom:calc(env(safe-area-inset-bottom) + 10px);right:calc(env(safe-area-inset-right) + 10px)}}
        @media (max-width:767px){
          .sup-wa{right:16px;bottom:calc(env(safe-area-inset-bottom) + 92px);width:48px;height:48px;padding:0;justify-content:center}
          .sup-wa .sup-txt{display:none}
        }
        @media print{.sup-wa{display:none}}
      `}</style>
      <button
        ref={btnRef}
        type="button"
        className={livre ? 'sup-wa arrastando' : encaixando ? 'sup-wa encaixando' : 'sup-wa'}
        data-tick={tick}
        style={livre ?? (canto ? coordsDoCanto(canto) : undefined)}
        onClick={abrir}
        onPointerDown={iniciarArraste}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        aria-label="Falar com o suporte no WhatsApp (arraste para mover de canto)"
        title="Falar com o suporte no WhatsApp — arraste para mudar de canto"
      >
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">
          <path d="M16.04 3C9.4 3 4 8.36 4 14.97c0 2.11.56 4.17 1.62 5.99L4 29l8.27-2.15a12.1 12.1 0 0 0 3.77.6h.01c6.63 0 12.03-5.36 12.03-11.97C28.08 8.36 22.68 3 16.04 3Zm0 21.9h-.01a10 10 0 0 1-5.08-1.38l-.36-.21-4.91 1.28 1.31-4.77-.24-.38a9.86 9.86 0 0 1-1.52-5.27c0-5.5 4.5-9.97 10.04-9.97 2.68 0 5.2 1.04 7.1 2.93a9.86 9.86 0 0 1 2.94 7.05c0 5.5-4.5 9.97-10.03 9.97Zm5.5-7.46c-.3-.15-1.78-.87-2.06-.97-.28-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.27-.46-2.42-1.48a9.02 9.02 0 0 1-1.67-2.07c-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.25-.58-.5-.5-.68-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.11 3.2 5.12 4.49.71.31 1.27.5 1.7.63.72.23 1.37.2 1.89.12.58-.09 1.78-.72 2.03-1.42.25-.7.25-1.3.18-1.42-.08-.13-.28-.2-.58-.35Z" />
        </svg>
        <span className="sup-txt">Suporte</span>
      </button>
    </>
  )
}
