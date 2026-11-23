'use client'
// Painel de resultados da pesquisa (escopo: página / seção / caderno). Usa GET /api/aluno/notebook/busca (parâmetro `escopo` tolerado).
// O servidor limita a 30 resultados; no escopo "página" devolve todas as ocorrências (trechos) da página.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { buscar } from './cliente-caderno'
import { ROTULO_ESCOPO, type Escopo } from './barra-plataforma'
import { FONTE_UI } from './tipos'

type Item = { id: string; secao_id: string; titulo: string; trecho?: string; ocorrencias?: string[] }
const textoPuro = (s: string) => s.replace(/<[^>]+>/g, '')

export function PainelBusca({ q, escopo, secaoId, paginaId, nomeSecao, onAbrir, onFechar }: {
  q: string; escopo: Escopo; secaoId: string | null; paginaId: string | null; nomeSecao: (id: string) => string
  onAbrir: (paginaId: string, secaoId: string) => void; onFechar: () => void
}) {
  const [itens, setItens] = useState<Item[]>([])
  const [estado, setEstado] = useState<'idle' | 'carregando' | 'erro'>('idle')
  const [sel, setSel] = useState(0)
  const termo = q.trim()

  useEffect(() => {
    if (termo.length < 2) { setItens([]); setEstado('idle'); return }
    const ac = new AbortController()
    setEstado('carregando')
    const t = setTimeout(async () => {
      try {
        const esc = escopo === 'pagina' && !paginaId ? 'caderno' : escopo === 'secao' && !secaoId ? 'caderno' : escopo
        const r = await buscar(termo, esc, secaoId ?? undefined, paginaId ?? undefined, ac.signal)
        if (!r.ok) throw new Error('busca')
        // escopo página: uma linha por ocorrência (trecho); demais: uma linha por página
        const lista = esc === 'pagina' ? r.itens.flatMap((i) => (i.ocorrencias?.length ? i.ocorrencias : [i.trecho ?? '']).map((t) => ({ ...i, trecho: t }))) : r.itens
        setItens(lista); setSel(0); setEstado('idle')
      } catch (e) { if ((e as Error).name !== 'AbortError') setEstado('erro') }
    }, 300)
    return () => { clearTimeout(t); ac.abort() }
  }, [termo, escopo, secaoId, paginaId])

  // Navegação pelo teclado enquanto o foco está na caixa de pesquisa: Setas/F3/Shift+F3/Enter/Esc
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLInputElement) || e.target.getAttribute('aria-label') !== 'Pesquisar no caderno') return
      if (e.key === 'ArrowDown' || (e.key === 'F3' && !e.shiftKey)) { e.preventDefault(); setSel((s) => Math.min(itens.length - 1, s + 1)) }
      else if (e.key === 'ArrowUp' || (e.key === 'F3' && e.shiftKey)) { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
      else if (e.key === 'Enter' && itens[sel]) { e.preventDefault(); onAbrir(itens[sel].id, itens[sel].secao_id) }
      else if (e.key === 'Escape') { e.preventDefault(); onFechar() }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [itens, sel, onAbrir, onFechar])

  if (termo.length < 2 && estado === 'idle') return null
  return (
    <div role="dialog" aria-label="Resultados da pesquisa" style={{
      position: 'fixed', top: 48, left: '50%', transform: 'translateX(-50%)', width: 'min(580px, 96vw)', zIndex: 70, maxHeight: '60vh', display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 6, fontFamily: FONTE_UI, boxShadow: '0 12px 32px -10px color-mix(in srgb, var(--ink) 50%, transparent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 6px 6px 12px', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)' }}>
        <span style={{ flex: 1 }}>{ROTULO_ESCOPO[escopo]} · {estado === 'carregando' ? 'pesquisando…' : `${itens.length} resultado(s)`}</span>
        <button type="button" onClick={onFechar} aria-label="Fechar resultados" style={{ width: 28, height: 28, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}><X size={14} aria-hidden /></button>
      </div>
      <div role="listbox" aria-label="Resultados" style={{ overflowY: 'auto' }}>
        {estado === 'erro' ? <p style={{ padding: 14, fontSize: 13, color: 'var(--danger)', margin: 0 }}>Não foi possível pesquisar agora.</p> : null}
        {estado === 'idle' && itens.length === 0 ? <p style={{ padding: 14, fontSize: 13, color: 'var(--muted)', margin: 0 }}>Nada encontrado.</p> : null}
        {itens.map((it, i) => (
          <button key={`${it.id}-${i}`} type="button" role="option" aria-selected={i === sel} onClick={() => onAbrir(it.id, it.secao_id)} onMouseEnter={() => setSel(i)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 0, background: i === sel ? 'var(--chip)' : 'transparent', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{it.titulo || 'Página sem título'} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {nomeSecao(it.secao_id)}</span></span>
            {it.trecho ? <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{textoPuro(it.trecho).slice(0, 180)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
