'use client'

// Card de pasta + menu de contexto PORTADO do protótipo "card-pasta-drive.html" (estilo Google Drive):
// mesmo CSS/animações (ripple, cascata de abertura, submenus com intenção de hover, renomear inline,
// paleta de cor), com classes/vars prefixadas `gd-`/`--gd-` para não colidir com o tema do app.
// Os itens do menu são ligados às AÇÕES REAIS da Biblioteca.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type PastaMover = { id: string; nome: string; pai_id: string | null }

// Permite custom properties (--i/--j/--k p/ a cascata) no style sem o CSSProperties reclamar.
const sv = (o: Record<string, string | number>): CSSProperties => o as CSSProperties

// CSS portado do protótipo (classes/vars prefixadas gd-/--gd-). Renderize UMA vez na página.
export function DrivePastaStyles() {
  return (
    <style>{`
  .gd-folder-card,.gd-menu,.gd-submenu{
    --gd-card-bg:#f0f4f9;--gd-card-hover:#e6ebf2;--gd-text:#1f1f1f;--gd-text-2:#444746;--gd-text-3:#5f6368;
    --gd-menu-bg:#fff;--gd-menu-hover:#eef1f6;--gd-accent:var(--brand-primary,var(--primary));--gd-divider:#e8eaed;--gd-folder:#444746;
    --gd-shadow-menu:0 1px 2px rgba(60,64,67,.25),0 6px 18px 4px rgba(60,64,67,.14),0 18px 40px -8px rgba(60,64,67,.18);
    --gd-shadow-card:0 1px 2px rgba(60,64,67,.12),0 4px 12px rgba(60,64,67,.10);
    --gd-ease:cubic-bezier(.2,0,0,1);--gd-ease-out:cubic-bezier(.05,.7,.1,1);--gd-spring:cubic-bezier(.34,1.56,.64,1);
  }
  .dark .gd-folder-card,.dark .gd-menu,.dark .gd-submenu{
    --gd-card-bg:#2a2b2f;--gd-card-hover:#34353a;--gd-text:#e8eaed;--gd-text-2:#c4c7c5;--gd-text-3:#9aa0a6;
    --gd-menu-bg:#2d2e31;--gd-menu-hover:#3b3d42;--gd-divider:#3c4043;--gd-folder:#c4c7c5}
  .dark .gd-kebab:hover{background:rgba(255,255,255,.1)}
  .dark .gd-kebab.gd-active{background:rgba(255,255,255,.14)}
  .dark .gd-item.gd-danger:hover{background:rgba(242,139,130,.14);color:#f28b82}
  .dark .gd-item.gd-danger:hover>svg:first-child{fill:#f28b82}

  .gd-folder-card{position:relative;isolation:isolate;overflow:hidden;display:flex;align-items:center;gap:14px;height:52px;
    padding:0 6px 0 16px;border-radius:14px;background:var(--gd-card-bg);cursor:pointer;user-select:none;outline:none;
    transition:background .25s var(--gd-ease),box-shadow .3s var(--gd-ease),transform .3s var(--gd-ease);
    animation:gdCardIn .5s var(--gd-ease-out) both}
  @keyframes gdCardIn{from{opacity:0;transform:translateY(10px) scale(.98)}}
  .gd-folder-card:hover{background:var(--gd-card-hover);box-shadow:var(--gd-shadow-card);transform:translateY(-1px)}
  .gd-folder-card:active{transform:translateY(0) scale(.99)}
  .gd-folder-card.gd-active{background:var(--gd-card-hover)}
  .gd-folder-card:focus-visible{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--gd-accent)}

  .gd-ico-wrap{position:relative;width:24px;height:24px;flex-shrink:0}
  .gd-ico{width:24px;height:24px;fill:var(--gd-folder);transition:fill .45s var(--gd-ease),transform .35s var(--gd-spring);display:block}
  .gd-ico .gd-flap{transform-origin:2px 8px;transition:transform .35s var(--gd-spring)}
  .gd-folder-card:hover .gd-ico{transform:scale(1.08)}
  .gd-folder-card:hover .gd-ico .gd-flap{transform:skewX(-8deg) scaleY(.92)}
  .gd-ico.gd-pulse{animation:gdIcoPulse .55s var(--gd-spring)}
  @keyframes gdIcoPulse{0%{transform:scale(1)}40%{transform:scale(1.28) rotate(-6deg)}100%{transform:scale(1)}}

  .gd-name{flex:1;font-size:14px;font-weight:500;letter-spacing:.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gd-rename{flex:1;min-width:0;font:inherit;font-size:14px;font-weight:500;color:var(--gd-text);background:#fff;
    border:2px solid var(--gd-accent);border-radius:8px;padding:5px 8px;outline:none;box-shadow:0 0 0 4px color-mix(in oklab,var(--brand-primary,var(--primary)) 14%,transparent)}

  .gd-kebab{position:relative;overflow:hidden;width:40px;height:40px;border:none;background:transparent;border-radius:50%;
    display:grid;place-items:center;cursor:pointer;flex-shrink:0;transition:background .2s var(--gd-ease)}
  .gd-kebab:hover{background:rgba(31,31,31,.08)}
  .gd-kebab.gd-active{background:rgba(31,31,31,.12)}
  .gd-kebab svg{width:20px;height:20px;fill:var(--gd-text-2);transition:transform .35s var(--gd-spring)}
  .gd-kebab.gd-active svg{transform:rotate(90deg)}

  .gd-ripple{position:absolute;border-radius:50%;pointer-events:none;background:currentColor;opacity:.14;transform:scale(0);
    animation:gdRipple .6s var(--gd-ease-out) forwards;z-index:0;color:#1f1f1f}
  @keyframes gdRipple{to{transform:scale(1);opacity:0}}

  .gd-menu{position:fixed;z-index:1000;min-width:292px;padding:8px;border-radius:14px;background:var(--gd-menu-bg);
    box-shadow:var(--gd-shadow-menu);font-size:14px;transform-origin:top left;
    opacity:0;visibility:hidden;transform:scale(.88) translateY(-6px);
    transition:opacity .18s var(--gd-ease),transform .22s var(--gd-ease),visibility 0s .22s}
  .gd-menu.gd-open{opacity:1;visibility:visible;transform:none;
    transition:opacity .2s var(--gd-ease),transform .38s var(--gd-ease-out),visibility 0s}
  .gd-menu>.gd-item,.gd-menu>.gd-divider{opacity:0;transform:translateX(-8px)}
  .gd-menu.gd-open>.gd-item,.gd-menu.gd-open>.gd-divider{opacity:1;transform:none;
    transition:opacity .3s var(--gd-ease) calc(var(--i)*22ms + 40ms),transform .4s var(--gd-ease-out) calc(var(--i)*22ms + 40ms)}

  .gd-item{position:relative;overflow:hidden;isolation:isolate;display:flex;align-items:center;gap:14px;height:36px;
    padding:0 10px 0 12px;border-radius:8px;cursor:pointer;color:var(--gd-text);white-space:nowrap;transition:background .15s var(--gd-ease)}
  .gd-item:hover,.gd-item.gd-active{background:var(--gd-menu-hover)}
  .gd-item>svg:first-child{width:20px;height:20px;fill:var(--gd-text-2);flex-shrink:0;transition:transform .3s var(--gd-spring),fill .2s}
  .gd-item:hover>svg:first-child{transform:scale(1.12);fill:var(--gd-text)}
  .gd-label{flex:1;overflow:hidden;text-overflow:ellipsis}
  .gd-truncate{white-space:nowrap}
  .gd-chev{width:18px;height:18px;fill:var(--gd-text-3);transition:transform .3s var(--gd-spring)}
  .gd-item.gd-has-sub:hover>.gd-chev,.gd-item.gd-has-sub.gd-active>.gd-chev{transform:translateX(3px)}
  .gd-item.gd-danger:hover{background:#fce8e6;color:#b3261e}
  .gd-item.gd-danger:hover>svg:first-child{fill:#b3261e;animation:gdShake .45s var(--gd-ease)}
  @keyframes gdShake{25%{transform:rotate(-12deg) scale(1.1)}50%{transform:rotate(10deg) scale(1.1)}75%{transform:rotate(-6deg) scale(1.1)}}
  .gd-divider{height:1px;background:var(--gd-divider);margin:6px 4px}
  .gd-item.gd-has-sub{overflow:visible}
  .gd-empty{padding:6px 12px;color:var(--gd-text-3);font-size:12px}

  .gd-submenu{position:absolute;top:-8px;left:100%;margin-left:6px;min-width:232px;padding:8px;border-radius:14px;
    background:var(--gd-menu-bg);box-shadow:var(--gd-shadow-menu);cursor:default;
    opacity:0;visibility:hidden;transform:translateX(-10px) scale(.96);transform-origin:left top;
    transition:opacity .15s var(--gd-ease),transform .2s var(--gd-ease),visibility 0s .2s}
  .gd-submenu-scroll{max-height:300px;overflow-y:auto}
  .gd-submenu::before{content:"";position:absolute;top:0;bottom:0;left:-10px;width:10px}
  .gd-submenu.gd-flip{left:auto;right:100%;margin-left:0;margin-right:6px;transform-origin:right top;transform:translateX(10px) scale(.96)}
  .gd-submenu.gd-flip::before{left:auto;right:-10px}
  .gd-item.gd-has-sub.gd-active>.gd-submenu{opacity:1;visibility:visible;transform:none;
    transition:opacity .2s var(--gd-ease),transform .35s var(--gd-ease-out),visibility 0s}
  .gd-submenu .gd-item{opacity:0;transform:translateX(-6px)}
  .gd-item.gd-has-sub.gd-active>.gd-submenu .gd-item{opacity:1;transform:none;
    transition:background .15s,opacity .25s var(--gd-ease) calc(var(--j)*35ms + 60ms),transform .35s var(--gd-ease-out) calc(var(--j)*35ms + 60ms)}

  .gd-colors-title{padding:6px 8px 8px;color:var(--gd-text-3);font-size:12px;font-weight:500;letter-spacing:.3px;text-transform:uppercase}
  .gd-colors{display:grid;grid-template-columns:repeat(5,30px);gap:10px;padding:2px 8px 8px}
  .gd-colors button{width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;position:relative;opacity:0;transform:scale(.4);
    transition:transform .25s var(--gd-spring)}
  .gd-item.gd-has-sub.gd-active .gd-colors button{opacity:1;transform:scale(1);
    transition:opacity .2s calc(var(--k)*14ms + 80ms),transform .4s var(--gd-spring) calc(var(--k)*14ms + 80ms)}
  .gd-item.gd-has-sub.gd-active .gd-colors button:hover{transform:scale(1.18);transition-delay:0s}
  .gd-colors button::after{content:"";position:absolute;inset:-4px;border:2px solid var(--gd-accent);border-radius:50%;transform:scale(.6);opacity:0;transition:.3s var(--gd-spring)}
  .gd-colors button.gd-sel::after{transform:scale(1);opacity:1}
  .gd-colors button svg{position:absolute;inset:7px;width:16px;height:16px;fill:#fff;opacity:0;transform:scale(.4);transition:.3s var(--gd-spring)}
  .gd-colors button.gd-sel svg{opacity:1;transform:scale(1)}

  @media (prefers-reduced-motion:reduce){.gd-folder-card,.gd-menu,.gd-submenu,.gd-item,.gd-colors button,.gd-ico,.gd-ripple,.gd-kebab svg{animation-duration:.01ms!important;transition-duration:.01ms!important;transition-delay:0s!important}}
    `}</style>
  )
}

