'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, ClipboardList, FileText, BookOpenCheck, ExternalLink, Loader2, ImageUp, Trash2 } from 'lucide-react'
import { PdfPreview } from '@/components/admin/pdf-preview'
import { salvarMontagem, type EntregaSlots, type EntregaRef, type MontagemGrupo } from '@/app/admin/cadernos-teste/actions'

type SlotKey = 'diagnostico' | 'folha' | 'enunciado' | 'gabarito'
const SLOTS: { chave: SlotKey; titulo: string; icon: typeof FileText; modalidade: string; pdf: boolean }[] = [
  { chave: 'diagnostico', titulo: 'Diagnóstico', icon: BarChart3, modalidade: 'diagnostico', pdf: false },
  { chave: 'folha', titulo: 'Folha de Resposta', icon: ClipboardList, modalidade: 'folha_respostas', pdf: false },
  { chave: 'enunciado', titulo: 'Caderno de Enunciado', icon: FileText, modalidade: 'caderno_questoes', pdf: true },
  { chave: 'gabarito', titulo: 'Gabarito Comentado', icon: BookOpenCheck, modalidade: 'caderno_questoes', pdf: true },
]

export function BancoCadernoMontagem({ bancoId, cor, entregaInicial, grupos }: {
  bancoId: string; cor: string; entregaInicial: EntregaSlots; grupos: MontagemGrupo[]
}) {
  const [entrega, setEntrega] = useState<EntregaSlots>(entregaInicial ?? {})
  const [salvando, setSalvando] = useState(false)

  async function aplicar(next: EntregaSlots) {
    setEntrega(next)
    setSalvando(true)
    try { const r = await salvarMontagem(bancoId, next); if (!r.ok) toast.error(r.error ?? 'Falha ao salvar.') }
    finally { setSalvando(false) }
  }
  const setSlot = (chave: SlotKey, ref: EntregaRef) => aplicar({ ...entrega, [chave]: ref })

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Montagem do aluno — selecione o que vai em cada slot</p>
        {salvando && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> salvando…</span>}
      </div>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {SLOTS.map((s) => (
          <SlotCard key={s.chave} slot={s} cor={cor} bancoId={bancoId}
            grupos={grupos}
            valor={entrega[s.chave] ?? null}
            onGrupo={(g) => setSlot(s.chave, g ? { cadernoId: g.cadernoId, itemId: g.itemId } : null)}
            onPdf={(pdf) => setSlot(s.chave, pdf)} />
        ))}
      </div>
    </div>
  )
}

function SlotCard({ slot, cor, bancoId, grupos, valor, onGrupo, onPdf }: {
  slot: { chave: SlotKey; titulo: string; icon: typeof FileText; modalidade: string; pdf: boolean }
  cor: string; bancoId: string; grupos: MontagemGrupo[]; valor: EntregaRef
  onGrupo: (g: MontagemGrupo | null) => void; onPdf: (pdf: EntregaRef) => void
}) {
  const Icon = slot.icon
  const ehPdf = !!valor?.pdfUrl
  const sel = valor?.itemId ? `${valor.cadernoId}::${valor.itemId}` : ehPdf ? 'pdf' : ''
  const fileRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  // Escala da prévia: mostra a página A4 inteira ajustada à largura do slot (zoom out).
  const BASE_W = 794, BASE_H = 1123
  const boxRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(300)
  useEffect(() => {
    const el = boxRef.current; if (!el) return
    const upd = () => setW(el.clientWidth || 300)
    upd(); const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect()
  }, [])
  const escala = w / BASE_W
  const boxH = Math.round(w * (BASE_H / BASE_W))

  const onSelect = (v: string) => {
    if (v === '') return onGrupo(null)
    if (v === 'pdf') return onPdf({ pdfUrl: valor?.pdfUrl ?? '', pdfNome: valor?.pdfNome ?? '' })
    const [cadernoId, itemId] = v.split('::')
    const g = grupos.find((x) => x.cadernoId === cadernoId && x.itemId === itemId) ?? null
    onGrupo(g)
  }

  async function enviarPdf(file: File) {
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast.error('Envie um PDF.'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('PDF muito grande (máx. ~8 MB).'); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('alvo', 'entrega'); fd.append('bancoId', bancoId)
      fd.append('slot', slot.chave === 'enunciado' ? 'enunciado' : 'gabarito')
      const resp = await fetch('/api/admin/material-pdf', { method: 'POST', body: fd })
      const r = await resp.json().catch(() => ({ ok: false }))
      if (!resp.ok || !r.ok) { toast.error(r.error ?? 'Falha ao enviar o PDF.'); return }
      onPdf({ pdfUrl: r.url, pdfNome: r.nome })
      toast.success('PDF enviado')
    } finally { setEnviando(false) }
  }

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border-2 bg-card shadow-sm" style={{ borderColor: `${cor}55` }}>
      <div className="flex items-center gap-2 border-b px-2.5 py-2" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent)` }}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white shadow-sm" style={{ background: cor }}><Icon className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={slot.titulo}>{slot.titulo}</span>
      </div>

      <div className="space-y-2 p-2.5">
        <select value={sel} onChange={(e) => onSelect(e.target.value)} className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary">
          <option value="">— Nenhum —</option>
          {grupos.map((g) => <option key={`${g.cadernoId}::${g.itemId}`} value={`${g.cadernoId}::${g.itemId}`}>{g.cadernoNome} · {g.label}</option>)}
          {slot.pdf && <option value="pdf">PDF enviado</option>}
        </select>

        {/* Prévia da seleção */}
        <div ref={boxRef} className="relative w-full overflow-hidden rounded-lg border bg-neutral-100 dark:bg-neutral-900" style={{ height: valor?.itemId ? boxH : 300 }}>
          {valor?.itemId ? (
            <>
              <iframe title={slot.titulo} src={`/imprimir/caderno-teste/${valor.cadernoId}?grupo=${valor.itemId}&embed=1`}
                className="bg-white" scrolling="no"
                style={{ border: 0, width: BASE_W, height: BASE_H, transform: `scale(${escala})`, transformOrigin: 'top left' }} />
              <a href={`/imprimir/caderno-teste/${valor.cadernoId}?grupo=${valor.itemId}&embed=1`} target="_blank" rel="noreferrer" title="Abrir em tela cheia" className="absolute right-2 top-2 rounded-md bg-background/90 p-1 shadow ring-1 ring-border hover:bg-background"><ExternalLink className="h-3.5 w-3.5" /></a>
            </>
          ) : ehPdf && valor?.pdfUrl ? (
            <>
              <PdfPreview url={valor.pdfUrl} titulo={slot.titulo} className="absolute inset-0" />
              <div className="absolute right-2 top-2 z-10 flex gap-1.5">
                <button onClick={() => fileRef.current?.click()} disabled={enviando} className="rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow ring-1 ring-border hover:bg-background disabled:opacity-60">Trocar</button>
                <button onClick={() => onPdf(null)} title="Remover" className="rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-destructive shadow ring-1 ring-border hover:bg-background"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </>
          ) : sel === 'pdf' ? (
            <button onClick={() => fileRef.current?.click()} disabled={enviando} className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-60">
              {enviando ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageUp className="h-6 w-6" />}
              <span className="text-xs font-medium">{enviando ? 'Enviando…' : 'Enviar PDF'}</span>
            </button>
          ) : (
            <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-muted-foreground">Selecione um caderno feito no editor{slot.pdf ? ' ou envie um PDF' : ''}.</div>
          )}
        </div>
        {slot.pdf && <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarPdf(f); e.currentTarget.value = '' }} />}
      </div>
    </div>
  )
}
