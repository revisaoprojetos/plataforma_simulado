'use client'

import { useState, useTransition } from 'react'
import { ShieldCheck, AlertTriangle, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { salvarSegurancaWebhook } from '@/app/admin/integracoes/actions'

/** Segredo + modo estrito do webhook de entrada (HMAC / header). Compatível: sem segredo a integração segue funcionando. */
export function WebhookSegurancaCard({ provider, nome, temSegredo, estrito, modo }: { provider: 'guru' | 'curseduca'; nome: string; temSegredo: boolean; estrito: boolean; modo: 'guru' | 'curseduca' }) {
  const [segredo, setSegredo] = useState('')
  const [salvando, start] = useTransition()
  const [estritoLocal, setEstritoLocal] = useState(estrito)
  const [temLocal, setTemLocal] = useState(temSegredo)

  function salvarSegredo() {
    if (!segredo.trim()) return
    start(async () => {
      const r = await salvarSegurancaWebhook(provider, { segredo })
      if (r.ok) { toast.success('Segredo salvo'); setSegredo(''); setTemLocal(true) } else toast.error(r.error ?? 'Erro')
    })
  }
  function alternarEstrito(v: boolean) {
    start(async () => {
      const r = await salvarSegurancaWebhook(provider, { estrito: v })
      if (r.ok) { setEstritoLocal(v); toast.success(v ? 'Modo estrito ativado' : 'Modo estrito desativado') } else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Segurança do webhook</p>
      {!temLocal && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Sem segredo configurado: o webhook é protegido apenas pelo token da URL. Configure o segredo abaixo e ative o modo estrito.</span>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {modo === 'guru' ? 'Account Token do Guru (ou segredo de assinatura)' : 'Segredo do webhook'}
          {temLocal && <span className="ml-1 text-emerald-600 dark:text-emerald-400">• já configurado</span>}
        </label>
        <div className="flex gap-2">
          <Input type="password" value={segredo} onChange={(e) => setSegredo(e.target.value)} placeholder={temLocal ? '•••••••• (deixe em branco para manter)' : 'Cole o segredo'} />
          <Button size="sm" onClick={salvarSegredo} disabled={salvando || !segredo.trim()}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={estritoLocal} disabled={salvando || (!temLocal && !estritoLocal)} onChange={(e) => alternarEstrito(e.target.checked)} className="h-4 w-4 rounded border" />
        Modo estrito (rejeitar requisições sem segredo/assinatura válidos)
      </label>
      <p className="text-[11px] text-muted-foreground">
        {modo === 'guru'
          ? <>No Guru, o segredo é o <strong>Account Token</strong> (enviado no corpo como <code>api_token</code>). Se usar n8n/proxy, também vale HMAC-SHA256 do corpo no header <code>x-webhook-signature</code> ou o segredo no header <code>x-webhook-secret</code>.</>
          : <>A Curseduca não assina webhooks. No n8n/chamador, envie o segredo no header <code>x-webhook-secret</code> (ou <code>Authorization: Bearer</code>), ou assine o corpo com HMAC-SHA256 em <code>x-webhook-signature</code>.</>}
        {' '}Ative o modo estrito só depois de confirmar que o chamador já envia o segredo — {nome} deixará de entregar caso contrário.
      </p>
    </div>
  )
}
