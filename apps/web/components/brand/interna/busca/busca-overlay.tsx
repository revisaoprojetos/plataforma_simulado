'use client'

// Overlay de BUSCA (novo design, marca Revisão) — Ctrl+K / clique na barra de busca do topo.
// Por ora a ferramenta pesquisa SOMENTE simulados (deixado explícito na descrição). Busca ao vivo
// (debounce) em /api/aluno/buscar-simulados. A ORGANIZAÇÃO espelha "Simulados realizados":
//   • DISPONÍVEIS (não feitos) → ticket igual ao de "Simulados recentes" (Fazer agora + Baixar);
//   • JÁ FEITOS → ticket de concluído com NOTA e data (leva ao resultado do simulado).
// Tokens via internaTokensStyle (mesma marca/tema do shell). Fecha no Esc / clique no fundo.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Loader2, FileText, Play, Download, Check, ArrowRight } from 'lucide-react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'

type Resultado = {
  id: string; titulo: string; embedToken: string | null; capa: string | null; cor: string | null
  feito: boolean; emAndamento: boolean; nota: number | null; notaLiberada: boolean; data: string; enunciadoUrl: string | null
  progresso: { questaoAtual: number; total: number; pct: number } | null
}

const GRAD_FALLBACK = 'linear-gradient(135deg,#2E1F7A,#4A31B8)'

// Capa do ticket: imagem real (object-cover, sem texto) ou gradiente da marca + ícone.
function Capa({ r, w }: { r: Resultado; w: number }) {
  return (
    <span style={{ position: 'relative', width: w, flexShrink: 0, alignSelf: 'stretch', overflow: 'hidden', background: r.cor || GRAD_FALLBACK, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {r.capa
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={r.capa} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <FileText style={{ width: 22, height: 22, color: 'rgba(255,255,255,.85)' }} />}
    </span>
  )
}

function NotaPill({ v }: { v: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, height: 28, padding: '0 11px', borderRadius: 9, background: '#1FA86822', color: '#1FA868', fontSize: 13, fontWeight: 800 }}>
      {v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}<span style={{ fontSize: 10, fontWeight: 700, opacity: .8 }}>nota</span>
    </span>
  )
}

