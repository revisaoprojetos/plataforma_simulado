'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Loader2, Trash2, Eye, EyeOff, Megaphone, MessageSquareWarning, ImageIcon, Upload, X } from 'lucide-react'
import { redimensionarImagem } from '@/lib/imagem'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { criarBannerAction, toggleBannerAction, excluirBannerAction } from '@/app/admin/configuracoes/banners/actions'

export type Banner = {
  id: string; tipo: 'banner' | 'popup' | 'hero'; titulo: string | null; mensagem: string | null
  imagem_url: string | null; link: string | null; cor: string | null; ativo: boolean; ordem: number
}

const TIPO_LABEL: Record<string, string> = { banner: 'banner', popup: 'pop-up', hero: 'destaque' }

export function BannersManager({ banners, tenantId }: { banners: Banner[]; tenantId?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [alvo, setAlvo] = useState<string | null>(null)
  const [tipo, setTipo] = useState<'banner' | 'popup' | 'hero'>('banner')
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [imagem, setImagem] = useState('')
  const [link, setLink] = useState('')
  const [cor, setCor] = useState('#6366f1')
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onArquivo(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setEnviando(true)
    // Banner e Destaque são largos → 1920px em ALTA qualidade (0.9); pop-up menor.
    try { setImagem(await redimensionarImagem(f, tipo === 'popup' ? 900 : 1920, tipo === 'popup' ? 0.72 : 0.9)) }
    catch { toast.error('Falha ao processar a imagem.') }
    finally { setEnviando(false); if (fileRef.current) fileRef.current.value = '' }
  }

  function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() && !mensagem.trim() && !imagem.trim()) { toast.error('Preencha ao menos um título, mensagem ou imagem.'); return }
    setAlvo('novo')
    start(async () => {
      const r = await criarBannerAction({ tipo, titulo, mensagem, imagem_url: imagem, link, cor, ativo: true }, tenantId)
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha ao criar.'); return }
      toast.success('Criado!'); setTitulo(''); setMensagem(''); setImagem(''); setLink('')
      router.refresh()
    })
  }

  function toggle(b: Banner) {
    setAlvo(b.id)
    start(async () => {
      const r = await toggleBannerAction(b.id, !b.ativo, tenantId)
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      router.refresh()
    })
  }

  async function excluir(b: Banner) {
    if (!(await confirmar({ titulo: 'Excluir', mensagem: `Excluir este ${b.tipo === 'popup' ? 'pop-up' : 'banner'}?`, confirmar: 'Excluir', destrutivo: true }))) return
    setAlvo(b.id)
    start(async () => {
      const r = await excluirBannerAction(b.id, tenantId)
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      toast.success('Excluído.'); router.refresh()
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
      {/* Form de criação */}
      <form onSubmit={criar} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Novo aviso</h2>
        <div className="flex gap-2">
          {(['banner', 'popup', 'hero'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={cn('flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition', tipo === t ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted')}>
              {t === 'banner' ? <Megaphone className="h-4 w-4" /> : t === 'popup' ? <MessageSquareWarning className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
              {t === 'banner' ? 'Banner' : t === 'popup' ? 'Pop-up' : 'Destaque'}
            </button>
          ))}
        </div>
        {tipo === 'hero' && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Banner de <strong>destaque</strong> aparece no topo da home do aluno, em carrossel. Use uma <strong>imagem larga</strong> (ex.: 1920×600). O link é opcional. A ordem segue a criação.</p>}
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Título</label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Novo simulado disponível!" /></div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Mensagem</label>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} placeholder="Texto do aviso…" className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Imagem {tipo === 'popup' ? '(opcional)' : '(padrão 1920×600 — largura total)'}</label>
          <div className="flex gap-2">
            <Input value={imagem.startsWith('data:') ? '' : imagem} onChange={(e) => setImagem(e.target.value)} placeholder="Cole uma URL ou envie um arquivo →" className="flex-1" />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onArquivo(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando} title="Enviar imagem do computador"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-50">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </button>
          </div>
          {imagem && (
            <div className="relative overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagem} alt="" className={cn('w-full object-cover', tipo === 'popup' ? 'h-20' : 'aspect-[1920/500]')} />
              <button type="button" onClick={() => setImagem('')} title="Remover imagem"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white transition hover:bg-black/70"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Link ao clicar (opcional)</label><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/aluno/simulado ou https://…" /></div>
        <div className="flex items-center gap-2"><label className="text-xs text-muted-foreground">Cor de destaque</label><input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5" /></div>
        <Button type="submit" disabled={pending && alvo === 'novo'} className="w-full">
          {pending && alvo === 'novo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Adicionar
        </Button>
      </form>

      {/* Lista */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Avisos ({banners.length})</h2>
        {banners.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum banner ou pop-up ainda.</div>
        ) : banners.map((b) => (
          <div key={b.id} className={cn('flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm', !b.ativo && 'opacity-60')}>
            {b.imagem_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.imagem_url} alt="" className="h-11 w-16 shrink-0 rounded-lg border object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: (b.cor ?? '#6366f1') + '22', color: b.cor ?? '#6366f1' }}>
                {b.tipo === 'popup' ? <MessageSquareWarning className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {b.titulo || '(sem título)'}
                <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{TIPO_LABEL[b.tipo] ?? b.tipo}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">{b.mensagem || b.link || '—'}</p>
            </div>
            <button type="button" onClick={() => toggle(b)} disabled={pending && alvo === b.id} title={b.ativo ? 'Desativar' : 'Ativar'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-50">
              {pending && alvo === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : b.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => excluir(b)} disabled={pending && alvo === b.id} title="Excluir"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
