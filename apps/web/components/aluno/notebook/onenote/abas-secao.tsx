'use client'
// Abas de seção horizontais (acima do canvas): cor própria por seção, rolagem por setas, + (Ctrl+T), arrastar p/ reordenar,
// menu de contexto e alvo de soltura para páginas (mover página para a seção).
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, Plus, Star, XCircle } from 'lucide-react'
import { corDaSecao, ehAuto, FONTE_UI, type Secao } from './tipos'
import type { Entre } from './cliente-caderno'

export const DND_PAGINA = 'application/x-onenote-pagina'
const DND_SECAO = 'application/x-onenote-secao'

export const AbasSecao = memo(function AbasSecao({ secoes, ativaId, onSelecionar, onNova, onReordenar, onMenu, onSoltarPagina }: {
  secoes: Secao[]; ativaId: string | null
  onSelecionar: (id: string) => void; onNova: () => void
  onReordenar: (id: string, entre: Entre) => void
  onMenu: (e: React.MouseEvent, s: Secao) => void
  onSoltarPagina: (paginaId: string, secaoId: string) => void
}) {
  const faixa = useRef<HTMLDivElement>(null)
  const [setas, setSetas] = useState({ esq: false, dir: false })
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<{ id: string; lado: 'antes' | 'depois' } | null>(null)

  const medir = useCallback(() => {
    const el = faixa.current; if (!el) return
    setSetas({ esq: el.scrollLeft > 2, dir: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
  }, [])
  useEffect(() => {
    medir()
    const el = faixa.current; if (!el) return
    const ro = new ResizeObserver(medir); ro.observe(el)
    return () => ro.disconnect()
  }, [medir, secoes.length])
  useEffect(() => { faixa.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [ativaId])

  const ativaIdx = Math.max(0, secoes.findIndex((s) => s.id === ativaId))
  const corAtiva = secoes.length ? corDaSecao(secoes[ativaIdx], ativaIdx).cor : 'var(--line2)'
  const rolar = (d: number) => faixa.current?.scrollBy({ left: d * 220, behavior: 'smooth' })

  const soltar = (e: React.DragEvent, s: Secao, lado: 'antes' | 'depois') => {
    e.preventDefault(); setAlvo(null)
    const pid = e.dataTransfer.getData(DND_PAGINA)
    if (pid) { if (!ehAuto(s)) onSoltarPagina(pid, s.id); return }
    const sid = e.dataTransfer.getData(DND_SECAO)
    if (!sid || sid === s.id) return
    const idx = secoes.findIndex((x) => x.id === s.id)
    if (lado === 'antes') onReordenar(sid, { antes_id: secoes[idx - 1]?.id ?? null, depois_id: s.id })
    else onReordenar(sid, { antes_id: s.id, depois_id: secoes[idx + 1]?.id ?? null })
  }

  const seta = (d: -1 | 1, on: boolean) => !on ? null : (
    <button type="button" aria-label={d < 0 ? 'Rolar abas para a esquerda' : 'Rolar abas para a direita'} disabled={!on} onClick={() => rolar(d)}
      style={{ width: 40, minHeight: 40, flexShrink: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', opacity: 0.75 }} className="onenote-hover">
      {d < 0 ? <ChevronLeft size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
    </button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: 38, flexShrink: 0, background: 'var(--surface2)', borderBottom: `3px solid ${corAtiva}`, fontFamily: FONTE_UI, paddingTop: 4 }}>
      {seta(-1, setas.esq)}
      <div ref={faixa} role="tablist" aria-label="Seções" onScroll={medir} style={{ display: 'flex', alignItems: 'flex-end', gap: 2, flex: '0 1 auto', minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', WebkitMaskImage: `linear-gradient(to right, ${setas.esq ? 'transparent, #000 24px' : '#000, #000 0'}, ${setas.dir ? '#000 calc(100% - 24px), transparent' : '#000 100%, #000'})`, maskImage: `linear-gradient(to right, ${setas.esq ? 'transparent, #000 24px' : '#000, #000 0'}, ${setas.dir ? '#000 calc(100% - 24px), transparent' : '#000 100%, #000'})` }}>
        {secoes.map((s, i) => {
          const cor = corDaSecao(s, i); const on = s.id === ativaId; const auto = ehAuto(s)
          const Ico = s.tipo === 'auto_erros' ? XCircle : Star
          const marca = alvo?.id === s.id ? (alvo.lado === 'antes' ? 'inset 3px 0 0 var(--brand)' : 'inset -3px 0 0 var(--brand)') : undefined
          return (
            <button key={s.id} type="button" role="tab" aria-selected={on} title={auto ? `${s.nome} (automática, somente leitura)` : s.nome}
              draggable={!auto} onClick={() => onSelecionar(s.id)} onContextMenu={(e) => onMenu(e, s)}
              onDragStart={(e) => { e.dataTransfer.setData(DND_SECAO, s.id); e.dataTransfer.effectAllowed = 'move'; setArrastando(s.id) }}
              onDragEnd={() => { setArrastando(null); setAlvo(null) }}
              onDragOver={(e) => {
                const tipos = e.dataTransfer.types
                if (!tipos.includes(DND_SECAO) && !tipos.includes(DND_PAGINA)) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                setAlvo({ id: s.id, lado: e.clientX < r.left + r.width / 2 ? 'antes' : 'depois' })
              }}
              onDragLeave={() => setAlvo((a) => (a?.id === s.id ? null : a))}
              onDrop={(e) => soltar(e, s, alvo?.id === s.id ? alvo.lado : 'depois')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: on ? 34 : 30, maxWidth: 190, minWidth: 64, padding: '0 14px', flexShrink: 0,
                border: 0, borderRadius: '8px 8px 0 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500,
                // cor da seção = identidade (dado); inativa = tom claro da mesma cor sobre a superfície do tema
                background: on ? cor.cor : `color-mix(in srgb, ${cor.cor} 32%, var(--surface))`, color: on ? cor.texto : 'var(--ink)',
                opacity: arrastando === s.id ? 0.45 : 1, boxShadow: marca,
              }}>
              {auto ? <Ico size={13} aria-hidden style={{ flexShrink: 0 }} /> : null}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nome}</span>
              {auto ? <Lock size={10} aria-label="Somente leitura" style={{ flexShrink: 0, opacity: 0.8 }} /> : null}
            </button>
          )
        })}
      </div>
      {seta(1, setas.dir)}
      <button type="button" onClick={onNova} title="Nova seção (Ctrl+T)" aria-label="Nova seção" className="onenote-hover"
        style={{ width: 30, height: 28, marginBottom: 2, border: 0, borderRadius: 6, background: 'transparent', color: 'var(--brand)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Plus size={18} aria-hidden />
      </button>
    </div>
  )
})
