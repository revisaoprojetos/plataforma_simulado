'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { UserX, Flame, Trophy, Webhook, Info } from 'lucide-react'
import Link from 'next/link'
import type { GamConfig } from '@/lib/gamificacao/config'
import type { EngajamentoConfig } from '@/lib/gamificacao/engajamento-tipos'
import { salvarEngajamento } from '../actions'
import { NumberField, SaveBar } from './_campos'
import { useUnsavedGuard } from '@/components/admin/use-unsaved-guard'

// Card de gatilho: faixa colorida + ícone + toggle, corpo desabilitável quando desligado.
function GatilhoCard({ icon: Icon, tom, titulo, descricao, evento, ativo, onToggle, disabled, children }: {
  icon: any; tom: string; titulo: string; descricao: string; evento: string; ativo: boolean; onToggle: (v: boolean) => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start gap-3 p-4" style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${tom} 10%, transparent), transparent)` }}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${tom} 18%, transparent)`, color: tom }}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{titulo}</h3>
            <Switch checked={ativo} onCheckedChange={onToggle} disabled={disabled} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
          <code className="mt-1.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">evento: {evento}</code>
        </div>
      </div>
      <div className={`space-y-3 px-4 pb-4 ${!ativo ? 'pointer-events-none opacity-50' : ''}`}>{children}</div>
    </div>
  )
}

function CampoMensagem({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">Mensagem enviada</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} disabled={disabled}
        className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-60" />
      <span className="block text-[11px] text-muted-foreground">Variáveis: <code className="font-mono">{'{{nome}}'}</code> <code className="font-mono">{'{{dias}}'}</code> <code className="font-mono">{'{{marco}}'}</code> <code className="font-mono">{'{{streak}}'}</code> <code className="font-mono">{'{{maior}}'}</code></span>
    </label>
  )
}

/** Parser tolerante da lista de marcos: "7, 14 21;30" → [7,14,21,30]. */
function parseMarcos(s: string): number[] {
  return [...new Set(s.split(/[^\d]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
}

export function EngajamentoForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const eng = config.engajamento
  const [inativo, setInativo] = useState(eng.inativo)
  const [sequencia, setSequencia] = useState(eng.sequencia)
  const [marco, setMarco] = useState(eng.marco)
  const [marcosTxt, setMarcosTxt] = useState((eng.marco.marcos ?? []).join(', '))
  const [salvando, start] = useTransition()
  const { dirty, markSaved } = useUnsavedGuard({ inativo, sequencia, marco, marcosTxt })
  const dis = !podeGerenciar

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: EngajamentoConfig = {
      inativo,
      sequencia,
      marco: { ...marco, marcos: parseMarcos(marcosTxt) },
    }
    start(async () => {
      const r: any = await salvarEngajamento(payload)
      if (r?.error) toast.error(r.error); else { toast.success('Gatilhos de engajamento salvos.'); markSaved() }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {podeGerenciar && <SaveBar salvando={salvando} dirty={dirty} hint="Gatilhos de webhook por sequência, marco e inatividade." />}

      {/* Explicação + pré-requisitos */}
      <div className="flex items-start gap-3 rounded-2xl border bg-muted/30 p-4 text-sm">
        <Webhook className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1 text-muted-foreground">
          <p className="font-medium text-foreground">Como funciona</p>
          <p>Quando um gatilho abaixo é atingido, a plataforma envia o evento <code className="font-mono text-xs">gamificacao.*</code> (com o contato do aluno + a mensagem já montada) para os <strong>webhooks/automações</strong> que assinam esse evento — daí você roteia para WhatsApp/e-mail no seu fluxo.</p>
          <p>Configure o destino em <Link href="/admin/conexoes/webhooks" className="font-medium text-primary underline underline-offset-2">Conexões → Webhooks</Link> (ou na aba n8n) — no filtro escolha <strong>Gamificação</strong> e marque os eventos <code className="font-mono text-xs">gamificacao.inativo/sequencia/marco</code>. Requer a gamificação ativa e a migração <code className="font-mono text-xs">20260919000000</code> aplicada.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GatilhoCard icon={UserX} tom="#f43f5e" titulo="Parou de entrar (inatividade)" evento="gamificacao.inativo"
          descricao="Chama o aluno de volta quando ele fica sem entrar após ter iniciado." ativo={inativo.ativo} onToggle={(v) => setInativo({ ...inativo, ativo: v })} disabled={dis}>
          <NumberField stacked label="Enviar após" value={inativo.dias ?? 1} onChange={(v) => setInativo({ ...inativo, dias: Math.max(1, v) })} suffix="dia(s) sem entrar" min={1} disabled={dis} />
          <CampoMensagem value={inativo.mensagem} onChange={(v) => setInativo({ ...inativo, mensagem: v })} disabled={dis} />
        </GatilhoCard>

        <GatilhoCard icon={Flame} tom="#f97316" titulo="Sequência em andamento" evento="gamificacao.sequencia"
          descricao="Incentiva quando o aluno atinge N dias consecutivos." ativo={sequencia.ativo} onToggle={(v) => setSequencia({ ...sequencia, ativo: v })} disabled={dis}>
          <NumberField stacked label="Ao atingir" value={sequencia.dias ?? 4} onChange={(v) => setSequencia({ ...sequencia, dias: Math.max(2, v) })} suffix="dias seguidos" min={2} disabled={dis} />
          <CampoMensagem value={sequencia.mensagem} onChange={(v) => setSequencia({ ...sequencia, mensagem: v })} disabled={dis} />
        </GatilhoCard>

        <GatilhoCard icon={Trophy} tom="#8b5cf6" titulo="Marcos de sequência" evento="gamificacao.marco"
          descricao="Parabeniza a cada marco atingido (ex.: 7, 14, 21, 30 dias)." ativo={marco.ativo} onToggle={(v) => setMarco({ ...marco, ativo: v })} disabled={dis}>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Marcos (dias)</span>
            <input value={marcosTxt} onChange={(e) => setMarcosTxt(e.target.value)} placeholder="7, 14, 21, 30" disabled={dis}
              className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring disabled:opacity-60" />
            <span className="block text-[11px] text-muted-foreground">Separe por vírgula. Aplicados: <strong className="tabular-nums">{parseMarcos(marcosTxt).join(', ') || '—'}</strong></span>
          </label>
          <CampoMensagem value={marco.mensagem} onChange={(v) => setMarco({ ...marco, mensagem: v })} disabled={dis} />
        </GatilhoCard>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" /> Sequência e marcos disparam em tempo real (quando o aluno estuda); a inatividade é avaliada de hora em hora pelo worker. Cada gatilho é enviado uma única vez por ocorrência (sem repetição).</p>
    </form>
  )
}
