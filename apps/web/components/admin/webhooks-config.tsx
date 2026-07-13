'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Webhook, Plus, Trash2, Pencil, Loader2, Check, Zap, RefreshCw, AlertTriangle, Search, X, Lock, ListFilter, ChevronDown } from 'lucide-react'
import { criarWebhook, atualizarWebhook, toggleWebhook, excluirWebhook } from '@/app/admin/conexoes/webhooks/actions'

type Wh = { id: string; nome: string; url: string; eventos: string[]; secret: string | null; ativo: boolean; ultimoStatus: string | null; ultimoEnvio: string | null; enviosSimultaneos: number; filtroSimulados: string[] }
type Evt = { chave: string; label: string }
type Sim = { id: string; titulo: string }

function gerarSecret() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function WebhooksConfig({ webhooks, eventos, simulados, precisaMigrar }: { webhooks: Wh[]; eventos: Evt[]; simulados: Sim[]; precisaMigrar: boolean }) {
  const [dialog, setDialog] = useState<{ modo: 'novo' | 'editar'; wh?: Wh } | null>(null)
  const [busca, setBusca] = useState('')
  const [guiaAberta, setGuiaAberta] = useState(false)
  const [pending, start] = useTransition()
  const labelEvento = (c: string) => eventos.find((e) => e.chave === c)?.label ?? c

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? webhooks.filter((w) => `${w.nome} ${w.url}`.toLowerCase().includes(q)) : webhooks
  }, [webhooks, busca])

  function toggle(w: Wh) {
    start(async () => { const r = await toggleWebhook(w.id, !w.ativo); if (r.ok) location.reload(); else toast.error(r.error ?? 'Erro') })
  }
  function excluir(id: string) {
    if (!confirm('Excluir este webhook?')) return
    start(async () => { const r = await excluirWebhook(id); if (r.ok) location.reload(); else toast.error(r.error ?? 'Erro') })
  }

  return (
    <div className="space-y-4">
      {precisaMigrar && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>Rode a migration <code className="rounded bg-muted px-1">20260711000001_webhook_saida.sql</code> no Supabase para ativar os webhooks.</span>
        </div>
      )}

      {/* Guia n8n (recolhível) */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <button type="button" onClick={() => setGuiaAberta((v) => !v)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Zap className="h-4 w-4" /></span>
          <h3 className="text-sm font-semibold">Como usar com o n8n</h3>
          <ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform', guiaAberta && 'rotate-180')} />
        </button>
        {guiaAberta && (
          <div className="border-t p-4">
            <p className="text-sm text-muted-foreground">Crie um workflow no n8n com um nó <b>Webhook</b>, copie a URL de produção e cole aqui. A cada evento assinado enviamos um <code className="rounded bg-muted px-1">POST</code> (formato estilo dos webhooks de venda, fácil de filtrar):</p>
            <pre className="mt-2 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">{`{
  "id": "sessao-uuid", "type": "estudante",
  "event": "estudante.finalizou", "status": "finalizado",
  "dates": { "created_at": "2026-07-13T13:00:00Z" },
  "contact": { "name": "…", "email": "…", "doc": "00000000000", "phone_number": "5571999670570" },
  "simulado": { "id": "…", "name": "Simulado PGE — 1ª fase" },
  "resultado": { "nota": 8.5, "acertos": 17, "total": 20, "tentativa": 1 }
}`}</pre>
            <p className="mt-2 text-xs text-muted-foreground">Com um <b>segredo</b>, o corpo é assinado no header <code className="rounded bg-muted px-1">X-Webhook-Signature: sha256=…</code> (HMAC-SHA256).</p>
          </div>
        )}
      </div>

      {/* Barra: busca + adicionar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome ou URL…" className="pl-9" />
        </div>
        <Button onClick={() => setDialog({ modo: 'novo' })}><Plus className="mr-1.5 h-4 w-4" /> Adicionar Webhook</Button>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nome</th>
                <th className="px-4 py-2.5 font-medium">Eventos</th>
                <th className="px-4 py-2.5 font-medium">URL</th>
                <th className="px-4 py-2.5 font-medium">Último envio</th>
                <th className="px-4 py-2.5 text-center font-medium">Ativo</th>
                <th className="px-4 py-2.5 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{webhooks.length === 0 ? 'Nenhum webhook configurado. Clique em “Adicionar Webhook”.' : 'Nenhum webhook encontrado.'}</td></tr>
              ) : filtrados.map((w) => (
                <tr key={w.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', w.ativo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}><Webhook className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{w.nome}</p>
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          {w.secret && <span className="inline-flex items-center gap-0.5"><Lock className="h-3 w-3" /> assinado</span>}
                          {w.filtroSimulados.length > 0 && <span className="inline-flex items-center gap-0.5"><ListFilter className="h-3 w-3" /> {w.filtroSimulados.length} simulado(s)</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {w.eventos.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" title={w.eventos.map(labelEvento).join(', ')}>{w.eventos.length} evento(s)</span>
                    )}
                  </td>
                  <td className="max-w-[260px] px-4 py-3"><span className="block truncate text-xs text-muted-foreground" title={w.url}>{w.url}</span></td>
                  <td className="px-4 py-3">
                    {w.ultimoStatus ? <span className="text-xs text-muted-foreground">{w.ultimoStatus}{w.ultimoEnvio ? ` · ${new Date(w.ultimoEnvio).toLocaleString('pt-BR')}` : ''}</span> : <span className="text-xs text-muted-foreground">nunca</span>}
                  </td>
                  <td className="px-4 py-3"><div className="flex justify-center"><Switch checked={w.ativo} onCheckedChange={() => toggle(w)} disabled={pending} /></div></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button variant="outline" size="icon" onClick={() => setDialog({ modo: 'editar', wh: w })} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" onClick={() => excluir(w.id)} disabled={pending} aria-label="Excluir" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog && <WebhookDialog modo={dialog.modo} wh={dialog.wh} eventos={eventos} simulados={simulados} onClose={() => setDialog(null)} />}
    </div>
  )
}

function WebhookDialog({ modo, wh, eventos, simulados, onClose }: { modo: 'novo' | 'editar'; wh?: Wh; eventos: Evt[]; simulados: Sim[]; onClose: () => void }) {
  const [nome, setNome] = useState(wh?.nome ?? '')
  const [url, setUrl] = useState(wh?.url ?? '')
  const [secret, setSecret] = useState(wh?.secret ?? '')
  const [ativo, setAtivo] = useState(wh?.ativo ?? true)
  const [envios, setEnvios] = useState(wh?.enviosSimultaneos ?? 5)
  const [sel, setSel] = useState<Set<string>>(new Set(wh?.eventos ?? eventos.map((e) => e.chave)))
  const [filtroModo, setFiltroModo] = useState<'todos' | 'especificos'>((wh?.filtroSimulados?.length ?? 0) > 0 ? 'especificos' : 'todos')
  const [simSel, setSimSel] = useState<Set<string>>(new Set(wh?.filtroSimulados ?? []))
  const [pending, start] = useTransition()

  const toggleEvt = (c: string) => setSel((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n })
  const toggleSim = (id: string) => setSimSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const urlOk = /^https?:\/\/.+/i.test(url.trim())
  const nomeOk = nome.trim().length >= 3

  function salvar() {
    if (!nomeOk) return toast.error('O nome deve ter no mínimo 3 caracteres.')
    if (!urlOk) return toast.error('Informe uma URL válida (http/https).')
    start(async () => {
      const data = {
        nome, url, eventos: [...sel], secret: secret || undefined, ativo,
        enviosSimultaneos: envios,
        filtroSimulados: filtroModo === 'especificos' ? [...simSel] : [],
      }
      const r = modo === 'novo' ? await criarWebhook(data) : await atualizarWebhook(wh!.id, data)
      if (r.ok) location.reload()
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {/* Cabeçalho (barra colorida) */}
        <div className="flex items-center justify-between bg-primary px-5 py-3 text-primary-foreground">
          <h2 className="text-base font-semibold">{modo === 'novo' ? 'Adicionar Webhook' : 'Editar Webhook'}</h2>
          <DialogClose render={<button type="button" aria-label="Fechar" className="rounded-md p-1 transition-colors hover:bg-white/20" />}><X className="h-4 w-4" /></DialogClose>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: n8n — Progressão de estudantes" />
            {!nomeOk && nome.length > 0 && <p className="text-xs text-destructive">O campo deve ter no mínimo 3 caracteres</p>}
          </div>

          <div className="space-y-1.5">
            <Label>URL *</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={cn(url.length > 0 && !urlOk && 'border-destructive focus-visible:ring-destructive/40')} />
            {url.length > 0 && !urlOk && <p className="text-xs text-destructive">O URL é inválido</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Envios simultâneos</Label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={15} value={envios} onChange={(e) => setEnvios(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-primary" />
              <Input type="number" min={1} max={15} value={envios} onChange={(e) => setEnvios(Math.max(1, Math.min(15, Number(e.target.value) || 1)))} className="w-16 text-center" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Filtrar por</Label>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5"><input type="radio" name="filtro" checked={filtroModo === 'todos'} onChange={() => setFiltroModo('todos')} className="accent-primary" /> Todos os simulados</label>
              <label className="flex cursor-pointer items-center gap-1.5"><input type="radio" name="filtro" checked={filtroModo === 'especificos'} onChange={() => setFiltroModo('especificos')} className="accent-primary" /> Simulados específicos</label>
            </div>
            {filtroModo === 'especificos' && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {simulados.length === 0 ? <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum simulado cadastrado.</p> : simulados.map((s) => {
                  const on = simSel.has(s.id)
                  return (
                    <button key={s.id} type="button" onClick={() => toggleSim(s.id)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors', on ? 'bg-primary/5' : 'hover:bg-muted')}>
                      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                      <span className="truncate">{s.titulo}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Eventos que disparam</Label>
            <div className="space-y-1 rounded-lg border p-2">
              {eventos.map((e) => {
                const on = sel.has(e.chave)
                return (
                  <button key={e.chave} type="button" onClick={() => toggleEvt(e.chave)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors', on ? 'bg-primary/5' : 'hover:bg-muted')}>
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                    {e.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Segredo (opcional — assina o corpo com HMAC)</Label>
            <div className="flex gap-2">
              <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="deixe em branco para não assinar" />
              <Button type="button" variant="outline" onClick={() => setSecret(gerarSecret())}><RefreshCw className="mr-1 h-4 w-4" /> Gerar</Button>
            </div>
          </div>

          <div className="flex items-center gap-2"><Switch checked={ativo} onCheckedChange={setAtivo} id="wh-ativo" /><Label htmlFor="wh-ativo" className="cursor-pointer">Ativo</Label></div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/30 p-3">
          <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={salvar} disabled={pending}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Enviar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
