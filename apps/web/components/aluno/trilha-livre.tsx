'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { SimboloNo } from '@/components/gamificacao/simbolo-no'
import { coresNo, type TrilhaSimbolos, type SimboloEstado } from '@/lib/gamificacao/trilha-simbolos'
import type { TrilhaLivreConfig, PosXY, TrilhaDegrade } from '@/lib/leitura/trilha-aparencia'

export type NoLivre = {
  id: string; titulo: string; estado: SimboloEstado; href?: string | null; acao?: string
  // Dados ricos p/ o balão (2 passos LegProc: Leitura + Questões do conteúdo).
  quando?: string | null
  questoes?: number
  acerto?: number | null
  hrefLeitura?: string | null
  acaoLeitura?: string
  hrefQuestoes?: string | null
  questoesLiberada?: boolean
  naoLiberada?: boolean
}

const clampPct = (n: number) => Math.max(0, Math.min(100, n))

/** Ancestral rolável (overflow-y auto/scroll) — no aluno é o <main> do portal; senão a janela. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement
  while (p) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p; p = p.parentElement }
  return null
}
/** Rola DEVAGAR (ease-in-out) até centralizar o elemento no container rolável. */
function scrollSuaveAte(el: HTMLElement, ms = 1600) {
  const sp = scrollParent(el)
  const startTop = sp ? sp.scrollTop : window.scrollY
  const er = el.getBoundingClientRect()
  const vh = sp ? sp.clientHeight : window.innerHeight
  const spTop = sp ? sp.getBoundingClientRect().top : 0
  const alvo = startTop + (er.top - spTop) - (vh / 2 - er.height / 2)
  const dist = alvo - startTop
  if (Math.abs(dist) < 8) return
  const t0 = performance.now()
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms)
    const y = startTop + dist * ease(p)
    if (sp) sp.scrollTop = y; else window.scrollTo(0, y)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** Posição padrão (serpentina) quando o nó ainda não foi posicionado à mão. */
export function defaultPos(i: number, total: number): PosXY {
  const cols = total <= 4 ? 2 : 3
  const rows = Math.max(1, Math.ceil(total / cols))
  const row = Math.floor(i / cols)
  const inRow = i % cols
  const col = row % 2 === 0 ? inRow : cols - 1 - inRow
  return { x: clampPct(((col + 0.5) / cols) * 100), y: clampPct(rows === 1 ? 50 : 8 + (row / (rows - 1)) * 84) }
}

/**
 * Trilha PERSONALIZADA (formato 'livre'): nós posicionados em % sobre a imagem de fundo + curvas bézier
 * com ponto de controle por trecho. `editavel` liga o arraste (nós e pontos de curva) → onChange.
 */
