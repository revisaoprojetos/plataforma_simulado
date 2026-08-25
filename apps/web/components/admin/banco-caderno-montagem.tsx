'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BarChart3, ClipboardList, FileText, BookOpenCheck, ExternalLink, Loader2, FileUp, Trash2, Plus, Pencil, FolderOpen, X } from 'lucide-react'
import { PdfPreview } from '@/components/admin/pdf-preview'
import { salvarMontagem, criarCadernoParaSlot, type EntregaSlots, type EntregaRef, type MontagemGrupo } from '@/app/admin/cadernos-teste/actions'

type SlotKey = 'diagnostico' | 'folha' | 'enunciado' | 'gabarito'
type SlotDef = { chave: SlotKey; titulo: string; icon: typeof FileText; pdf: boolean }
const SLOTS_BASE: SlotDef[] = [
  { chave: 'diagnostico', titulo: 'Diagnóstico', icon: BarChart3, pdf: false },
  { chave: 'folha', titulo: 'Folha de Resposta', icon: ClipboardList, pdf: false },
  { chave: 'enunciado', titulo: 'Caderno de Enunciado', icon: FileText, pdf: true },
  { chave: 'gabarito', titulo: 'Gabarito Comentado', icon: BookOpenCheck, pdf: true },
]
// Modalidades de caderno do construtor que servem a cada slot (p/ "selecionar caderno pronto").
const MODS_SLOT: Record<SlotKey, string[]> = {
  diagnostico: ['diagnostico'],
  folha: ['folha_respostas'],
  enunciado: ['caderno_questoes', 'caderno_completo'],
  gabarito: ['caderno_questoes', 'caderno_completo'],
}

/** Entrega do aluno: cada card cria/edita/importa DIRETO (sem selecionar de uma lista). O que fica no
 *  slot é salvo em simulado_pastas.caderno_entrega — Diagnóstico/Folha viram um caderno (editor);
 *  Enunciado/Gabarito podem virar caderno OU PDF importado. */
export function BancoCadernoMontagem({ bancoId, cor, entregaInicial, grupos = [], discursivo = false }: {
  bancoId: string; cor: string; entregaInicial: EntregaSlots; grupos?: MontagemGrupo[]; discursivo?: boolean
}) {
  // Banco DISCURSIVO: o "Gabarito Comentado" também funciona como ESPELHO da correção (função dupla).
  const SLOTS: SlotDef[] = discursivo
    ? SLOTS_BASE.map((s) => (s.chave === 'gabarito' ? { ...s, titulo: 'Gabarito / Espelho' } : s))
    : SLOTS_BASE
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">O que o aluno recebe — clique em cada card para criar, editar ou importar</p>
        {salvando && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> salvando…</span>}
      </div>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {SLOTS.map((s) => (
          <SlotCard key={s.chave} slot={s} cor={cor} bancoId={bancoId} valor={entrega[s.chave] ?? null}
            prontos={grupos.filter((g) => MODS_SLOT[s.chave].includes(g.modalidade))}
            onSet={(ref) => setSlot(s.chave, ref)} />
        ))}
      </div>
    </div>
  )
}

