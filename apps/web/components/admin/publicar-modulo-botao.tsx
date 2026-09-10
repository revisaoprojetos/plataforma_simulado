'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Loader2, X, Check, Send, Pencil, Clock, CircleDot, Ban, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brtLocalParaIso, isoParaBrtLocal } from '@/lib/brt'
import { salvarPublicacaoModulo, type PublicacaoModulo } from '@/app/admin/leitura/actions'

type Estado = { label: string; cls: string; Icon: typeof CircleDot }
function estadoDe(p: PublicacaoModulo): Estado {
  if (p.status !== 'publicado') return { label: 'Rascunho', cls: 'bg-muted text-muted-foreground', Icon: Pencil }
  const agora = Date.now()
  if (p.publicarEm && new Date(p.publicarEm).getTime() > agora) return { label: 'Agendado', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', Icon: Clock }
  if (p.encerrarEm && new Date(p.encerrarEm).getTime() < agora) return { label: 'Encerrado', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', Icon: Ban }
  return { label: 'Publicado', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', Icon: CircleDot }
}

/** Botão + diálogo de publicação do MÓDULO (topo-direito), no estilo do simulado: rascunho/publicado,
 * agendar início (publicarEm) e encerrar (encerrarEm). Publicado + na janela = aparece p/ os alunos
 * liberados (ou todos); encerrado = perdem o acesso, mas tudo continua salvo. */
export function PublicarModuloBotao({ pastaId, publicacao }: { pastaId: string; publicacao: PublicacaoModulo }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [status, setStatus] = useState<PublicacaoModulo['status']>(publicacao.status)
  const [publicarEm, setPublicarEm] = useState(isoParaBrtLocal(publicacao.publicarEm))
  const [encerrarEm, setEncerrarEm] = useState(isoParaBrtLocal(publicacao.encerrarEm))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => { // ressincroniza ao abrir/mudar
    setStatus(publicacao.status); setPublicarEm(isoParaBrtLocal(publicacao.publicarEm)); setEncerrarEm(isoParaBrtLocal(publicacao.encerrarEm))
  }, [publicacao, open])

  const est = estadoDe(publicacao)
  const publicado = publicacao.status === 'publicado'

  async function salvar(over?: Partial<PublicacaoModulo>) {
    const pub: PublicacaoModulo = {
      status: over?.status ?? status,
      publicarEm: over && 'publicarEm' in over ? over.publicarEm ?? null : (brtLocalParaIso(publicarEm)),
      encerrarEm: over && 'encerrarEm' in over ? over.encerrarEm ?? null : (brtLocalParaIso(encerrarEm)),
    }
    if (pub.status === 'publicado' && pub.publicarEm && pub.encerrarEm && new Date(pub.encerrarEm) <= new Date(pub.publicarEm)) {
      toast.error('O encerramento precisa ser depois da publicação.'); return
    }
    setSalvando(true)
    const r = await salvarPublicacaoModulo(pastaId, pub)
    setSalvando(false)
    if (r.ok) { toast.success(pub.status === 'publicado' ? 'Publicação salva' : 'Módulo em rascunho'); setOpen(false); router.refresh() }
    else toast.error(r.error ?? 'Erro ao salvar publicação')
  }

  return (
    <div className="flex items-center gap-2">
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', est.cls)}><est.Icon className="h-3.5 w-3.5" /> {est.label}</span>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
        {publicado ? <><Pencil className="h-4 w-4" /> Editar publicação</> : <><Send className="h-4 w-4" /> Publicar</>}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> Publicação do módulo</h3>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 p-5">
              {/* Status */}
              <div className="grid grid-cols-2 gap-2">
                {([['rascunho', 'Rascunho', Pencil], ['publicado', 'Publicado', CircleDot]] as const).map(([v, label, Icon]) => (
                  <button key={v} type="button" onClick={() => setStatus(v)}
                    className={cn('flex items-center gap-2 rounded-xl border p-3 text-left transition-colors', status === v ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', status === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
                    <span className="text-sm font-semibold">{label}</span>
                  </button>
                ))}
              </div>

              {status === 'publicado' && (
                <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Publicar em (opcional — agenda o início; vazio = imediato)</label>
                    <input type="datetime-local" value={publicarEm} onChange={(e) => setPublicarEm(e.target.value)} className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Encerrar em (opcional — depois disso o aluno perde o acesso)</label>
                    <input type="datetime-local" value={encerrarEm} onChange={(e) => setEncerrarEm(e.target.value)} className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Nada é apagado ao encerrar — o conteúdo, questões e progresso ficam salvos.</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
              {publicado
                ? <button type="button" onClick={() => salvar({ status: 'rascunho' })} disabled={salvando} className="rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">Despublicar</button>
                : <span />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
                <button type="button" onClick={() => salvar()} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