// Paleta do protótipo (cor da pasta).
const PALETTE = ['#444746', '#ac725e', '#d06b64', '#f83a22', '#fa573c', '#ff7537', '#ffad46', '#fad165', '#fbe983', '#b3dc6c',
  '#7bd148', '#16a765', '#42d692', '#92e1c0', '#9fe1e7', '#9fc6e7', '#4986e7', '#9a9cff', '#b99aff', '#a47ae2',
  '#cd74e6', '#f691b2', '#cca6ac', '#cabdbf', '#c2c2c2']

type Sub = null | 'compartilhar' | 'organizar' | 'informacoes' | 'cor'

export function PastaCardDrive({
  id, nome, cor, categoria,
  onAbrir, onAcesso, onRenomear, onMudarCor, onMover, onExcluir, carregarPastas,
  onCopiarLink, onToast,
}: {
  id: string; nome: string; cor: string | null; categoria: string
  onAbrir: () => void
  onAcesso: () => void
  onRenomear: (novoNome: string) => void
  onMudarCor: (cor: string | null) => void
  onMover: (destinoId: string | null) => void
  onExcluir: () => void
  carregarPastas: () => Promise<PastaMover[]>
  onCopiarLink?: () => void
  onToast?: (msg: string) => void
}) {
  const kebabRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [coords, setCoords] = useState<{ left: number; top: number; origin: string; flip: boolean }>({ left: 0, top: 0, origin: 'top left', flip: false })
  const [sub, setSub] = useState<Sub>(null)
  const [subMover, setSubMover] = useState(false) // submenu aninhado "Mover para…" dentro de Organizar
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pastas, setPastas] = useState<PastaMover[] | null>(null)
  const [renaming, setRenaming] = useState(false)

  const ripple = useCallback((el: HTMLElement, e?: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2
    const x = (e?.clientX ?? r.left + r.width / 2) - r.left - s / 2
    const y = (e?.clientY ?? r.top + r.height / 2) - r.top - s / 2
    const span = document.createElement('span')
    span.className = 'gd-ripple'
    Object.assign(span.style, { width: s + 'px', height: s + 'px', left: x + 'px', top: y + 'px' })
    el.appendChild(span); setTimeout(() => span.remove(), 650)
  }, [])

  const closeMenu = useCallback(() => { setOpen(false); setShown(false); setSub(null); setSubMover(false); if (subTimer.current) clearTimeout(subTimer.current) }, [])

  function abrirMenu(e: React.MouseEvent) {
    e.stopPropagation()
    if (kebabRef.current) ripple(kebabRef.current, e)
    if (open) { closeMenu(); return }
    setSub(null); setOpen(true)
  }

  // Posiciona o menu abaixo do botão (flip se faltar espaço) e dispara a animação de abertura.
  useLayoutEffect(() => {
    if (!open) return
    const kb = kebabRef.current?.getBoundingClientRect()
    const el = menuRef.current
    if (!kb || !el) return
    const w = el.offsetWidth, h = el.offsetHeight
    let left = kb.left, top = kb.bottom + 4, ox = 'left', oy = 'top'
    if (left + w > window.innerWidth - 8) { left = Math.max(8, kb.right - w); ox = 'right' }
    if (top + h > window.innerHeight - 8) { top = Math.max(8, kb.top - h - 4); oy = 'bottom' }
    const flip = left + w + 250 > window.innerWidth
    setCoords({ left, top, origin: `${oy} ${ox}`, flip })
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [open])

  // Fecha ao clicar fora / Esc / scroll / resize.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node) && kebabRef.current && !kebabRef.current.contains(e.target as Node)) closeMenu() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu() }
    const onMove = () => closeMenu()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove) }
  }, [open, closeMenu])

  // Intenção de hover nos itens com submenu (evita abrir/fechar na diagonal).
  function hoverItem(alvo: Sub) {
    if (subTimer.current) clearTimeout(subTimer.current)
    subTimer.current = setTimeout(() => { setSub(alvo); setSubMover(false) }, alvo ? 90 : 160)
  }
  // Submenu aninhado "Mover para…" (dentro de Organizar) — carrega as pastas ao abrir.
  function hoverMover(on: boolean) {
    if (subTimer.current) clearTimeout(subTimer.current)
    subTimer.current = setTimeout(() => { setSubMover(on); if (on && !pastas) carregarPastas().then(setPastas).catch(() => setPastas([])) }, 90)
  }

  // Pastas bloqueadas no "Mover" (a própria + descendentes).
  const bloqueadas = useMemo(() => {
    const set = new Set<string>([id])
    const filhos = new Map<string | null, string[]>()
    for (const x of pastas ?? []) { const k = x.pai_id ?? null; (filhos.get(k) ?? filhos.set(k, []).get(k)!).push(x.id) }
    const stack = [id]
    while (stack.length) { const cur = stack.pop()!; for (const f of filhos.get(cur) ?? []) if (!set.has(f)) { set.add(f); stack.push(f) } }
    return set
  }, [pastas, id])
  const prof = (pid: string | null): number => { let n = 0, cur = pid; const by = new Map((pastas ?? []).map((x) => [x.id, x])); while (cur && by.get(cur)) { n++; cur = by.get(cur)!.pai_id } return n }

  const act = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); const t = e.currentTarget as HTMLElement; ripple(t, e); setTimeout(() => { closeMenu(); fn() }, 140) }

  // Renomear inline.
  function startRename() { closeMenu(); setRenaming(true) }
  function commitRename(v: string, salvar: boolean) {
    setRenaming(false)
    const novo = v.trim()
    if (salvar && novo && novo !== nome) onRenomear(novo)
  }

  const iconeFill = cor || 'var(--gd-folder)'

  return (
    <div
      className={`gd-folder-card${open ? ' gd-active' : ''}`}
      tabIndex={0}
      onClick={() => { if (!renaming) onAbrir() }}
      onKeyDown={(e) => { if (renaming) return; if (e.key === 'Enter') onAbrir() }}
    >
      <span className="gd-ico-wrap">
        <svg className="gd-ico" viewBox="0 0 24 24" style={{ fill: iconeFill }}>
          <path d="M10 4H4c-1.1 0-2 .9-2 2v2h20c0-1.1-.9-2-2-2h-8l-2-2z" />
          <path className="gd-flap" d="M2 8v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8H2z" />
        </svg>
      </span>

      {renaming ? (
        <input
          className="gd-rename"
          defaultValue={nome}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitRename((e.target as HTMLInputElement).value, true); if (e.key === 'Escape') commitRename('', false) }}
          onBlur={(e) => commitRename(e.target.value, true)}
        />
      ) : (
        <span className="gd-name" ref={nameRef} title={nome}>{nome}</span>
      )}

      <button ref={kebabRef} className={`gd-kebab${open ? ' gd-active' : ''}`} aria-label="Mais ações" aria-haspopup="menu" onClick={abrirMenu}>
        <svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className={`gd-menu${shown ? ' gd-open' : ''}`}
          style={{ left: coords.left, top: coords.top, transformOrigin: coords.origin }}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => { if (subTimer.current) clearTimeout(subTimer.current) }}
        >
          {/* Abrir */}
          <div className="gd-item" style={sv({ '--i': 0 })} onMouseEnter={() => hoverItem(null)} onClick={act(onAbrir)}>
            <svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" /></svg>
            <span className="gd-label">Abrir</span>
          </div>
          <div className="gd-divider" style={sv({ '--i': 1 })} />
          {/* Fazer download */}
          <div className="gd-item" style={sv({ '--i': 2 })} onMouseEnter={() => hoverItem(null)} onClick={act(() => onToast?.('Download da pasta: em breve'))}>
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
            <span className="gd-label">Fazer download</span>
          </div>
          {/* Renomear */}
          <div className="gd-item" style={sv({ '--i': 3 })} onMouseEnter={() => hoverItem(null)} onClick={(e) => { e.stopPropagation(); const t = e.currentTarget as HTMLElement; ripple(t, e); setTimeout(startRename, 140) }}>
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
            <span className="gd-label">Renomear</span>
          </div>
          <div className="gd-divider" style={sv({ '--i': 4 })} />
          {/* Compartilhar (submenu: Liberar acesso + Copiar link) */}
          <div className={`gd-item gd-has-sub${sub === 'compartilhar' ? ' gd-active' : ''}`} style={sv({ '--i': 5 })} onMouseEnter={() => hoverItem('compartilhar')}>
            <svg viewBox="0 0 24 24"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
            <span className="gd-label">Compartilhar</span>
            <svg className="gd-chev" viewBox="0 0 24 24"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
            <div className={`gd-submenu${coords.flip ? ' gd-flip' : ''}`}>
              <div className="gd-item" style={sv({ '--j': 0 })} onClick={act(onAcesso)}>
                <svg viewBox="0 0 24 24"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z" /></svg>
                <span className="gd-label">Liberar acesso</span>
              </div>
              <div className="gd-item" style={sv({ '--j': 1 })} onClick={act(() => { if (onCopiarLink) onCopiarLink(); else navigator.clipboard?.writeText(window.location.href).catch(() => {}) })}>
                <svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" /></svg>
                <span className="gd-label">Copiar link</span>
              </div>
            </div>
          </div>

          {/* Organizar (submenu: Mover para… [aninhado] + Adicionar atalho + Com estrela) */}
          <div className={`gd-item gd-has-sub${sub === 'organizar' ? ' gd-active' : ''}`} style={sv({ '--i': 6 })} onMouseEnter={() => hoverItem('organizar')}>
            <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 12v-3h-4v-4h4V8l5 5-5 5z" /></svg>
            <span className="gd-label">Organizar</span>
            <svg className="gd-chev" viewBox="0 0 24 24"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
            <div className={`gd-submenu${coords.flip ? ' gd-flip' : ''}`}>
              <div className={`gd-item gd-has-sub${subMover ? ' gd-active' : ''}`} style={sv({ '--j': 0 })} onMouseEnter={() => hoverMover(true)}>
                <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 12v-3h-4v-4h4V8l5 5-5 5z" /></svg>
                <span className="gd-label">Mover para…</span>
                <svg className="gd-chev" viewBox="0 0 24 24"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                <div className={`gd-submenu${coords.flip ? ' gd-flip' : ''} gd-submenu-scroll`}>
                  <div className="gd-item" style={sv({ '--j': 0 })} onClick={act(() => onMover(null))}>
                    <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
                    <span className="gd-label">Raiz (Início)</span>
                  </div>
                  {pastas === null ? (
                    <div className="gd-empty">Carregando…</div>
                  ) : (
                    pastas.filter((x) => !bloqueadas.has(x.id)).map((x, j) => (
                      <div key={x.id} className="gd-item" style={sv({ '--j': j + 1, paddingLeft: 12 + prof(x.pai_id) * 12 })} onClick={act(() => onMover(x.id))}>
                        <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
                        <span className="gd-label gd-truncate">{x.nome}</span>
                      </div>
                    ))
                  )}
                  {pastas && pastas.filter((x) => !bloqueadas.has(x.id)).length === 0 && <div className="gd-empty">Sem outra pasta.</div>}
                </div>
              </div>
              <div className="gd-item" style={sv({ '--j': 1 })} onMouseEnter={() => setSubMover(false)} onClick={act(() => onToast?.('Adicionar atalho: em breve'))}>
                <svg viewBox="0 0 24 24"><path d="M21 11 14 4v4C7 9 4 14 3 19c2.5-3.5 6-5.1 11-5.1V18l7-7z" /></svg>
                <span className="gd-label">Adicionar atalho</span>
              </div>
              <div className="gd-item" style={sv({ '--j': 2 })} onMouseEnter={() => setSubMover(false)} onClick={act(() => onToast?.('Com estrela: em breve'))}>
                <svg viewBox="0 0 24 24"><path d="m22 9.24-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24z" /></svg>
                <span className="gd-label">Com estrela</span>
              </div>
            </div>
          </div>

          {/* Informações da pasta (submenu: Detalhes + Atividade) */}
          <div className={`gd-item gd-has-sub${sub === 'informacoes' ? ' gd-active' : ''}`} style={sv({ '--i': 7 })} onMouseEnter={() => hoverItem('informacoes')}>
            <svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" /></svg>
            <span className="gd-label">Informações da pasta</span>
            <svg className="gd-chev" viewBox="0 0 24 24"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
            <div className={`gd-submenu${coords.flip ? ' gd-flip' : ''}`}>
              <div className="gd-item" style={sv({ '--j': 0 })} onClick={act(() => onToast?.('Detalhes: em breve'))}>
                <svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" /></svg>
                <span className="gd-label">Detalhes</span>
              </div>
              <div className="gd-item" style={sv({ '--j': 1 })} onClick={act(() => onToast?.('Atividade: em breve'))}>
                <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" /></svg>
                <span className="gd-label">Atividade</span>
              </div>
            </div>
          </div>

          {/* Mudar cor (submenu com paleta) */}
          <div className={`gd-item gd-has-sub${sub === 'cor' ? ' gd-active' : ''}`} style={sv({ '--i': 8 })} onMouseEnter={() => hoverItem('cor')}>
            <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" /></svg>
            <span className="gd-label">Mudar cor</span>
            <svg className="gd-chev" viewBox="0 0 24 24"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
            <div className={`gd-submenu${coords.flip ? ' gd-flip' : ''}`}>
              <div className="gd-colors-title">Cor da pasta</div>
              <div className="gd-colors">
                {PALETTE.map((c, k) => (
                  <button
                    key={c}
                    className={(cor || PALETTE[0]) === c ? 'gd-sel' : ''}
                    style={sv({ background: c, '--k': k })}
                    title={c}
                    onClick={(e) => { e.stopPropagation(); setTimeout(() => { closeMenu(); onMudarCor(c) }, 160) }}
                  >
                    <svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="gd-divider" style={sv({ '--i': 9 })} />
          <div className="gd-item gd-danger" style={sv({ '--i': 10 })} onMouseEnter={() => hoverItem(null)} onClick={act(onExcluir)}>
            <svg viewBox="0 0 24 24"><path d="M15 4V3H9v1H4v2h1v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6h1V4h-5zm2 15H7V6h10v13zM9 8h2v9H9zm4 0h2v9h-2z" /></svg>
            <span className="gd-label">Mover para a lixeira</span>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
