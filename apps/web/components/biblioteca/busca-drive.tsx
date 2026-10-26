'use client'

// Busca estilo Google Drive (apresentacional) da Biblioteca — spec 02/03a §"Busca estilo Drive".
// `BuscaDrive` = barra grande (lupa + Ctrl K) que abre um dropdown com: chips de filtro (tipo/status),
// "Pesquisas recentes" (quando vazio) e sugestões ao vivo (quando há texto). `ResultadosBusca` = a tela
// de resultados (lista com trecho + <mark>) que substitui a grade, com botão "Limpar" que volta ao início.
// Puro de dados: tudo entra por props/handlers; só gerencia abertura do dropdown e os "recentes" locais
// (localStorage, conveniência por-visitante, sempre em try/catch). Cores via token; selo por tipo.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X, Clock, CornerDownLeft, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SeloTipo } from './selo-tipo'
import { Chip } from './pilulas'
import type { KindConteudo } from '@/lib/biblioteca/tipos-conteudo'

export type OpcaoChip = { k: string; label: string; ativo: boolean }
export type SugestaoBusca = { id: string; kind: KindConteudo; titulo: string; caminho?: string }
export type ResultadoBusca = SugestaoBusca & { status?: React.ReactNode; trecho?: string }

const RECENTES_KEY = 'biblioteca:buscas-recentes'
const MAX_RECENTES = 5

function lerRecentes(): string[] {
  try {
    const raw = localStorage.getItem(RECENTES_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, MAX_RECENTES) : []
  } catch { return [] }
}
function gravarRecentes(lista: string[]) {
  try { localStorage.setItem(RECENTES_KEY, JSON.stringify(lista.slice(0, MAX_RECENTES))) } catch { /* no-op */ }
}

/** Destaca `termo` dentro de `texto` com <mark> (sem acento/caixa). Retorna nós React. */
function marcar(texto: string, termo: string): React.ReactNode {
  const q = termo.trim()
  if (!q) return texto
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const alvo = norm(texto)
  const busca = norm(q)
  const i = alvo.indexOf(busca)
  if (i < 0) return texto
  return (
    <>
      {texto.slice(0, i)}
      <mark className="rounded bg-amber-300/60 px-0.5 text-foreground dark:bg-amber-400/30">{texto.slice(i, i + q.length)}</mark>
      {texto.slice(i + q.length)}
    </>
  )
}

