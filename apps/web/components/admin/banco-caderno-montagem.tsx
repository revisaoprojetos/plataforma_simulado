'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BarChart3, ClipboardList, FileText, BookOpenCheck, ExternalLink, Loader2, FileUp, Trash2, Plus, Pencil, FolderOpen, X, FileType2, Search, ChevronRight } from 'lucide-react'
import { PdfPreview } from '@/components/admin/pdf-preview'
import { salvarMontagem, criarCadernoParaSlot, listarArvoreModelosOffice, previaOnlyOffice, type EntregaSlots, type EntregaRef, type MontagemGrupo, type DocOffice, type PastaModelo, type TrechoPrevia } from '@/app/admin/cadernos-teste/actions'
import { abrirEdicaoDocx, thumbDocumento } from '@/app/admin/biblioteca/actions'
import { DrivePastaStyles } from '@/components/admin/pasta-card-drive'

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
  const ehOffice = !!valor?.docId
  const diag = slot.chave === 'diagnostico' // seletor de origem (Modelos × Editor beta) só no Diagnóstico
  const [fonte, setFonte] = useState<'modelos' | 'office'>(ehOffice ? 'office' : 'modelos')
  const [pickerOffice, setPickerOffice] = useState(false)
  const [docsOffice, setDocsOffice] = useState<DocOffice[]>([])
  const [pastasOffice, setPastasOffice] = useState<PastaModelo[]>([])
  const [breadcrumbOffice, setBreadcrumbOffice] = useState<PastaModelo[]>([])
  const [thumbsOffice, setThumbsOffice] = useState<Record<string, string>>({})
  const [carregandoDocs, setCarregandoDocs] = useState(false)
  const [buscaDoc, setBuscaDoc] = useState('')
  const [abrindoEditor, setAbrindoEditor] = useState(false)

  async function carregarModelos(pastaId: string | null) {
    setCarregandoDocs(true)
    try {
      const r = await listarArvoreModelosOffice(pastaId)
      setDocsOffice(r.docs); setPastasOffice(r.pastas); setBreadcrumbOffice(r.breadcrumb); setThumbsOffice(r.thumbs)
    } finally { setCarregandoDocs(false) }
  }
  async function abrirPickerOffice() { setPickerOffice(true); setBuscaDoc(''); await carregarModelos(null) }
  async function editarOffice() {
    if (!valor?.docId) return
    setAbrindoEditor(true)
    const r = await abrirEdicaoDocx(valor.docId)
    setAbrindoEditor(false)
    if (!r.ok || !r.versaoId) { toast.error(r.error || 'Falha ao abrir o editor.'); return }
    window.location.href = `/admin/biblioteca/editar/${r.versaoId}`
  }

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
          ) : ehOffice ? (
            <div className="absolute inset-0 overflow-hidden bg-white dark:bg-neutral-950">
              <CapaFielOffice docId={valor!.docId!} baseW={BASE_W} escala={escala} />
            </div>
          ) : (
            /* VAZIO: criar (editor), importar PDF (enunciado/gabarito) ou selecionar um caderno já pronto. */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
              <Icon className="h-9 w-9 text-muted-foreground/30" />
              {/* Diagnóstico: escolher de onde vem — Modelos (construtor) ou Editor beta (OnlyOffice). */}
              {diag && (
                <div className="flex items-center rounded-lg border p-0.5 text-[11px] font-medium">
                  <button type="button" onClick={() => setFonte('modelos')} className={`rounded-md px-2.5 py-1 ${fonte === 'modelos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Modelos</button>
                  <button type="button" onClick={() => setFonte('office')} className={`rounded-md px-2.5 py-1 ${fonte === 'office' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Editor beta</button>
                </div>
              )}
              {diag && fonte === 'office' ? (
                <>
                  <p className="text-xs text-muted-foreground">Puxar um documento .docx da Biblioteca (OnlyOffice).</p>
                  <button type="button" onClick={abrirPickerOffice}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90" style={{ background: cor }}>
                    <FileType2 className="h-3.5 w-3.5" /> Selecionar documento
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
        </div>

        {/* Ações do que já está no slot */}
        {(ehCaderno || ehPdf || ehOffice) && (
          <div className="flex items-center gap-1.5">
            {ehCaderno && (
              <Link href={`/admin/cadernos-teste/${valor!.cadernoId}?grupo=${valor!.itemId}`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90" style={{ background: cor }}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Link>
            )}
            {ehOffice && (
              <button type="button" onClick={editarOffice} disabled={abrindoEditor}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60" style={{ background: cor }}>
                {abrindoEditor ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />} Editar no OnlyOffice
              </button>
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

      {/* Pop-up: selecionar um documento .docx da Biblioteca (editor beta / OnlyOffice) como diagnóstico. */}
      {pickerOffice && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setPickerOffice(false)}>
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white" style={{ background: cor }}><FileType2 className="h-3.5 w-3.5" /></span>
                <h3 className="truncate text-sm font-semibold">Modelos de caderno — Diagnóstico (editor beta)</h3>
              </div>
              <button type="button" onClick={() => setPickerOffice(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="border-b px-3 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={buscaDoc} onChange={(e) => setBuscaDoc(e.target.value)} placeholder="Buscar documento…" className="h-8 w-full rounded-lg border bg-background pl-8 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
              </div>
            </div>
            {/* Breadcrumb (Modelos > pasta > subpasta) */}
            <div className="flex flex-wrap items-center gap-0.5 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
              <button type="button" onClick={() => { setBuscaDoc(''); carregarModelos(null) }} className="rounded px-1 py-0.5 font-medium hover:bg-muted hover:text-foreground">Modelos</button>
              {breadcrumbOffice.map((b) => (
                <span key={b.id} className="flex min-w-0 items-center gap-0.5">
                  <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                  <button type="button" onClick={() => { setBuscaDoc(''); carregarModelos(b.id) }} className="max-w-[9rem] truncate rounded px-1 py-0.5 hover:bg-muted hover:text-foreground">{b.nome}</button>
                </span>
              ))}
            </div>
            <div className="scroll-claro max-h-[58vh] overflow-y-auto p-3">
              <DrivePastaStyles />
              {carregandoDocs ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
              ) : (() => {
                const busca = buscaDoc.trim().toLowerCase()
                const pastasF = pastasOffice.filter((p) => p.nome.toLowerCase().includes(busca))
                const docsF = docsOffice.filter((d) => d.titulo.toLowerCase().includes(busca))
                if (pastasF.length === 0 && docsF.length === 0) {
                  return <div className="px-2 py-12 text-center text-xs text-muted-foreground">{busca ? 'Nada encontrado nesta pasta.' : <>Nenhum modelo de caderno aqui. Crie/publique em <span className="font-medium text-foreground">Biblioteca → Modelos de Caderno</span>.</>}</div>
                }
                return (
                  <div className="space-y-4">
                    {/* Pastas — MESMO card da Biblioteca (estilo Google Drive), sem o menu de gestão. */}
                    {pastasF.length > 0 && (
                      <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pastas</div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {pastasF.map((p) => (
                            <div key={p.id} className="gd-folder-card" role="button" tabIndex={0} title={p.nome}
                              onClick={() => { setBuscaDoc(''); carregarModelos(p.id) }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBuscaDoc(''); carregarModelos(p.id) } }}>
                              <span className="gd-ico-wrap">
                                <svg className="gd-ico" viewBox="0 0 24 24" style={{ fill: p.cor || 'var(--gd-folder)' }}>
                                  <path d="M10 4H4c-1.1 0-2 .9-2 2v2h20c0-1.1-.9-2-2-2h-8l-2-2z" />
                                  <path className="gd-flap" d="M2 8v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8H2z" />
                                </svg>
                              </span>
                              <span className="gd-name" title={p.nome}>{p.nome}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Modelos (documentos) — card A4 3:4 igual à Biblioteca, título embaixo em até 2 linhas. */}
                    {docsF.length > 0 && (
                      <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modelos</div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {docsF.map((d) => {
                            const on = valor?.docId === d.id
                            return (
                              <button key={d.id} type="button" title={d.titulo}
                                onClick={() => { onSet({ docId: d.id, versaoId: d.versaoAtualId }); setPickerOffice(false) }}
                                className={`group relative overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${on ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/40'}`}>
                                <div className="relative aspect-[3/4] overflow-hidden border-b bg-neutral-100 dark:bg-neutral-800">
                                  {thumbsOffice[d.id] ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={thumbsOffice[d.id]} alt="" className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]" />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center"><FileType2 className="h-8 w-8 text-muted-foreground/40" /></span>
                                  )}
                                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.04] to-transparent" />
                                  {on && <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground shadow">Atual</span>}
                                </div>
                                <span className="line-clamp-2 block w-full min-h-[2.4rem] break-words px-2 py-1.5 text-[11.5px] font-medium leading-tight text-foreground">{d.titulo}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** Prévia FIEL (igual à capa do card da Biblioteca): imagem da 1ª página renderizada do .docx (OnlyOffice).
 *  Enquanto gera, mostra um loader; se falhar, cai na FolhaPrevia (trechos). */
function CapaFielOffice({ docId, baseW, escala }: { docId: string; baseW: number; escala: number }) {
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    let vivo = true
    thumbDocumento(docId, { latest: true }).then((r) => { if (vivo) { if (r.url) setUrl(r.url); else setFalhou(true) } }).catch(() => vivo && setFalhou(true))
    return () => { vivo = false }
  }, [docId])
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" className="absolute inset-0 h-full w-full bg-white object-contain" />
  if (falhou) return <FolhaPrevia docId={docId} baseW={baseW} escala={escala} />
  return <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-neutral-950"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
}

/** Prévia da "folha" de um documento da Biblioteca (trechos da versão atual), escalada à largura do card. */
function FolhaPrevia({ docId, baseW, escala }: { docId: string; baseW: number; escala: number }) {
  const [trechos, setTrechos] = useState<TrechoPrevia[] | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let vivo = true
    previaOnlyOffice(docId).then((r) => { if (!vivo) return; if (r.ok) setTrechos(r.trechos); else setErro(true) }).catch(() => vivo && setErro(true))
    return () => { vivo = false }
  }, [docId])
  if (erro) return <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">Não foi possível carregar a prévia.</div>
  if (!trechos) return <div className="flex h-full items-center justify-center gap-2 p-4 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando folha…</div>
  return (
    <div style={{ width: baseW, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
      <div className="mx-auto bg-white px-16 py-14 text-[15px] leading-relaxed text-neutral-900" style={{ width: baseW, minHeight: 1123 }}>
        {trechos.length === 0 ? <p className="text-neutral-400">Documento sem conteúdo estruturado.</p> : trechos.map((t, i) => {
          if (t.tipo === 'titulo') return <h2 key={i} className="mb-2 mt-4 text-xl font-bold">{t.texto}</h2>
          if (t.tipo === 'capitulo') return <h3 key={i} className="mb-1 mt-3 text-base font-semibold text-neutral-600">{t.texto}</h3>
          return <p key={i} className="mb-2">{t.texto}</p>
        })}
      </div>
    </div>
  )
}