function SlotCard({ slot, cor, bancoId, valor, prontos, onSet }: {
  slot: SlotDef; cor: string; bancoId: string; valor: EntregaRef; prontos: MontagemGrupo[]; onSet: (ref: EntregaRef) => void
}) {
  const Icon = slot.icon
  const router = useRouter()
  const [criando, startCriar] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [pickerAberto, setPickerAberto] = useState(false)
  const ehCaderno = !!valor?.itemId
  const ehPdf = !!valor?.pdfUrl

  // Escala da prévia do caderno: mostra a folha A4 ajustada à largura do card (rola pelas folhas).
  const BASE_W = 794, BASE_H = 1123
  const boxRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(300)
  useEffect(() => {
    const el = boxRef.current; if (!el) return
    const upd = () => setW(el.clientWidth || 300)
    upd(); const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect()
  }, [])
  const escala = w / BASE_W
  const [contentH, setContentH] = useState(BASE_H)
  const ALTURA_SLOT = 380
  useEffect(() => { setContentH(BASE_H) }, [valor?.cadernoId, valor?.itemId])

  // Cria um caderno da modalidade do slot JÁ associado à entrega e abre o editor.
  function criar() {
    startCriar(async () => {
      const r = await criarCadernoParaSlot(bancoId, slot.chave)
      if (r.ok && r.cadernoId) { toast.success(`${slot.titulo} criado`); router.push(`/admin/cadernos-teste/${r.cadernoId}${r.itemId ? `?grupo=${r.itemId}` : ''}`) }
      else toast.error(r.error ?? 'Erro ao criar')
    })
  }

  async function enviarPdf(file: File) {
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast.error('Envie um PDF.'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('PDF muito grande (máx. ~8 MB).'); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('alvo', 'entrega'); fd.append('bancoId', bancoId); fd.append('slot', slot.chave)
      const resp = await fetch('/api/admin/material-pdf', { method: 'POST', body: fd })
      const r = await resp.json().catch(() => ({ ok: false }))
      if (!resp.ok || !r.ok) { toast.error(r.error ?? 'Falha ao enviar o PDF.'); return }
      onSet({ pdfUrl: r.url, pdfNome: r.nome })
      toast.success('PDF enviado')
    } finally { setEnviando(false) }
  }

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border-2 bg-card shadow-sm" style={{ borderColor: `${cor}55` }}>
      <div className="flex items-center gap-2 border-b px-2.5 py-2" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent)` }}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white shadow-sm" style={{ background: cor }}><Icon className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={slot.titulo}>{slot.titulo}</span>
        {prontos.length > 0 && (
          <button type="button" onClick={() => setPickerAberto(true)} title="Selecionar um caderno já pronto do construtor"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><FolderOpen className="h-3.5 w-3.5" /></button>
        )}
        {ehCaderno && (
          <a href={`/imprimir/caderno-teste/${valor!.cadernoId}?grupo=${valor!.itemId}&embed=1`} target="_blank" rel="noreferrer" title="Abrir em tela cheia"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>
        )}
        {ehPdf && (
          <a href={valor!.pdfUrl} target="_blank" rel="noreferrer" title="Abrir PDF"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>
        )}
      </div>

      <div className="space-y-2 p-2.5">
        <div ref={boxRef} className="relative w-full overflow-hidden rounded-lg border bg-neutral-100 dark:bg-neutral-900" style={{ height: ALTURA_SLOT }}>
          {ehCaderno ? (
            <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
              <div style={{ width: w, height: Math.round(contentH * escala) }}>
                <iframe title={slot.titulo} src={`/imprimir/caderno-teste/${valor!.cadernoId}?grupo=${valor!.itemId}&embed=1`} className="bg-white" scrolling="no"
                  onLoad={(e) => {
                    const ifr = e.currentTarget as HTMLIFrameElement
                    const ler = () => { try { const d = ifr.contentDocument; const h = Math.max(d?.body?.scrollHeight || 0, d?.documentElement?.scrollHeight || 0); if (h > 100) setContentH((p) => Math.max(p, h)) } catch { /* cross-origin */ } }
                    ler();[300, 700, 1200, 2000, 3000].forEach((ms) => setTimeout(ler, ms))
                  }}
                  style={{ border: 0, width: BASE_W, height: contentH, transform: `scale(${escala})`, transformOrigin: 'top left' }} />
              </div>
            </div>
          ) : ehPdf ? (
            <PdfPreview url={valor!.pdfUrl!} titulo={slot.titulo} className="absolute inset-0" />
          ) : (
            /* VAZIO: criar (editor), importar PDF (enunciado/gabarito) ou selecionar um caderno já pronto. */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
              <Icon className="h-9 w-9 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Nada aqui ainda.</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={criar} disabled={criando}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60" style={{ background: cor }}>
                  {criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Criar
                </button>
                {slot.pdf && (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60">
                    {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />} Importar PDF
                  </button>
                )}
              </div>
              {prontos.length > 0 && (
                <button type="button" onClick={() => setPickerAberto(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
                  <FolderOpen className="h-3.5 w-3.5" /> Selecionar pronto
                </button>
              )}
            </div>
          )}
        </div>

        {/* Ações do que já está no slot */}
        {(ehCaderno || ehPdf) && (
          <div className="flex items-center gap-1.5">
            {ehCaderno && (
              <Link href={`/admin/cadernos-teste/${valor!.cadernoId}?grupo=${valor!.itemId}`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90" style={{ background: cor }}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Link>
            )}
            {ehPdf && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60">
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />} Trocar PDF
              </button>
            )}
            <button type="button" onClick={() => onSet(null)} title="Remover deste slot"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:border-destructive/50 hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {slot.pdf && <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarPdf(f); e.currentTarget.value = '' }} />}
      </div>

      {/* Pop-up: selecionar um caderno já pronto do construtor (só os da modalidade deste slot). */}
      {pickerAberto && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setPickerAberto(false)}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white" style={{ background: cor }}><Icon className="h-3.5 w-3.5" /></span>
                <h3 className="truncate text-sm font-semibold">Selecionar {slot.titulo} pronto</h3>
              </div>
              <button type="button" onClick={() => setPickerAberto(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-claro max-h-[62vh] space-y-1.5 overflow-y-auto p-3">
              {prontos.map((g) => {
                const on = valor?.cadernoId === g.cadernoId && valor?.itemId === g.itemId
                return (
                  <div key={`${g.cadernoId}::${g.itemId}`} className={`flex items-center gap-1 rounded-lg border transition-colors ${on ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50 hover:bg-muted/40'}`}>
                    <button type="button" onClick={() => { onSet({ cadernoId: g.cadernoId, itemId: g.itemId }); setPickerAberto(false) }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium leading-tight">{g.cadernoNome}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{g.label}</span>
                      </span>
                    </button>
                    <a href={`/imprimir/caderno-teste/${g.cadernoId}?grupo=${g.itemId}&embed=1`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Abrir prévia"
                      className="mr-1.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
