'use client'

// Campo de IMAGEM do admin: envia do COMPUTADOR (clique, arrastar e soltar ou Ctrl+V) para o storage via
// POST /api/admin/imagem e guarda a URL pública; "Usar URL" continua disponível como alternativa.
// Antes os campos de capa/banner/logo/favicon do admin só aceitavam URL colada.
//
// Duas formas:
//  - variant="area"  → área tracejada com prévia na proporção (`aspecto`, ex.: '16 / 9');
//  - variant="linha" → miniatura + botões numa linha (logo, favicon, campos compactos de formulário).
import { useRef, useState } from 'react'
import { ImageIcon, Link2, Loader2, Pencil, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { pedirTexto } from '@/components/ui/confirm-dialog'

const ACEITA = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/avif'

export async function enviarImagemAdmin(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch('/api/admin/imagem', { method: 'POST', body: fd })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j?.url) throw new Error(j?.error || 'Falha ao enviar a imagem.')
  return j.url as string
}

export function CampoImagem({
  value, onChange, disabled, variant = 'area', aspecto = '16 / 9', rotulo, compacto, textoVazio = 'Enviar imagem', className,
}: {
  value: string | null | undefined
  onChange: (url: string) => void
  disabled?: boolean
  variant?: 'area' | 'linha'
  /** CSS aspect-ratio da área (variant="area"). */
  aspecto?: string
  /** Legenda abaixo da área (ex.: "Horizontal · 16:9 · 1280 × 720"). */
  rotulo?: string
  /** Área baixa: ícone e texto lado a lado. */
  compacto?: boolean
  textoVazio?: string
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const v = (value ?? '').trim()

  async function enviar(file: File | null | undefined) {
    if (!file || disabled || enviando) return
    if (!file.type.startsWith('image/')) { toast.error('Escolha um arquivo de imagem (PNG, JPG, WEBP, GIF, SVG ou ICO).'); return }
    setEnviando(true)
    try { onChange(await enviarImagemAdmin(file)); toast.success('Imagem enviada.') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao enviar a imagem.') }
    finally { setEnviando(false) }
  }
  function escolher() { if (!disabled && !enviando) inputRef.current?.click() }
  async function usarUrl() {
    if (disabled) return
    const url = await pedirTexto({ titulo: 'Imagem por URL', label: 'Endereço da imagem (JPG, PNG, WEBP…)', placeholder: 'https://…', valorInicial: v.startsWith('http') ? v : '', confirmar: 'Usar imagem' })
    if (url === null) return
    onChange(url.trim())
  }
  const drop = {
    onDragOver: (e: React.DragEvent) => { if (disabled) return; e.preventDefault(); setArrastando(true) },
    onDragLeave: () => setArrastando(false),
    onDrop: (e: React.DragEvent) => { if (disabled) return; e.preventDefault(); setArrastando(false); void enviar(e.dataTransfer.files?.[0]) },
    onPaste: (e: React.ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void enviar(f) } },
  }
  const fileInput = <input ref={inputRef} type="file" accept={ACEITA} className="hidden" onChange={(e) => { void enviar(e.target.files?.[0]); e.currentTarget.value = '' }} />
  const acoes = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      {!disabled && <button type="button" onClick={escolher} disabled={enviando} className="font-medium text-primary hover:underline">{v ? 'Trocar' : 'Enviar do computador'}</button>}
      {!disabled && <button type="button" onClick={usarUrl} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Link2 className="h-3 w-3" />Usar URL</button>}
      {v && !disabled && <button type="button" onClick={() => onChange('')} className="text-muted-foreground hover:text-destructive">Remover</button>}
    </div>
  )

  if (variant === 'linha') {
    return (
      <div className={cn('flex min-w-0 items-center gap-3', className)} {...drop} tabIndex={-1}>
        {fileInput}
        <button type="button" onClick={escolher} disabled={disabled || enviando} title={v ? 'Trocar imagem' : 'Enviar imagem'}
          className={cn('flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted transition-colors', arrastando && 'border-primary bg-primary/10', !disabled && 'hover:border-primary')}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            : v ? <img src={v} alt="" className="h-full w-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
        </button>
        <div className="min-w-0 flex-1 space-y-0.5">
          <span className="block truncate text-xs text-muted-foreground" title={v || undefined}>{enviando ? 'Enviando…' : v ? (v.startsWith('data:') ? 'Imagem incorporada' : v.split('/').pop()) : 'Nenhuma imagem — envie, arraste ou cole (Ctrl+V)'}</span>
          {acoes}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {fileInput}
      <button type="button" onClick={escolher} disabled={disabled || enviando} {...drop}
        className={cn('group relative flex w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/20 text-center transition-colors',
          !disabled && 'hover:border-primary hover:bg-primary/5', arrastando && 'border-primary bg-primary/10', disabled && 'opacity-60')}
        style={{ aspectRatio: aspecto }}>
        {enviando ? (
          <span className="flex flex-col items-center gap-1 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-xs">Enviando…</span></span>
        ) : v ? (
          <>
            <img src={v} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            {!disabled && <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/0 text-xs font-medium text-transparent transition-colors group-hover:bg-black/40 group-hover:text-white"><Pencil className="h-3.5 w-3.5" />Trocar</span>}
          </>
        ) : (
          <span className={cn('flex flex-col items-center gap-1 px-2 text-muted-foreground', compacto && 'flex-row gap-2')}>
            <Upload className="h-5 w-5" />
            <span className="text-xs font-medium text-foreground">{arrastando ? 'Solte a imagem aqui' : textoVazio}</span>
            {!compacto && <span className="text-[11px]">clique, arraste ou cole</span>}
          </span>
        )}
      </button>
      <div className="flex items-center justify-between gap-2">
        {rotulo ? <span className="text-[11px] text-muted-foreground">{rotulo}</span> : <span />}
        {acoes}
      </div>
    </div>
  )
}