export function BuscaOverlay({ open, onClose, theme }: { open: boolean; onClose: () => void; theme: InternaTheme }) {
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [carregando, setCarregando] = useState(false)
  const [buscou, setBuscou] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqId = useRef(0)

  useEffect(() => {
    if (open) { const t = setTimeout(() => inputRef.current?.focus(), 40); return () => clearTimeout(t) }
    setQ(''); setResultados([]); setBuscou(false); setCarregando(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const termo = q.trim()
    if (termo.length < 2) { setResultados([]); setBuscou(false); setCarregando(false); return }
    setCarregando(true)
    const id = ++reqId.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/aluno/buscar-simulados?q=${encodeURIComponent(termo)}`, { cache: 'no-store' })
        const j = await r.json().catch(() => ({ resultados: [] }))
        if (id === reqId.current) { setResultados(Array.isArray(j.resultados) ? j.resultados : []); setBuscou(true) }
      } catch {
        if (id === reqId.current) { setResultados([]); setBuscou(true) }
      } finally {
        if (id === reqId.current) setCarregando(false)
      }
    }, 280)
    return () => clearTimeout(t)
  }, [q, open])

  const ir = useCallback((href: string) => { onClose(); window.location.href = href }, [onClose])

  if (!open || typeof document === 'undefined') return null

  const disponiveis = resultados.filter((r) => !r.feito)
  const feitos = resultados.filter((r) => r.feito)

  const rootStyle: CSSProperties = {
    ...internaTokensStyle('revisao', theme),
    position: 'fixed', inset: 0, zIndex: 120,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '10vh 16px 16px',
    background: 'color-mix(in srgb, #0A0523 55%, transparent)',
    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  }

  // Ticket DISPONÍVEL (não feito) — igual ao de "Simulados recentes": Fazer agora + Baixar.
  const CardDisp = ({ r }: { r: Resultado }) => (
    <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', minHeight: 92 }}>
      <Capa r={r} w={120} />
      <div style={{ flex: 1, minWidth: 0, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 13.5, lineHeight: 1.3, color: 'var(--ink)', fontWeight: 700, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.titulo}</b>
        {r.emAndamento && r.progresso ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              <span>Questão {r.progresso.questaoAtual.toLocaleString('pt-BR')} de {r.progresso.total.toLocaleString('pt-BR')}</span>
              <b style={{ color: 'var(--ink)' }}>{r.progresso.pct}%</b>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, r.progresso.pct))}%`, borderRadius: 3, background: 'var(--brand)' }} />
            </div>
          </div>
        ) : null}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" disabled={!r.embedToken} onClick={() => r.embedToken && ir(`/simulado/${r.embedToken}`)} style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, borderRadius: 10, border: 0, color: '#fff', fontSize: 13, fontWeight: 800, background: 'linear-gradient(180deg,#6449E0,#4B30BE)', boxShadow: '0 10px 20px -12px rgba(75,48,190,.8),inset 0 1px 0 rgba(255,255,255,.2)', cursor: r.embedToken ? 'pointer' : 'default', opacity: r.embedToken ? 1 : .5 }}>
            <Play size={12} fill="currentColor" /><span style={{ color: '#fff' }}>{r.emAndamento ? 'Continuar' : 'Fazer agora'}</span>
          </button>
          {r.enunciadoUrl ? (
            <a href={r.enunciadoUrl} download onClick={onClose} style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700 }}>
              <Download size={14} />Baixar
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )

  // Ticket JÁ FEITO — igual ao de concluído (Realizados): Concluído · data + NOTA; leva ao resultado.
  const CardFeito = ({ r }: { r: Resultado }) => (
    <button type="button" onClick={() => ir(`/aluno/simulados/${r.id}`)} style={{ display: 'flex', width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', minHeight: 92, cursor: 'pointer', color: 'inherit' }}>
      <Capa r={r} w={120} />
      <div style={{ flex: 1, minWidth: 0, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#1FA868' }}><Check size={13} />Concluído</span>
          {r.data ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.data}</span> : null}
        </div>
        <b style={{ fontSize: 13.5, lineHeight: 1.3, color: 'var(--ink)', fontWeight: 700, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.titulo}</b>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {r.notaLiberada && r.nota != null
            ? <NotaPill v={r.nota} />
            : <span style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 9, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 11.5, fontWeight: 700 }}>Nota em breve</span>}
          <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
        </div>
      </div>
    </button>
  )

  const SecaoTitulo = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px 2px' }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  )

  return createPortal(
    <div style={rootStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" aria-label="Buscar simulados">
      <div style={{ width: '100%', maxWidth: 680, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: '0 30px 80px -20px rgba(10,5,35,.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
        {/* Barra de busca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <Search style={{ width: 19, height: 19, color: 'var(--brand)', flexShrink: 0 }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar simulados pelo nome…" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 15.5, fontWeight: 500 }} />
          <button type="button" onClick={onClose} aria-label="Fechar busca" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--muted)', flexShrink: 0 }}><X style={{ width: 15, height: 15 }} /></button>
        </div>

        {/* Aviso: por ora só simulados */}
        <div style={{ padding: '8px 16px', fontSize: 11.5, color: 'var(--muted)', borderBottom: '1px solid var(--line)', background: 'var(--surface2)' }}>
          A busca pesquisa <b style={{ color: 'var(--ink)' }}>apenas simulados</b> pelo nome (matérias e questões em breve).
        </div>

        {/* Resultados */}
        <div style={{ overflowY: 'auto', padding: 12 }}>
          {carregando ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '28px 16px', color: 'var(--muted)', fontSize: 13 }}>
              <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Buscando…
            </div>
          ) : q.trim().length < 2 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Digite ao menos <b style={{ color: 'var(--ink)' }}>2 letras</b> do nome do simulado.
            </div>
          ) : buscou && resultados.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Nenhum simulado encontrado para <b style={{ color: 'var(--ink)' }}>“{q.trim()}”</b>.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {disponiveis.length > 0 && (
                <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SecaoTitulo>Disponíveis · {disponiveis.length}</SecaoTitulo>
                  {disponiveis.map((r) => <CardDisp key={r.id} r={r} />)}
                </section>
              )}
              {feitos.length > 0 && (
                <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SecaoTitulo>Já feitos · {feitos.length}</SecaoTitulo>
                  {feitos.map((r) => <CardFeito key={r.id} r={r} />)}
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>,
    document.body,
  )
}