export function BuscaDrive({
  valor,
  onValor,
  onSubmit,
  onLimpar,
  tipos,
  onTipo,
  status,
  onStatus,
  sugestoes = [],
  onAbrirSugestao,
  placeholder = 'Buscar na biblioteca — títulos, trechos, pastas…',
  escopoLabel = 'Toda a biblioteca',
}: {
  valor: string
  onValor: (v: string) => void
  onSubmit: (termo: string) => void
  onLimpar: () => void
  tipos?: OpcaoChip[]
  onTipo?: (k: string) => void
  status?: OpcaoChip[]
  onStatus?: (k: string) => void
  sugestoes?: SugestaoBusca[]
  onAbrirSugestao?: (s: SugestaoBusca) => void
  placeholder?: string
  escopoLabel?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [recentes, setRecentes] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setRecentes(lerRecentes()) }, [])

  // Ctrl/⌘+K foca a busca e abre o dropdown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); setAberto(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Clique-fora fecha o dropdown.
  useEffect(() => {
    if (!aberto) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [aberto])

  const enviar = useCallback((termo: string) => {
    const q = termo.trim()
    if (!q) return
    const prox = [q, ...recentes.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENTES)
    setRecentes(prox); gravarRecentes(prox)
    setAberto(false)
    inputRef.current?.blur()
    onSubmit(q)
  }, [recentes, onSubmit])

  function limparRecentes() { setRecentes([]); gravarRecentes([]) }
  function limparTudo() { onValor(''); onLimpar(); setAberto(false) }

  const temTexto = valor.trim().length > 0

  return (
    <div ref={wrapRef} className="relative">
      <div className={cn(
        'flex items-center gap-2 rounded-2xl border bg-card px-4 shadow-sm transition-all',
        aberto ? 'ring-2 ring-primary/30' : 'hover:border-primary/30',
      )}>
        <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <input
          ref={inputRef}
          value={valor}
          onChange={(e) => { onValor(e.target.value); if (!aberto) setAberto(true) }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enviar(valor)
            else if (e.key === 'Escape') setAberto(false)
          }}
          placeholder={placeholder}
          aria-label="Buscar na biblioteca"
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline-flex">
          <FolderOpen className="h-3 w-3" />{escopoLabel}
        </span>
        {temTexto ? (
          <button type="button" onClick={limparTudo} aria-label="Limpar busca" className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none hidden shrink-0 rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-block">Ctrl K</kbd>
        )}
      </div>

      {aberto && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl duration-100 animate-in fade-in-0 zoom-in-95">
          {/* Chips de filtro */}
          {(tipos?.length || status?.length) ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2.5">
              {tipos?.map((o) => (
                <Chip key={`t-${o.k}`} ativo={o.ativo} onClick={() => onTipo?.(o.k)}>{o.label}</Chip>
              ))}
              {tipos?.length && status?.length ? <span className="mx-0.5 h-4 w-px bg-border" /> : null}
              {status?.map((o) => (
                <Chip key={`s-${o.k}`} ativo={o.ativo} onClick={() => onStatus?.(o.k)}>{o.label}</Chip>
              ))}
            </div>
          ) : null}

          <div className="max-h-[52vh] overflow-y-auto p-1.5">
            {temTexto ? (
              <>
                <button
                  type="button"
                  onClick={() => enviar(valor)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">Pesquisar <strong className="font-semibold">&ldquo;{valor.trim()}&rdquo;</strong> em títulos e no texto</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><CornerDownLeft className="h-3 w-3" />Enter</span>
                </button>
                {sugestoes.length > 0 && (
                  <>
                    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sugestões</div>
                    {sugestoes.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setAberto(false); onAbrirSugestao?.(s) }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent"
                      >
                        <SeloTipo kind={s.kind} tamanho="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{marcar(s.titulo, valor)}</span>
                          {s.caminho && <span className="block truncate text-[11px] text-muted-foreground">{s.caminho}</span>}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </>
            ) : recentes.length > 0 ? (
              <>
                <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pesquisas recentes</span>
                  <button type="button" onClick={limparRecentes} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">Limpar</button>
                </div>
                {recentes.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { onValor(r); enviar(r) }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{r}</span>
                  </button>
                ))}
              </>
            ) : (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Digite para buscar por título. Pressione <kbd className="rounded border bg-background px-1 text-[10px]">Enter</kbd> para ver todos os resultados.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Tela de resultados da busca (substitui a grade). Presentacional; `onLimpar` volta ao início. */
export function ResultadosBusca({
  termo,
  resultados,
  onAbrir,
  onLimpar,
  voltarLabel,
}: {
  termo: string
  resultados: ResultadoBusca[]
  onAbrir: (r: ResultadoBusca) => void
  onLimpar: () => void
  voltarLabel?: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">{resultados.length}</strong> {resultados.length === 1 ? 'resultado' : 'resultados'} para <strong className="font-semibold text-foreground">&ldquo;{termo}&rdquo;</strong>
        </div>
        <button type="button" onClick={onLimpar} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted">
          <X className="h-3.5 w-3.5" />Limpar busca{voltarLabel ? ` · ${voltarLabel}` : ''}
        </button>
      </div>

      {resultados.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-14 text-center text-sm text-muted-foreground">
          Nenhum documento encontrado — tente outra palavra ou tire os filtros.
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {resultados.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onAbrir(r)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <SeloTipo kind={r.kind} tamanho="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold">{marcar(r.titulo, termo)}</span>
                  {r.status}
                </div>
                {r.caminho && <div className="truncate text-[11px] text-muted-foreground">{r.caminho}</div>}
                {r.trecho && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{marcar(r.trecho, termo)}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
