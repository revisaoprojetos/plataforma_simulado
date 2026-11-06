'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OpcaoMulti { id: string; nome: string; /** recuo (hierarquia), 0 = raiz */ nivel?: number }

/**
 * Seletor MÚLTIPLO com busca (popover) + chips dos itens escolhidos. Genérico e controlado.
 * `desabilitado` + `dica` explicam por que ainda não dá para escolher (ex.: assunto exige disciplina).
 */
export function MultiSelectLista({
  rotulo, opcoes, valor, onChange, desabilitado, dica, carregando, vazioTexto = 'Nenhuma opção',
}: {
  rotulo: string
  opcoes: OpcaoMulti[]
  valor: string[]
  onChange: (v: string[]) => void
  desabilitado?: boolean
  dica?: string
  carregando?: boolean
  vazioTexto?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [q, setQ] = useState('')
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const onDown = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [aberto])

  const sel = useMemo(() => new Set(valor), [valor])
  const porId = useMemo(() => new Map(opcoes.map((o) => [o.id, o])), [opcoes])
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (t ? opcoes.filter((o) => o.nome.toLowerCase().includes(t)) : opcoes).slice(0, 300)
  }, [opcoes, q])
  const alternar = (id: string) => onChange(sel.has(id) ? valor.filter((v) => v !== id) : [...valor, id])

  // Quantos chips cabem em UMA linha (o resto vira "+N"). Mede o medidor invisível e reserva espaço p/ o "+N".
  const linha = useRef<HTMLDivElement>(null)
  const medidor = useRef<HTMLDivElement>(null)
  const [cabem, setCabem] = useState(valor.length)
  useLayoutEffect(() => {
    const GAP = 4, MAIS = 40 // espaço do chip "+N"
    const calcular = () => {
      const l = linha.current, m = medidor.current
      if (!l || !m) return
      const larg = l.clientWidth
      const larguras = Array.from(m.children).map((c) => (c as HTMLElement).offsetWidth)
      let usado = 0, n = 0
      for (let i = 0; i < larguras.length; i++) {
        const reserva = i < larguras.length - 1 ? MAIS + GAP : 0 // só reserva o "+N" se ainda sobrar chip depois deste
        if (usado + larguras[i] + reserva <= larg) { usado += larguras[i] + GAP; n++ } else break
      }
      setCabem(Math.max(1, n)) // pelo menos 1 (truncado) — nunca só o "+N"
    }
    calcular()
    if (!linha.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(calcular)
    ro.observe(linha.current)
    return () => ro.disconnect()
  }, [valor, opcoes])
  const visiveis = valor.slice(0, cabem)
  const escondidos = valor.slice(cabem)

  return (
    <div ref={raiz} className="relative min-w-0">
      <span className="text-[11px] font-medium text-muted-foreground">{rotulo}</span>
      <button
        type="button" disabled={desabilitado} onClick={() => { setAberto((a) => !a); setQ('') }}
        aria-haspopup="listbox" aria-expanded={aberto}
        className="mt-1 flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 text-left text-sm outline-none transition hover:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn('truncate', !valor.length && 'text-muted-foreground')}>
          {desabilitado && dica ? dica : valor.length ? `${valor.length} selecionado${valor.length > 1 ? 's' : ''}` : carregando ? 'Carregando…' : 'Todas'}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[16rem] rounded-xl border bg-popover p-1.5 shadow-lg" role="listbox" aria-multiselectable>
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtradas.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">{vazioTexto}</p>
            ) : filtradas.map((o) => (
              <button
                key={o.id} type="button" role="option" aria-selected={sel.has(o.id)} onClick={() => alternar(o.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                style={o.nivel && !q ? { paddingLeft: `${8 + Math.min(o.nivel, 4) * 14}px` } : undefined}
              >
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', sel.has(o.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
                  {sel.has(o.id) && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 truncate">{o.nome}</span>
              </button>
            ))}
          </div>
          {valor.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Limpar seleção</button>
          )}
        </div>
      )}

      {valor.length > 0 && (
        // UMA linha só: mostra os chips que cabem e o resto vira "+N". Um medidor invisível (mesmos chips)
        // dá a largura real de cada um; o ResizeObserver recalcula quando a coluna muda de tamanho.
        <div className="relative mt-1.5">
          <div ref={linha} className="flex flex-nowrap gap-1 overflow-hidden">
            {visiveis.map((id) => <ChipSelecionado key={id} nome={porId.get(id)?.nome ?? '…'} onRemover={() => alternar(id)} />)}
            {escondidos.length > 0 && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                title={escondidos.map((id) => porId.get(id)?.nome ?? '…').join(', ')}>+{escondidos.length}</span>
            )}
          </div>
          <div ref={medidor} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex w-max flex-nowrap gap-1">
            {valor.map((id) => <ChipSelecionado key={id} nome={porId.get(id)?.nome ?? '…'} medindo />)}
          </div>
        </div>
      )}
    </div>
  )
}

function ChipSelecionado({ nome, onRemover, medindo }: { nome: string; onRemover?: () => void; medindo?: boolean }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2 pr-1 text-[11px] font-medium text-primary">
      <span className={medindo ? 'whitespace-nowrap' : 'truncate'}>{nome}</span>
      <button type="button" tabIndex={medindo ? -1 : undefined} onClick={onRemover} aria-label="Remover" className="grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-primary/20"><X className="h-3 w-3" /></button>
    </span>
  )
}