export function TrilhaLivre({ nodes, livre, capa, simbolos, editavel = false, onChange, full = false, ocultarFundo = false, semMoldura = false, degradeTopo }: {
  nodes: NoLivre[]
  livre: TrilhaLivreConfig
  capa?: string | null
  simbolos: TrilhaSimbolos
  editavel?: boolean
  onChange?: (livre: TrilhaLivreConfig) => void
  /** Preenche toda a altura do contêiner (usado no construtor em tela cheia) em vez do aspect-4/5. */
  full?: boolean
  /** Esconde a imagem de fundo (auxílio de edição no construtor). */
  ocultarFundo?: boolean
  /** Sem moldura (borda/cantos/fundo do card) — para preencher toda a área (aluno). */
  semMoldura?: boolean
  /** Degradê no TOPO da imagem que "liga" a trilha ao banner (liga/desliga + intensidade). */
  degradeTopo?: TrilhaDegrade
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [aberto, setAberto] = useState<string | null>(null)
  const dragRef = useRef<{ tipo: 'no' | 'curva'; id: string } | null>(null)

  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const calc = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    calc()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null
    ro?.observe(el); return () => ro?.disconnect()
  }, [])

  const posDe = (i: number): PosXY => livre.nos[nodes[i].id] ?? defaultPos(i, nodes.length)
  const ctrlDe = (i: number): PosXY => {
    const a = posDe(i), b = posDe(i + 1)
    return livre.curvas[nodes[i].id] ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  useEffect(() => {
    if (!editavel) return
    const el = wrapRef.current; if (!el) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return
      const r = el.getBoundingClientRect()
      const x = clampPct(((e.clientX - r.left) / r.width) * 100)
      const y = clampPct(((e.clientY - r.top) / r.height) * 100)
      // Preserva o resto da config (fundo, aspecto, escala) — senão arrastar "reseta" o fundo.
      const next: TrilhaLivreConfig = { ...livre, nos: { ...livre.nos }, curvas: { ...livre.curvas } }
      if (d.tipo === 'no') next.nos[d.id] = { x, y }
      else next.curvas[d.id] = { x, y }
      onChange?.(next)
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [editavel, livre, onChange])

  const px = (p: PosXY) => ({ x: (p.x / 100) * size.w, y: (p.y / 100) * size.h })

  // Tamanho dos nós PROPORCIONAL ao canvas (≈9% da largura) × escala do admin → não fica gigante numa
  // imagem pequena nem minúsculo numa grande. Tudo (borda, curva, ponto de controle, rótulo) acompanha.
  const escala = livre.escala ?? 1
  const ref = size.w > 0 ? size.w : 400
  const nodeSize = Math.round(Math.min(ref * 0.5, Math.max(20, ref * 0.09 * escala)))
  const iconEscala = nodeSize / 56
  const borda = Math.max(2, Math.round(nodeSize * 0.08))
  const stroke = Math.max(2, nodeSize * 0.1)
  const ctrlSize = Math.max(9, Math.round(nodeSize * 0.28))
  const labelFs = Math.max(9, Math.round(nodeSize * 0.2))

  // Balão do dia: mede a altura real + máquina de abrir/fechar (mantém montado no fechamento p/ animar a saída).
  const balaoRef = useRef<HTMLDivElement>(null)
  const [balaoH, setBalaoH] = useState(150)
  const [balaoAberto, setBalaoAberto] = useState<string | null>(null)
  const [balaoVis, setBalaoVis] = useState(false)
  useEffect(() => {
    // Fechar (clicou fora / no mesmo nó).
    if (!aberto) {
      setBalaoVis(false)
      const t = setTimeout(() => setBalaoAberto(null), 240)
      return () => clearTimeout(t)
    }
    // Trocar de dia com um balão já aberto → FECHA o atual e só então abre o novo.
    if (balaoAberto && balaoAberto !== aberto) {
      setBalaoVis(false)
      const t = setTimeout(() => { setBalaoAberto(aberto); requestAnimationFrame(() => requestAnimationFrame(() => setBalaoVis(true))) }, 230)
      return () => clearTimeout(t)
    }
    // Abrir do zero.
    setBalaoAberto(aberto)
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setBalaoVis(true)))
    return () => cancelAnimationFrame(r)
  }, [aberto])
  const abertoIdx = balaoAberto ? nodes.findIndex((n) => n.id === balaoAberto) : -1
  const abertoNode = abertoIdx >= 0 ? nodes[abertoIdx] : null
  useEffect(() => { if (abertoNode && balaoRef.current) setBalaoH(balaoRef.current.offsetHeight) }, [balaoAberto, size.w])
  // Clicar FORA do balão (e fora de um nó) fecha — mantendo a animação de saída (zera `aberto`).
  useEffect(() => {
    if (!aberto || editavel) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (balaoRef.current?.contains(t)) return
      if (t.closest('[data-trilha-no]')) return // clique em nó → deixa o onClick alternar
      setAberto(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [aberto, editavel])

  // Rolagem automática (devagar) até o nó ATUAL (ponto de progressão dos dias) ao abrir a trilha.
  // Se todos concluídos, vai ao último. Só no aluno (não no construtor).
  const alvoRef = useRef<HTMLDivElement>(null)
  const alvoIdx = (() => { const i = nodes.findIndex((n) => n.estado === 'atual'); return i >= 0 ? i : nodes.length - 1 })()
  useEffect(() => {
    if (editavel || size.w === 0) return
    const el = alvoRef.current; if (!el) return
    const t = setTimeout(() => scrollSuaveAte(el), 550)
    return () => clearTimeout(t)
  }, [editavel, alvoIdx, size.w])

  return (
    <div ref={wrapRef} className={cn('relative w-full overflow-hidden', semMoldura ? 'bg-transparent' : 'border bg-muted/30', full || semMoldura ? 'rounded-none' : 'rounded-2xl', full && 'h-full')} style={{ aspectRatio: full ? undefined : (livre.aspecto ?? 0.8), touchAction: editavel ? 'none' : undefined }}>
      {(() => {
        if (ocultarFundo) return null
        const f = livre.fundo
        const url = f?.url ?? capa ?? null
        if (!url) return null
        const desfoque = f?.desfoque ?? 0
        const opacity = (f?.opacidade ?? 100) / 100
        const filter = desfoque > 0 ? `blur(${desfoque}px)` : undefined
        const blurScale = desfoque > 0 ? 1.06 : 1
        const crop = f?.crop
        // Recorte via CSS background (sem rasterizar/CORS): mostra EXATAMENTE o retângulo escolhido.
        if (crop && crop.w > 0 && crop.h > 0) {
          const sizeW = 100 / crop.w, sizeH = 100 / crop.h
          const posBgX = crop.w < 1 ? (crop.x / (1 - crop.w)) * 100 : 0
          const posBgY = crop.h < 1 ? (crop.y / (1 - crop.h)) * 100 : 0
          return <div className="absolute inset-0" style={{ backgroundImage: `url("${url}")`, backgroundSize: `${sizeW}% ${sizeH}%`, backgroundPosition: `${posBgX}% ${posBgY}%`, backgroundRepeat: 'no-repeat', opacity, filter, transform: blurScale !== 1 ? `scale(${blurScale})` : undefined }} />
        }
        const posX = f?.posX ?? 50, posY = f?.posY ?? 50
        const zoom = Math.max(1, f?.zoom ?? 1) + (desfoque > 0 ? 0.06 : 0)
        return <img src={url} alt="" loading="eager" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full"
          style={{ objectFit: f?.ajuste ?? 'cover', objectPosition: `${posX}% ${posY}%`, opacity, filter, transform: `scale(${zoom})`, transformOrigin: `${posX}% ${posY}%` }} />
      })()}
      {/* Scrim BEM sutil (só um leve vinheta topo/base) — os rótulos já têm fundo próprio, então a imagem
          fica nítida. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/20" />
      {/* Degradê do TOPO da imagem → "liga" a trilha ao banner (some ao descer). */}
      {!ocultarFundo && degradeTopo?.ativo && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3" style={{ background: 'linear-gradient(to bottom, #000 0%, transparent 100%)', opacity: Math.min(1, degradeTopo.intensidade / 100) }} />
      )}

      {size.w > 0 && (
        <svg className="absolute inset-0" width={size.w} height={size.h} aria-hidden>
          {nodes.slice(0, -1).map((n, i) => {
            const a = px(posDe(i)), b = px(posDe(i + 1)), c = px(ctrlDe(i))
            return <path key={n.id} d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`} fill="none" stroke={n.estado === 'concluido' ? 'var(--primary)' : '#ffffffcc'} strokeWidth={stroke} strokeDasharray={`${(stroke * 0.4).toFixed(1)} ${(stroke * 2.4).toFixed(1)}`} strokeLinecap="round" />
          })}
        </svg>
      )}

      {/* Pontos de controle da curva (só na edição) */}
      {editavel && nodes.slice(0, -1).map((n, i) => {
        const c = ctrlDe(i)
        return <button key={`c-${n.id}`} type="button" aria-label="Curvar trecho" title="Arraste para curvar o trecho"
          onPointerDown={(e) => { e.preventDefault(); dragRef.current = { tipo: 'curva', id: n.id } }}
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-primary shadow"
          style={{ left: `${c.x}%`, top: `${c.y}%`, width: ctrlSize, height: ctrlSize }} />
      })}

      {/* Nós */}
      {nodes.map((n, i) => {
        const p = posDe(i)
        const cor = coresNo(n.estado, simbolos[n.estado])
        const atual = n.estado === 'atual'
        return (
          <div key={n.id} ref={i === alvoIdx ? alvoRef : undefined} className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            {atual && !editavel && <span className="mb-1 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 font-bold text-primary-foreground shadow" style={{ fontSize: Math.max(9, labelFs - 1) }}>você está aqui</span>}
            <button type="button" data-trilha-no
              onPointerDown={editavel ? (e) => { e.preventDefault(); dragRef.current = { tipo: 'no', id: n.id } } : undefined}
              onClick={!editavel ? () => setAberto((v) => v === n.id ? null : n.id) : undefined}
              className={cn('relative flex items-center justify-center rounded-full shadow-md', editavel ? 'cursor-move touch-none' : 'cursor-pointer transition-transform hover:scale-105', aberto === n.id && 'ring-4 ring-primary/25')}
              style={{ width: nodeSize, height: nodeSize, background: cor.fundo, borderColor: cor.borda, borderWidth: borda, borderStyle: 'solid' }}>
              {/* Nó ATUAL ("você está aqui"): anéis pulsando soltando em volta. */}
              {atual && !editavel && (<>
                <span className="pointer-events-none absolute rounded-full border-2 opacity-70 motion-safe:animate-ping" style={{ inset: -Math.round(nodeSize * 0.12), borderColor: cor.borda }} />
                <span className="pointer-events-none absolute rounded-full opacity-40 motion-safe:animate-ping [animation-delay:600ms]" style={{ inset: -Math.round(nodeSize * 0.05), background: `radial-gradient(circle, ${cor.borda}33 0%, transparent 70%)` }} />
              </>)}
              <SimboloNo config={simbolos[n.estado]} escala={iconEscala} cor={cor.simbolo} />
            </button>
            <span className="mt-1 max-w-[9rem] truncate rounded bg-black/55 px-1.5 py-0.5 text-center font-medium text-white backdrop-blur" style={{ fontSize: labelFs }}>{n.titulo}</span>
          </div>
        )
      })}

      {/* Balão adaptativo do dia (estilo achatado): posiciona acima/abaixo conforme o espaço, com a seta
          apontando p/ o nó; centraliza no nó e "gruda" na melhor posição horizontal sem sair da área. */}
      {!editavel && abertoNode && size.w > 0 && (() => {
        const pc = px(posDe(abertoIdx))
        const gap = nodeSize / 2 + 22
        const bw = Math.min(320, Math.max(190, size.w - 16))
        const espacoAbaixo = size.h - (pc.y + gap)
        const espacoAcima = pc.y - gap
        const abaixo = espacoAbaixo >= balaoH + 8 || espacoAbaixo >= espacoAcima
        const top = abaixo ? pc.y + gap : Math.max(6, pc.y - gap - balaoH)
        let left = pc.x - bw / 2
        left = Math.max(8, Math.min(size.w - bw - 8, left))
        const arrowX = Math.max(18, Math.min(bw - 18, pc.x - left))
        const n = abertoNode
        return (
          <div ref={balaoRef} className="absolute z-30" style={{ left, top, width: bw }}>
            {/* Abrir/fechar: fade + escala + desliza na direção do nó (ease suave, sem "seco"). */}
            <div className={cn('transition-all duration-[280ms] ease-[cubic-bezier(.16,1,.3,1)] will-change-transform', balaoVis ? 'scale-100 opacity-100 translate-y-0' : cn('scale-90 opacity-0', abaixo ? '-translate-y-3' : 'translate-y-3'))}
              style={{ transformOrigin: abaixo ? 'top center' : 'bottom center' }}>
              {/* Flutuação contínua (sobe/desce) enquanto aberto. */}
              <div className="motion-safe:animate-[trilha-flutua_3.2s_ease-in-out_infinite]">
            {/* Seta apontando para o nó */}
            <span className={cn('absolute h-3.5 w-3.5 rotate-45 border bg-card', abaixo ? '-top-[7px] border-b-0 border-r-0' : '-bottom-[7px] border-l-0 border-t-0')} style={{ left: arrowX - 7 }} />
            <div className="overflow-hidden rounded-2xl border bg-card shadow-xl">
              <div className="space-y-2 p-3.5">
                <div>
                  <p className="text-sm font-bold leading-tight text-foreground">{n.titulo}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.estado === 'concluido' ? `Concluída${n.acerto != null ? ` · ${n.acerto}%` : ''}` : (n.quando || (n.questoes ? `${n.questoes} questões` : 'Leitura'))}
                  </p>
                </div>
                {n.hrefLeitura !== undefined ? (
                  <div className="space-y-1.5">
                    {n.hrefLeitura ? (
                      <Link href={n.hrefLeitura} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110">{n.acaoLeitura ?? 'Leitura'}</Link>
                    ) : (
                      <span className="flex w-full items-center justify-center rounded-xl border border-dashed px-4 py-2 text-xs font-medium text-muted-foreground">🔒 {n.naoLiberada ? 'Ainda não liberada' : 'Conclua a aula anterior'}</span>
                    )}
                    {n.hrefLeitura && (n.questoesLiberada && n.hrefQuestoes ? (
                      <Link href={n.hrefQuestoes} className="flex w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-primary px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/10">Questões do conteúdo</Link>
                    ) : (
                      <span className="flex w-full cursor-not-allowed items-center justify-center rounded-xl border border-dashed px-4 py-2 text-xs font-medium text-muted-foreground">🔒 Questões do conteúdo</span>
                    ))}
                  </div>
                ) : n.href ? (
                  <Link href={n.href} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110">{n.acao ?? 'Abrir'}</Link>
                ) : (
                  <span className="flex w-full items-center justify-center rounded-xl border border-dashed px-4 py-2 text-xs font-medium text-muted-foreground">🔒 Ainda não liberada</span>
                )}
              </div>
            </div>
              </div>
            </div>
          </div>
        )
      })()}

      {editavel && <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white shadow">Arraste os nós e os pontos de curva (roxos)</div>}
    </div>
  )
}
