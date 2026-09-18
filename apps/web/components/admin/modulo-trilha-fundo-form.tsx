'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, ImagePlus, Trash2, ImageIcon, Crop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarTrilhaFundoModulo } from '@/app/admin/leitura/actions'
import { DEFAULT_TRILHA_FUNDO, DEFAULT_TRILHA_DEGRADE_IMAGEM, DEGRADE_DIRS, estiloDegrade, type TrilhaAparencia, type TrilhaFundoConfig, type TrilhaCrop, type TrilhaDegrade } from '@/lib/leitura/trilha-aparencia'
import { TrilhaFundoCropper } from '@/components/admin/trilha-fundo-cropper'
import { useRegistrarSalvavel } from '@/components/admin/config-modulo-salvar'

/** Estilo CSS que reproduz o recorte (mesma lógica do render da trilha). */
function estiloFundo(fundo: TrilhaFundoConfig, url: string): React.CSSProperties {
  const opacity = fundo.opacidade / 100
  const filter = fundo.desfoque > 0 ? `blur(${fundo.desfoque}px)` : undefined
  const scale = fundo.desfoque > 0 ? 'scale(1.06)' : undefined
  const c = fundo.crop
  if (c && c.w > 0 && c.h > 0) {
    return {
      backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat',
      backgroundSize: `${100 / c.w}% ${100 / c.h}%`,
      backgroundPosition: `${c.w < 1 ? (c.x / (1 - c.w)) * 100 : 0}% ${c.h < 1 ? (c.y / (1 - c.h)) * 100 : 0}%`,
      opacity, filter, transform: scale,
    }
  }
  return { backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center', opacity, filter, transform: scale }
}

/**
 * Configuração da IMAGEM DE FUNDO da trilha personalizada — aba Configurações, abaixo do banner. Envia a
 * imagem, "Ajustar" abre um recorte com quadro redimensionável (muda a PROPORÇÃO/posição pelas alças) +
 * desfoque/transparência. O recorte é guardado como retângulo (frações) e aplicado por CSS — aparece
 * igual no construtor e na trilha do aluno. Salva mesclando (não apaga posições/curvas/escala/símbolos).
 */
export function ModuloTrilhaFundoForm({ pastaId, atual, capa }: { pastaId: string; atual: TrilhaAparencia; capa?: string | null }) {
  const [fundo, setFundoState] = useState<TrilhaFundoConfig>(atual.livre.fundo ?? DEFAULT_TRILHA_FUNDO)
  const [aspecto, setAspecto] = useState<number>(atual.livre.aspecto ?? 0.8)
  const [degradeTrilha, setDegradeTrilha] = useState<TrilhaDegrade>(atual.degradeTrilha ?? DEFAULT_TRILHA_DEGRADE_IMAGEM)
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [cropAberto, setCropAberto] = useState(false)
  const setFundo = (patch: Partial<TrilhaFundoConfig>) => setFundoState((f) => ({ ...f, ...patch }))
  const preview = fundo.url ?? capa ?? null
  const baseRef = useRef(JSON.stringify({ fundo: atual.livre.fundo ?? DEFAULT_TRILHA_FUNDO, aspecto: atual.livre.aspecto ?? 0.8, degradeTrilha: atual.degradeTrilha ?? DEFAULT_TRILHA_DEGRADE_IMAGEM }))
  const dirty = JSON.stringify({ fundo, aspecto, degradeTrilha }) !== baseRef.current

  async function enviar(file: File) {
    setEnviando(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/admin/leitura/trilha-fundo', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Falha no upload.')
      setFundoState((f) => ({ ...f, url: j.url, crop: null }))
      if (typeof window !== 'undefined') {
        const img = new window.Image()
        img.onload = () => { if (img.naturalWidth > 0 && img.naturalHeight > 0) setAspecto(Math.max(0.25, Math.min(4, img.naturalWidth / img.naturalHeight))) }
        img.src = j.url
      }
      toast.success('Imagem enviada. Clique em "Ajustar" para recortar/enquadrar.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha no upload.') }
    finally { setEnviando(false) }
  }

  function onCropConfirm(crop: TrilhaCrop, novoAspecto: number) {
    setFundo({ crop })
    setAspecto(novoAspecto)
    setCropAberto(false)
    toast.success('Recorte aplicado — clique em Salvar para publicar.')
  }

  async function salvarCore(): Promise<boolean> {
    const r = await salvarTrilhaFundoModulo(pastaId, { fundo, aspecto, degradeTrilha })
    if (r.ok) { baseRef.current = JSON.stringify({ fundo, aspecto, degradeTrilha }); return true }
    return false
  }
  function salvar() {
    start(async () => {
      const ok = await salvarCore()
      if (ok) toast.success('Imagem de fundo da trilha salva.')
      else toast.error('Erro ao salvar')
    })
  }
  // Salvar único da aba Config: esconde o botão próprio e registra dirty + salvar.
  const noSalvarUnico = useRegistrarSalvavel(`${pastaId}:trilha-fundo`, dirty, salvarCore)

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ImageIcon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">Imagem de fundo da trilha</h3>
            <p className="max-w-2xl text-xs text-muted-foreground">Fundo da trilha <strong>Personalizada</strong>. Envie a imagem e use <strong>Ajustar</strong> para recortar e mudar a proporção. Sem imagem própria, usa a capa do módulo.</p>
          </div>
        </div>
        {!noSalvarUnico && (
          <button type="button" onClick={salvar} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[260px_minmax(0,1fr)]">
        {/* Prévia (reflete o recorte exatamente como o aluno vê) */}
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl border bg-muted" style={{ aspectRatio: aspecto }}>
            {preview
              ? <div className="absolute inset-0" style={estiloFundo(fundo, preview)} />
              : <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">Sem imagem — usa a capa do módulo.</div>}
            {/* Degradê ao vivo por cima da prévia (mesma fórmula da trilha do aluno). */}
            {degradeTrilha.ativo && <div className="pointer-events-none absolute inset-0" style={estiloDegrade(degradeTrilha)} />}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = '' }} />
          <div className="flex gap-2">
            <button type="button" disabled={enviando} onClick={() => fileRef.current?.click()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-card py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50">
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {fundo.url ? 'Trocar imagem' : 'Enviar imagem'}
            </button>
            {fundo.url && (
              <button type="button" onClick={() => setFundoState((f) => ({ ...f, url: null, crop: null }))} title="Remover imagem própria"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {preview && (
            <button type="button" onClick={() => setCropAberto(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-primary/10 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15">
              <Crop className="h-3.5 w-3.5" /> Ajustar (recortar / mudar proporção)
            </button>
          )}
          <p className="text-[11px] text-muted-foreground">PNG/JPG/WEBP/AVIF · até 8MB.</p>
        </div>

        {/* Ajustes visuais */}
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Desfoque</span><span className="tabular-nums">{fundo.desfoque}px</span></span>
            <input type="range" min={0} max={24} step={1} value={fundo.desfoque} onChange={(e) => setFundo({ desfoque: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Transparência</span><span className="tabular-nums">{100 - fundo.opacidade}%</span></span>
            <input type="range" min={0} max={100} step={1} value={100 - fundo.opacidade} onChange={(e) => setFundo({ opacidade: 100 - Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
          </label>
          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-xs font-semibold">Degradê no topo da imagem</span>
                <span className="block text-[11px] text-muted-foreground">Escurece o topo da imagem da trilha p/ ligá-la ao banner. Independente do fade do banner. Desligue p/ deixar a imagem mais clara.</span>
              </span>
              <input type="checkbox" checked={degradeTrilha.ativo} onChange={(e) => setDegradeTrilha((d) => ({ ...d, ativo: e.target.checked }))} className="h-4 w-4 shrink-0 accent-[var(--primary)]" />
            </label>
            <label className={cn('block', !degradeTrilha.ativo && 'pointer-events-none opacity-50')}>
              <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Intensidade do degradê</span><span className="tabular-nums">{degradeTrilha.intensidade}%</span></span>
              <input type="range" min={0} max={100} step={1} value={degradeTrilha.intensidade} disabled={!degradeTrilha.ativo} onChange={(e) => setDegradeTrilha((d) => ({ ...d, intensidade: Number(e.target.value) }))} className="w-full accent-[var(--primary)]" />
            </label>
            <label className={cn('block', !degradeTrilha.ativo && 'pointer-events-none opacity-50')}>
              <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Comprimento do degradê</span><span className="tabular-nums">{degradeTrilha.comprimento}%</span></span>
              <input type="range" min={5} max={100} step={1} value={degradeTrilha.comprimento} disabled={!degradeTrilha.ativo} onChange={(e) => setDegradeTrilha((d) => ({ ...d, comprimento: Number(e.target.value) }))} className="w-full accent-[var(--primary)]" />
            </label>
            <div className={cn('flex flex-wrap items-center justify-between gap-3', !degradeTrilha.ativo && 'pointer-events-none opacity-50')}>
              <label className="inline-flex min-w-[160px] flex-1 items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Direção</span>
                <select value={degradeTrilha.direcao} disabled={!degradeTrilha.ativo} onChange={(e) => setDegradeTrilha((d) => ({ ...d, direcao: e.target.value as TrilhaDegrade['direcao'] }))}
                  className="h-8 flex-1 rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-xs outline-none focus:ring-1 focus:ring-ring">
                  {DEGRADE_DIRS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label className="inline-flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Cor</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{degradeTrilha.cor}</span>
                <input type="color" value={degradeTrilha.cor} disabled={!degradeTrilha.ativo} onChange={(e) => setDegradeTrilha((d) => ({ ...d, cor: e.target.value }))} className="h-7 w-10 cursor-pointer rounded border bg-transparent p-0.5" />
              </label>
            </div>
          </div>
          <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
            A <strong>proporção</strong> e o <strong>enquadramento</strong> vêm do <strong>Ajustar</strong>: arraste o quadro para posicionar e puxe as alças das bordas para mudar o formato. Proporção atual: <strong className="tabular-nums">{aspecto.toFixed(2)}:1</strong>.
          </div>
        </div>
      </div>

      {cropAberto && preview && (
        <TrilhaFundoCropper
          src={preview}
          aspectInicial={aspecto}
          cropInicial={fundo.crop ?? null}
          onCancel={() => setCropAberto(false)}
          onConfirm={onCropConfirm}
        />
      )}
    </div>
  )
}
