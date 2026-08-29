'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { FileText, FileCheck2, Loader2, Upload, Trash2, ClipboardCheck, ClipboardList, RefreshCw } from 'lucide-react'
import { MODALIDADES, metaDaModalidade, novoItem, presetDoModelo } from '@/lib/caderno-teste/tipos'
import { Previa } from '@/lib/caderno-teste/previa'
import { PreviaBlocos } from '@/lib/caderno-teste/previa-blocos'
import { ModeloPicker } from '@/components/admin/caderno-teste/modelo-picker'
import { PdfPreview } from '@/components/admin/pdf-preview'
import { useCriar, useGuardStep, type PdfRef } from '../criar-context'

const FOLHA_MODELOS = MODALIDADES.find((m) => m.id === 'folha_respostas')?.modelos ?? []
const SEM_QUESTOES: never[] = [] // referência estável (evita re-render em loop no PreviaBlocos)

// Alturas: caixa VAZIA fica no tamanho base; com conteúdo a prévia é bem mais alta.
const H_VAZIO = 'h-56'          // 224px — base (não muda quando não há nada)
const H_PREVIA = 'h-[520px]'    // prévia (folha selecionada ou PDF importado)

export default function CadernosPage() {
  useGuardStep(2)
  const { draft, patch } = useCriar()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const folhaSel = FOLHA_MODELOS.find((m) => m.id === draft.folhaModeloId) ?? null

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Escolha a folha de respostas (modelo do sistema) e, se quiser, anexe os PDFs de enunciado e gabarito. (Opcional.)</p>

      {/* 3 cards lado a lado. items-start: cada card cresce só quando tem conteúdo. */}
      <section className="grid items-start gap-4 lg:grid-cols-3">
        {/* Folha de resposta — abre o mesmo pop-up de modelos, com prévia rolável. */}
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <CardHeader icon={ClipboardCheck} titulo="Folha de resposta" desc="Modelo do sistema." />
          {folhaSel ? (
            <>
              <div className={`${H_PREVIA} overflow-hidden rounded-xl border bg-white`}>
                <FolhaPreviaScroll modeloId={folhaSel.id} nomeSimulado={draft.simuladoNome} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium" title={folhaSel.nome}>{folhaSel.nome}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setPickerOpen(true)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Trocar modelo"><RefreshCw className="h-4 w-4" /></button>
                  <button type="button" onClick={() => patch({ folhaModeloId: null })} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remover"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setPickerOpen(true)}
              className={`flex ${H_VAZIO} flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground`}>
              <ClipboardList className="h-6 w-6" />
              Escolher modelo
            </button>
          )}
        </div>

        <PdfUploader
          icon={FileText}
          titulo="Caderno de enunciado"
          desc="PDF pronto da prova (sem gabarito)."
          slot="enunciado"
          atual={draft.enunciadoPdf}
          onChange={(v) => patch({ enunciadoPdf: v })}
        />
        <PdfUploader
          icon={FileCheck2}
          titulo="Caderno de gabarito"
          desc="PDF pronto do gabarito/respostas."
          slot="gabarito"
          atual={draft.gabaritoPdf}
          onChange={(v) => patch({ gabaritoPdf: v })}
        />
      </section>

      {/* Mesmo pop-up de modelos da área de cadernos, travado na folha de respostas.
          Portado ao body: a etapa vive dentro de um wrapper com transform (animate-page),
          que quebra o position:fixed do modal se ele ficar no fluxo da página. */}
      {mounted && createPortal(
        <ModeloPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          atual={{ modalidade: 'folha_respostas', modelo: draft.folhaModeloId ?? (FOLHA_MODELOS[0]?.id ?? '') }}
          onSelecionar={(_, modelo) => { patch({ folhaModeloId: modelo }); setPickerOpen(false) }}
          onEmBranco={() => {}}
          travarModalidade
        />,
        document.body,
      )}
    </div>
  )
}

/** Prévia A4 da folha escalada à largura do card, com rolagem vertical (igual à do PDF).
 *  Passa o nome do simulado só pela variável {simulado} — se o modelo NÃO tiver esse subtítulo,
 *  nada é adicionado (respeita o modelo); se tiver, mostra o nome; se o nome for vazio, mantém o
 *  default do próprio modelo. */
function FolhaPreviaScroll({ modeloId, nomeSimulado }: { modeloId: string; nomeSimulado: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.35)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => { const w = el.clientWidth; if (w > 10) setScale(w / 794) }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const preset = presetDoModelo('folha_respostas', modeloId) // modelo pronto → render por blocos (v1)
  const it = novoItem('folha_respostas', modeloId) // p/ variantes doc-backed (docEdit)
  const nome = nomeSimulado.trim()
  const vars: Record<string, string> = nome ? { simulado: nome } : {}
  return (
    <div ref={ref} className="h-full w-full overflow-y-auto overflow-x-hidden bg-white">
      {/* Caixa dimensionadora (altura já escalada) segura o scroll; o A4 real (794px) fica escalado dentro. */}
      <div style={{ position: 'relative', height: Math.round(1123 * scale) }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="pointer-events-none">
          {preset
            ? <PreviaBlocos presetId={preset} questoes={SEM_QUESTOES} vars={vars} titulo={nome || metaDaModalidade('folha_respostas').nome} docOverride={it.docEdit} />
            : <Previa item={it} questoes={SEM_QUESTOES} vars={vars} />}
        </div>
      </div>
    </div>
  )
}

function CardHeader({ icon: Icon, titulo, desc }: { icon: React.ComponentType<{ className?: string }>; titulo: string; desc: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-[18px] w-[18px]" /></span>
      <div>
        <p className="text-sm font-semibold leading-tight">{titulo}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}

function PdfUploader({ icon: Icon, titulo, desc, slot, atual, onChange }: {
  icon: React.ComponentType<{ className?: string }>
  titulo: string
  desc: string
  slot: 'enunciado' | 'gabarito'
  atual: PdfRef | null
  onChange: (v: PdfRef | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(file: File | null) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toast.error('Selecione um PDF.'); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('alvo', 'draft')
      fd.set('slot', slot)
      const res = await fetch('/api/admin/material-pdf', { method: 'POST', body: fd })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok || !j.url) { toast.error(j?.error ?? 'Falha ao enviar o PDF.'); return }
      onChange({ url: j.url, nome: j.nome ?? file.name })
    } catch {
      toast.error('Falha ao enviar o PDF.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <CardHeader icon={Icon} titulo={titulo} desc={desc} />
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => enviar(e.target.files?.[0] ?? null)} />
      {atual ? (
        <>
          <div className={`relative ${H_PREVIA} overflow-hidden rounded-xl border bg-white`}>
            <PdfPreview url={atual.url} titulo={titulo} className="absolute inset-0" />
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <a href={atual.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline" title={atual.nome}>{atual.nome}</a>
            <button type="button" onClick={() => inputRef.current?.click()} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Trocar"><Upload className="h-4 w-4" /></button>
            <button type="button" onClick={() => onChange(null)} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remover"><Trash2 className="h-4 w-4" /></button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={enviando}
          className={`flex ${H_VAZIO} flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60`}>
          {enviando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
          {enviando ? 'Enviando…' : 'Enviar PDF'}
        </button>
      )}
    </div>
  )
}
