'use client'

import { useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X, Upload, Crop, Loader2, Check, Megaphone, MessageSquareWarning, ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { redimensionarImagem } from '@/lib/imagem'
import { BannerCropper } from '@/components/admin/banner-cropper'
import { atualizarBannerAction } from '@/app/admin/configuracoes/banners/actions'
import type { Banner, DestinoBanner } from '@/components/admin/banners-manager'

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f) })
}

/** Pop-up de configuração TOTAL de um banner já criado (tipo, título, mensagem, imagem+recorte,
 *  link/destino, cor, ativo). Salva via atualizarBannerAction. */
export function BannerEditModal({ banner, tenantId, destinos, onClose }: { banner: Banner; tenantId?: string; destinos?: DestinoBanner[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tipo, setTipo] = useState<Banner['tipo']>(banner.tipo)
  const [titulo, setTitulo] = useState(banner.titulo ?? '')
  const [mensagem, setMensagem] = useState(banner.mensagem ?? '')
  const [imagem, setImagem] = useState(banner.imagem_url ?? '')
  const [link, setLink] = useState(banner.link ?? '')
  const [cor, setCor] = useState(banner.cor ?? '#6366f1')
  const [ativo, setAtivo] = useState(banner.ativo)
  const [enviando, setEnviando] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onArquivo(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    if (tipo === 'popup') {
      setEnviando(true)
      try { setImagem(await redimensionarImagem(f, 900, 0.72)) } catch { toast.error('Falha ao processar a imagem.') } finally { setEnviando(false); if (fileRef.current) fileRef.current.value = '' }
      return
    }
    setEnviando(true)
    try { const url = await fileToDataUrl(f); setCropSrc(url); setCropOpen(true) }
    catch { toast.error('Falha ao ler a imagem.') }
    finally { setEnviando(false); if (fileRef.current) fileRef.current.value = '' }
  }

  function salvar() {
    start(async () => {
      const r = await atualizarBannerAction(banner.id, { tipo, titulo, mensagem, imagem_url: imagem, link, cor, ativo, ordem: banner.ordem }, tenantId)
      if (r.ok) { toast.success('Banner atualizado.'); router.refresh(); onClose() }
      else toast.error(r.error ?? 'Falha ao salvar.')
    })
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <span className="text-sm font-semibold">Configurar aviso</span>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <div className="flex gap-2">
            {(['banner', 'popup', 'hero'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)}
                className={cn('flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition', tipo === t ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted')}>
                {t === 'banner' ? <Megaphone className="h-4 w-4" /> : t === 'popup' ? <MessageSquareWarning className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                {t === 'banner' ? 'Banner' : t === 'popup' ? 'Pop-up' : 'Destaque'}
              </button>
            ))}
          </div>

          <div className="space-y-1"><label className="text-xs text-muted-foreground">Título</label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Novo simulado disponível!" /></div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Mensagem</label>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} placeholder="Texto do aviso…" className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Imagem {tipo === 'popup' ? '(opcional)' : '(molde 1920×500 — largura total)'}</label>
            <div className="flex gap-2">
              <Input value={imagem.startsWith('data:') ? '' : imagem} onChange={(e) => setImagem(e.target.value)} placeholder="Cole uma URL ou envie um arquivo →" className="flex-1" />
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onArquivo(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando} title="Enviar imagem"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-50">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </button>
            </div>
            {imagem && (
              <div className="relative overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagem} alt="" className={cn('w-full object-cover', tipo === 'popup' ? 'h-20' : 'aspect-[1920/500]')} />
                <div className="absolute right-1.5 top-1.5 flex gap-1.5">
                  {tipo !== 'popup' && (
                    <button type="button" onClick={() => { setCropSrc(cropSrc || imagem); setCropOpen(true) }} title="Ajustar recorte"
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white transition hover:bg-black/70"><Crop className="h-3.5 w-3.5" /></button>
                  )}
                  <button type="button" onClick={() => setImagem('')} title="Remover imagem"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white transition hover:bg-black/70"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            )}
            {cropOpen && cropSrc && <BannerCropper src={cropSrc} onApply={(d) => { setImagem(d); setCropOpen(false) }} onCancel={() => setCropOpen(false)} />}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Link ao clicar (opcional)</label>
            {destinos && destinos.length > 0 && (
              <select value={destinos.some((d) => d.href === link) ? link : ''} onChange={(e) => e.target.value && setLink(e.target.value)}
                className="mb-1.5 h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Destino rápido (pasta, simulado…) — ou digite abaixo</option>
                {['Pastas', 'Simulados'].map((grp) => {
                  const opts = destinos.filter((d) => (d.grupo ?? 'Simulados') === grp)
                  return opts.length ? <optgroup key={grp} label={grp}>{opts.map((d) => <option key={d.href} value={d.href}>{d.label}</option>)}</optgroup> : null
                })}
              </select>
            )}
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/aluno ou https://…" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2"><label className="text-xs text-muted-foreground">Cor de destaque</label><input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5" /></div>
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Ativo</span><Switch checked={ativo} onCheckedChange={setAtivo} /></div>
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t px-5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
