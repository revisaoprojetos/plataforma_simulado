'use client'
// Busca full-text (GET /api/aluno/notebook/busca). Abre com Ctrl/Cmd+K (o atalho é tratado no shell).
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/nova/icons'

type Item = { id: string; secao_id: string; titulo: string; trecho?: string }

/** Remove tags do ts_headline (vem do servidor, mas NÃO renderizamos HTML): mostra só texto. */
const textoPuro = (s: string) => s.replace(/<[^>]+>/g, '')

export function BarraBusca({ aberta, onFechar, onAbrir }: { aberta: boolean; onFechar: () => void; onAbrir: (paginaId: string, secaoId: string) => void }) {
  const [q, setQ] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  const [estado, setEstado] = useState<'idle' | 'carregando' | 'erro'>('idle')
  const [sel, setSel] = useState(0)
  const inp = useRef<HTMLInputElement>(null)

  useEffect(() => { if (aberta) { setTimeout(() => inp.current?.focus(), 0) } else { setQ(''); setItens([]); setEstado('idle') } }, [aberta])

  useEffect(() => {
    const termo = q.trim()
    if (!aberta || termo.length < 2) { setItens([]); setEstado('idle'); return }
    const ac = new AbortController()
    setEstado('carregando')
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/aluno/notebook/busca?q=${encodeURIComponent(termo.slice(0, 100))}&limit=20`, { signal: ac.signal, credentials: 'same-origin' })
        if (!r.ok) throw new Error(String(r.status))
        const j = await r.json()
        setItens(Array.isArray(j.itens) ? j.itens : []); setSel(0); setEstado('idle')
      } catch (e) { if ((e as Error).name !== 'AbortError') setEstado('erro') }
    }, 300)
    return () => { clearTimeout(t); ac.abort() }
  }, [q, aberta])

  if (!aberta) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="Buscar no caderno" style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 12px 12px' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onFechar() }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(itens.length - 1, s + 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
        else if (e.key === 'Enter' && itens[sel]) { onAbrir(itens[sel].id, itens[sel].secao_id); onFechar() }
      }}>
      <div onClick={onFechar} style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--ink) 45%, transparent)' }} />
      <div style={{ position: 'relative', width: 'min(100%, 640px)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px -24px color-mix(in srgb, var(--ink) 60%, transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid var(--line)' }}>
          <Icon n="search" size={16} />
          <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas suas páginas" aria-label="Buscar nas suas páginas" maxLength={100}
            style={{ flex: 1, height: 52, background: 'transparent', border: 0, outline: 'none', color: 'var(--ink)', fontSize: 15 }} />
          <button type="button" onClick={onFechar} aria-label="Fechar busca" style={{ width: 44, height: 44, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}><Icon n="x" size={16} /></button>
        </div>
        <div role="listbox" aria-label="Resultados" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {estado === 'carregando' ? <p style={{ padding: 16, fontSize: 13, color: 'var(--muted)' }}>Buscando…</p> : null}
          {estado === 'erro' ? <p style={{ padding: 16, fontSize: 13, color: 'var(--danger)' }}>Não foi possível buscar agora.</p> : null}
          {estado === 'idle' && q.trim().length >= 2 && itens.length === 0 ? <p style={{ padding: 16, fontSize: 13, color: 'var(--muted)' }}>Nada encontrado.</p> : null}
          {itens.map((it, i) => (
            <button key={it.id} type="button" role="option" aria-selected={i === sel} onClick={() => { onAbrir(it.id, it.secao_id); onFechar() }}
              style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 48, padding: '10px 16px', border: 0, background: i === sel ? 'var(--surface2)' : 'transparent', color: 'var(--ink)', cursor: 'pointer' }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{it.titulo || 'Sem título'}</span>
              {it.trecho ? <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{textoPuro(it.trecho).slice(0, 180)}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
