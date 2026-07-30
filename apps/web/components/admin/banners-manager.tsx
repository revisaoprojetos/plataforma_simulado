'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Loader2, Trash2, Eye, EyeOff, Megaphone, MessageSquareWarning, ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { criarBannerAction, toggleBannerAction, excluirBannerAction } from '@/app/admin/configuracoes/banners/actions'

export type Banner = {
  id: string; tipo: 'banner' | 'popup'; titulo: string | null; mensagem: string | null
  imagem_url: string | null; link: string | null; cor: string | null; ativo: boolean; ordem: number
}

export function BannersManager({ banners, tenantId }: { banners: Banner[]; tenantId?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [alvo, setAlvo] = useState<string | null>(null)
  const [tipo, setTipo] = useState<'banner' | 'popup'>('banner')
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [imagem, setImagem] = useState('')
  const [link, setLink] = useState('')
  const [cor, setCor] = useState('#6366f1')

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
          {(['banner', 'popup'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition', tipo === t ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted')}>
              {t === 'banner' ? <Megaphone className="h-4 w-4" /> : <MessageSquareWarning className="h-4 w-4" />}
              {t === 'banner' ? 'Banner' : 'Pop-up'}
            </button>
          ))}
        </div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Título</label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Novo simulado disponível!" /></div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Mensagem</label>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} placeholder="Texto do aviso…" className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Imagem (URL, opcional)</label><Input value={imagem} onChange={(e) => setImagem(e.target.value)} placeholder="https://…" /></div>
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
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: (b.cor ?? '#6366f1') + '22', color: b.cor ?? '#6366f1' }}>
              {b.imagem_url ? <ImageIcon className="h-5 w-5" /> : b.tipo === 'popup' ? <MessageSquareWarning className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {b.titulo || '(sem título)'}
                <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{b.tipo === 'popup' ? 'pop-up' : 'banner'}</span>
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
