'use client'

import { DialogContent, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Inbox, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JsonViewer } from '@/components/admin/json-viewer'

export interface DetalheRequisicao {
  metodo: string
  statusResp: number | null
  resultado: string | null
  ip: string | null
  recebidoEm: string
  tokenMasc: string | null
  headers: unknown
  query?: unknown
  body: unknown
  bodyRaw: string | null
  fonte?: string | null
  provider?: string
}

/** Modal "Requisição recebida" — mesmo design do pop-up de webhook (header colorido + JSON viewer). */
export function ModalRequisicao({ detalhe }: { detalhe: DetalheRequisicao | null }) {
  if (!detalhe) return null
  const s = detalhe.statusResp
  const corStatus = s == null ? 'bg-white/20 text-white' : s < 300 ? 'bg-emerald-400/30 text-white' : s < 500 ? 'bg-amber-300/30 text-white' : 'bg-rose-400/40 text-white'
  return (
    <DialogContent showCloseButton={false} className="max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <div className="flex items-center justify-between bg-primary px-5 py-3 text-primary-foreground">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Inbox className="h-4 w-4" /> Requisição recebida</h2>
          <p className="truncate text-xs text-primary-foreground/70">{detalhe.metodo}{detalhe.fonte ? ` · ${detalhe.fonte}` : ''} · {detalhe.resultado ?? '—'} · {new Date(detalhe.recebidoEm).toLocaleString('pt-BR')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', corStatus)}>{detalhe.statusResp ?? '—'}</span>
          <DialogClose render={<button type="button" aria-label="Fechar" className="rounded-md p-1 transition-colors hover:bg-white/20" />}><X className="h-4 w-4" /></DialogClose>
        </div>
      </div>

      <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Campo k="Método" v={detalhe.metodo} />
          <Campo k="Status devolvido" v={String(detalhe.statusResp ?? '—')} />
          <Campo k="IP" v={detalhe.ip ?? '—'} />
          {detalhe.fonte && <Campo k="Fonte" v={String(detalhe.fonte)} />}
          <Campo k="Token (URL)" v={detalhe.tokenMasc ?? '—'} />
          <Campo k="Recebido em" v={new Date(detalhe.recebidoEm).toLocaleString('pt-BR')} />
        </div>
        <SecaoJson titulo="Corpo (JSON)" data={detalhe.body} raw={detalhe.bodyRaw} />
        <SecaoJson titulo="Headers" data={detalhe.headers} />
        {detalhe.query != null && Object.keys(detalhe.query as any).length > 0 && <SecaoJson titulo="Query" data={detalhe.query} />}
      </div>

      <div className="flex justify-end gap-2 border-t bg-muted/30 p-3">
        <DialogClose render={<Button type="button" variant="outline" size="sm" />}>Fechar</DialogClose>
      </div>
    </DialogContent>
  )
}

function Campo({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg border bg-muted/20 px-2.5 py-1.5"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{k}</span><span className="break-all text-xs font-medium">{v}</span></div>
}
/** Seção com título + JSON colorido (JsonViewer) quando é objeto; senão texto cru. */
function SecaoJson({ titulo, data, raw }: { titulo: string; data: unknown; raw?: string | null }) {
  const ehObj = data != null && typeof data === 'object'
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="max-h-72 overflow-auto rounded-lg border bg-muted/20 p-2.5">
        {ehObj ? <JsonViewer data={data} /> : <pre className="text-[11px] leading-relaxed text-muted-foreground">{raw || '(vazio)'}</pre>}
      </div>
    </div>
  )
}
