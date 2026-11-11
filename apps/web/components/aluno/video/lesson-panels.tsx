'use client'

/** Painéis da aula: capítulos, transcrição pesquisável e anotações com tempo. Só leitura/consulta; sem cálculo pesado. */

import * as React from 'react'
import { Search, Loader2, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { chapterIndexAt, formatTime, type Chapter } from '@/lib/video/player-protocolo'

type PanelCtx = {
  courseId: string
  /** id da aula (o mesmo no serviço de vídeo). */
  aulaId: string
  apiBase: string
  lessonId?: string
  getToken: () => string
  time: number
  seek: (t: number) => void
  getTime: () => number
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const rowBtn =
  'flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
const timeChip = 'shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground'

// ───────────────────────────── Capítulos ─────────────────────────────

export function ChaptersPanel({ chapters, time, seek }: { chapters: Chapter[]; time: number; seek: (t: number) => void }) {
  const idx = chapterIndexAt(chapters, time)
  if (!chapters.length) return <p className="px-3 py-6 text-sm text-muted-foreground">Esta aula não tem capítulos.</p>
  return (
    <ol aria-label="Capítulos" className="space-y-0.5">
      {chapters.map((c, i) => (
        <li key={`${c.startS}-${i}`}>
          <button
            type="button"
            onClick={() => seek(c.startS)}
            aria-current={i === idx ? 'true' : undefined}
            className={cn(rowBtn, i === idx && 'bg-primary/10 font-semibold text-foreground')}
          >
            <span className={timeChip}>{formatTime(c.startS)}</span>
            <span className="min-w-0 flex-1">{c.title}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

// ───────────────────────────── Transcrição ─────────────────────────────

type Segment = { startS: number; endS: number; text: string }
type Transcript = { lang: string | null; languages: string[]; segments: Segment[] }

export function TranscriptPanel({ ctx }: { ctx: PanelCtx }) {
  const { apiBase, lessonId, getToken, time, seek } = ctx
  const [t, setT] = React.useState<Transcript | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [lang, setLang] = React.useState<string | undefined>()
  const [q, setQ] = React.useState('')
  const listRef = React.useRef<HTMLOListElement>(null)

  React.useEffect(() => {
    if (!lessonId) return
    const ac = new AbortController()
    setErr(null)
    fetch(`${apiBase}/v1/lessons/${lessonId}/transcript${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`, {
      headers: { authorization: `Bearer ${getToken()}` },
      signal: ac.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<Transcript>) : Promise.reject(new Error(String(r.status)))))
      .then(setT)
      .catch((e) => { if (!ac.signal.aborted) setErr(e instanceof Error && e.message === '404' ? 'Esta aula não tem transcrição.' : 'Não foi possível carregar a transcrição.') })
    return () => ac.abort()
  }, [apiBase, lessonId, lang, getToken])

  const nq = norm(q.trim())
  const segs = React.useMemo(() => (t?.segments ?? []).map((s, i) => ({ s, i })).filter(({ s }) => !nq || norm(s.text).includes(nq)), [t, nq])
  const activeIdx = React.useMemo(() => {
    let a = -1
    ;(t?.segments ?? []).forEach((s, i) => { if (time >= s.startS && time < s.endS) a = i })
    return a
  }, [t, time])

  // Mantém a fala atual visível (rola só a lista, nunca a página).
  React.useEffect(() => {
    if (nq || activeIdx < 0) return
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-seg="${activeIdx}"]`)
    if (list && el && (el.offsetTop < list.scrollTop || el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight)) {
      list.scrollTop = el.offsetTop - list.clientHeight / 3
    }
  }, [activeIdx, nq])

  if (!lessonId) return <p className="px-3 py-6 text-sm text-muted-foreground">Transcrição indisponível para esta aula.</p>
  if (err) return <p className="px-3 py-6 text-sm text-muted-foreground">{err}</p>
  if (!t) return <p className="inline-flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar na transcrição"
            aria-label="Buscar na transcrição"
            className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {t.languages.length > 1 && (
          <select
            value={lang ?? t.lang ?? ''}
            onChange={(e) => setLang(e.target.value)}
            aria-label="Idioma da transcrição"
            className="h-10 rounded-xl border bg-card px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.languages.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
      </div>
      <ol ref={listRef} aria-label="Transcrição" className="relative max-h-[360px] space-y-0.5 overflow-y-auto">
        {segs.length === 0 && <li className="px-3 py-6 text-sm text-muted-foreground">Nenhum trecho encontrado.</li>}
        {segs.map(({ s, i }) => (
          <li key={i} data-seg={i}>
            <button
              type="button"
              onClick={() => seek(s.startS)}
              aria-current={i === activeIdx ? 'true' : undefined}
              className={cn(rowBtn, i === activeIdx && 'bg-primary/10 text-foreground')}
            >
              <span className={timeChip}>{formatTime(s.startS)}</span>
              <span className="min-w-0 flex-1">{s.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ───────────────────────────── Anotações ─────────────────────────────

type Note = { id: string; atS: number; text: string }

function normalizeNotes(j: unknown): Note[] {
  const arr: unknown[] = Array.isArray(j) ? j : Array.isArray((j as { anotacoes?: unknown[] })?.anotacoes) ? (j as { anotacoes: unknown[] }).anotacoes
    : Array.isArray((j as { notes?: unknown[] })?.notes) ? (j as { notes: unknown[] }).notes : []
  return arr.map((n) => {
    const o = n as Record<string, unknown>
    return { id: String(o.id ?? Math.random()), atS: Number(o.atS ?? o.at_s ?? o.tempo ?? 0), text: String(o.text ?? o.texto ?? '') }
  }).sort((a, b) => a.atS - b.atS)
}

export function NotesPanel({ ctx }: { ctx: PanelCtx }) {
  const { courseId, aulaId, seek, getTime, time } = ctx
  const [notes, setNotes] = React.useState<Note[] | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [text, setText] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/aluno/video/anotacoes?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(aulaId)}`)
      if (!r.ok) throw new Error(String(r.status))
      setNotes(normalizeNotes(await r.json()))
      setErr(null)
    } catch { setErr('Não foi possível carregar as anotações.') }
  }, [courseId, aulaId])
  React.useEffect(() => { void load() }, [load])

  async function add() {
    const body = text.trim()
    if (!body || saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/aluno/video/anotacoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId, lessonId: aulaId, atS: Math.floor(getTime()), text: body }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setText('')
      await load()
    } catch { setErr('Não foi possível salvar a anotação.') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Escreva uma anotação…"
          aria-label="Nova anotação"
          className="w-full resize-y rounded-xl border bg-card p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={!text.trim() || saving}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
          Anotar em {formatTime(time)}
        </button>
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {notes && notes.length === 0 && <p className="text-sm text-muted-foreground">Você ainda não fez anotações nesta aula.</p>}
      <ul aria-label="Minhas anotações" className="space-y-0.5">
        {(notes ?? []).map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => seek(n.atS)} className={rowBtn}>
              <span className={timeChip}>{formatTime(n.atS)}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{n.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type { PanelCtx }
