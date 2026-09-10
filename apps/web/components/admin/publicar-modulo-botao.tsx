'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Loader2, X, Check, Send, Pencil, Clock, CircleDot, Ban, CalendarClock, Zap } from 'lucide-react'
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

/** Botão + diálogo de publicação do MÓDULO (topo-direito), no estilo do simulado: rascunho/publicado
 * com modo Imediato ou Com prazo (agenda início/encerra). Encerrado = aluno perde o acesso, tudo salvo. */
export function PublicarModuloBotao({ pastaId, publicacao }: { pastaId: string; publicacao: PublicacaoModulo }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [status, setStatus] = useState<PublicacaoModulo['status']>(publicacao.status)
  const [modo, setModo] = useState<'imediato' | 'prazo'>(publicacao.publicarEm || publicacao.encerrarEm ? 'prazo' : 'imediato')
  const [publicarEm, setPublicarEm] = useState(isoParaBrtLocal(publicacao.publicarEm))
  const [encerrarEm, setEncerrarEm] = useState(isoParaBrtLocal(publicacao.encerrarEm))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => { // ressincroniza ao abrir
    setStatus(publicacao.status)
    setModo(publicacao.publicarEm || publicacao.encerrarEm ? 'prazo' : 'imediato')
    setPublicarEm(isoParaBrtLocal(publicacao.publicarEm)); setEncerrarEm(isoParaBrtLocal(publicacao.encerrarEm))
  }, [publicacao, open])

  const est = estadoDe(publicacao)
  const publicadoAtual = publicacao.status === 'publicado'

  async function salvar(forcarRascunho?: boolean) {
    const comPrazo = modo === 'prazo'
    const pub: PublicacaoModulo = {
      status: forcarRascunho ? 'rascunho' : status,
      publicarEm: !forcarRascunho && comPrazo ? brtLocalParaIso(publicarEm) : null,
      encerrarEm: !forcarRascunho && comPrazo ? brtLocalParaIso(encerrarEm) : null,
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

  const cardCls = (ativo: boolean) => cn('flex flex-1 items-center gap-2.5 rounded-xl border p-3 text-left transition-colors', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/40')
  const iconCls = (ativo: boolean) => cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')

  return (
    <div className="flex items-center gap-2">
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', est.cls)}><est.Icon className="h-3.5 w-3.5" /> {est.label}</span>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
        {publicadoAtual ? <><Pencil className="h-4 w-4" /> Editar publicação</> : <><Send className="h-4 w-4" /> Publicar</>}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> Publicação do módulo</h3>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-5 p-5">
              {/* Situação */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Situação</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStatus('rascunho')} className={cardCls(status === 'rascunho')}>
                    <span className={iconCls(status === 'rascunho')}><Pencil className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">Rascunho</span>
                      <span className="block text-[11px] text-muted-foreground">Oculto dos alunos</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => setStatus('publicado')} className={cardCls(status === 'publicado')}>
                    <span className={iconCls(status === 'publicado')}><CircleDot className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">Publicado</span>
                      <span className="block text-[11px] text-muted-foreground">Visível aos liberados</span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Quando (modo) — só quando publicado */}
              {status === 'publicado' && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quando</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setModo('imediato')} className={cardCls(modo === 'imediato')}>
                      <span className={iconCls(modo === 'imediato')}><Zap className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">Imediato</span>
                        <span className="block text-[11px] text-muted-foreground">Disponível ao salvar, sem fim</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => setModo('prazo')} className={cardCls(modo === 'prazo')}>
                      <span className={iconCls(modo === 'prazo')}><CalendarClock className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">Com prazo</span>
                        <span className="block text-[11px] text-muted-foreground">Agenda início e/ou fim</span>
                      </span>
                    </button>
                  </div>

                  {modo === 'prazo' && (
                    <div className="mt-1 space-y-3 rounded-xl border bg-muted/20 p-3">
                      <div>
                        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Publicar em <span className="font-normal">(vazio = ao salvar)</span></label>
                        <input type="datetime-local" value={publicarEm} onChange={(e) => setPublicarEm(e.target.value)} className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Ban className="h-3.5 w-3.5" /> Encerrar em <span className="font-normal">(vazio = sem fim)</span></label>
                        <input type="datetime-local" value={encerrarEm} onChange={(e) => setEncerrarEm(e.target.value)} className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">Ao encerrar, o aluno perde o acesso — mas conteúdo, questões e progresso ficam salvos.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
              {publicadoAtual
                ? <button type="button" onClick={() => salvar(true)} disabled={salvando} className="rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">Despublicar</button>
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
