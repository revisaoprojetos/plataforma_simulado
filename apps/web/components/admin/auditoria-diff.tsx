'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { GitCompare, ArrowRight, User, Clock, Globe, Monitor, Info, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { camposMudados } from '@/lib/auditoria/resumo'

interface Props {
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  raw?: Record<string, unknown>
  resumo?: string
  operacao?: string
  entidade?: string
  ator?: string | null
  quando?: string
  ip?: string | null
  userAgent?: string | null
  /** Contexto da requisição gravado pelo registrarAudit (rota, rota_api, request_id, sessao_id, status). */
  ctx?: Record<string, unknown> | null
  atorId?: string | null
}

const opCor: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  UPDATE: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  LIBERAR: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  BLOQUEAR: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  ANULAR: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  RECORRIGIR: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  LOGIN: 'bg-muted text-muted-foreground', LOGOUT: 'bg-muted text-muted-foreground',
}

// Trunca base64/strings gigantes no dump técnico (evita despejar imagens no DOM).
const jsonReplacer = (_k: string, v: unknown) =>
  typeof v === 'string' && (v.startsWith('data:') || v.length > 200) ? `${v.slice(0, 40)}…(${v.length} caracteres)` : v

export function AuditoriaDiff({ antes, depois, raw, resumo, operacao, entidade, ator, quando, ip, userAgent, ctx, atorId }: Props) {
  const [open, setOpen] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const rota = str(ctx?.rota), rotaApi = str(ctx?.rota_api), requestId = str(ctx?.request_id), sessaoId = str(ctx?.sessao_id)
  const statusRaw = str(ctx?.status)
  const sucesso = statusRaw !== 'erro'
  const copiar = () => { if (requestId) { void navigator.clipboard?.writeText(requestId).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }).catch(() => {}) } }
  const mud = camposMudados(antes, depois)
  const isInsert = !antes && !!depois
  const isDelete = operacao === 'DELETE'
  const temTecnico = !!(antes || depois || (raw && Object.keys(raw).length > 0))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" title="Ver detalhes" />}>
        <GitCompare className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {operacao && <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase', opCor[operacao] ?? 'bg-muted text-muted-foreground')}>{operacao}</span>}
            Detalhes da ação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {resumo && <p className="rounded-lg border bg-muted/40 p-3 font-medium leading-snug">{resumo}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <Cartao titulo="Quando" icon={Clock}>
              {quando ? <Linha rotulo="Data/hora">{quando}</Linha> : <Linha rotulo="Data/hora">—</Linha>}
              {ator && <Linha rotulo="Quem">{ator}</Linha>}
            </Cartao>
            <Cartao titulo="Onde" icon={Globe}>
              <Linha rotulo="IP">{ip ?? '—'}</Linha>
              <Linha rotulo="Dispositivo">{userAgent ? resumoUA(userAgent) : '—'}</Linha>
              <Linha rotulo="Página">{rota ? <span className="font-mono text-xs">{rota}</span> : '—'}</Linha>
              <Linha rotulo="Rota da API">{rotaApi ? <span className="font-mono text-xs">{rotaApi}</span> : '—'}</Linha>
            </Cartao>
            <Cartao titulo="O quê" icon={Info}>
              <Linha rotulo="Ação">{operacao ?? '—'}</Linha>
              <Linha rotulo="Módulo / entidade">{entidade ? <span className="font-mono text-xs">{entidade}</span> : '—'}</Linha>
              <Linha rotulo="Status">
                <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', sucesso ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>{sucesso ? 'Sucesso' : 'Erro'}</span>
              </Linha>
            </Cartao>
            <Cartao titulo="Sessão" icon={Monitor}>
              <Linha rotulo="Sessão">{sessaoId ? <span className="font-mono text-xs" title={sessaoId}>{sessaoId.slice(0, 8)}</span> : '—'}</Linha>
              <Linha rotulo="ID da requisição">
                {requestId ? (
                  <button type="button" onClick={copiar} className="inline-flex max-w-full items-center gap-1 font-mono text-xs hover:underline" title="Copiar ID da requisição">
                    <span className="truncate">{requestId}</span>{copiado ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
                  </button>
                ) : '—'}
              </Linha>
              {atorId && <Linha rotulo="Usuário"><Link href={`/admin/auditoria?ator=${atorId}`} className="text-xs underline-offset-2 hover:underline">Ver auditoria deste usuário</Link></Linha>}
            </Cartao>
          </div>

          {mud.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {isInsert ? 'Dados registrados' : isDelete ? 'Antes da exclusão' : 'O que mudou'}
              </p>
              <div className="space-y-1.5">
                {mud.map((m) => (
                  <div key={m.campo} className="overflow-hidden rounded-lg border">
                    <div className="bg-muted/60 px-3 py-1 text-xs font-semibold">{m.rotulo}</div>
                    {isInsert ? (
                      <div className="px-3 py-1.5 text-sm">{m.para}</div>
                    ) : (
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5">
                        <span className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 line-through decoration-red-300/70 dark:bg-red-950/30 dark:text-red-300">{m.de}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{m.para}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mud.length === 0 && !isDelete && <p className="text-muted-foreground">Sem alterações de campos registradas — veja o contexto acima.</p>}
          {isDelete && mud.length === 0 && <p className="text-muted-foreground">Registro excluído.</p>}

          {temTecnico && (
            <details className="group rounded-lg border">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">Dados técnicos (JSON)</summary>
              <pre className="max-h-64 overflow-auto border-t bg-muted/20 p-3 text-[11px] leading-relaxed">{JSON.stringify({ antes, depois, ...(raw && Object.keys(raw).length ? { detalhes: raw } : {}) }, jsonReplacer, 2)}</pre>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Cartao({ titulo, icon: Icon, children }: { titulo: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" />{titulo}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] text-muted-foreground">{rotulo}</span>
      <span className="block truncate text-sm">{children}</span>
    </div>
  )
}

function Meta({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="block text-[11px] uppercase text-muted-foreground">{label}</span>
        <span className="block truncate">{children}</span>
      </div>
    </div>
  )
}

function resumoUA(ua: string): string {
  const b = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Navegador'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${b} · ${os}` : b
}
