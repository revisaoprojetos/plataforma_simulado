'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Webhook, Plus, Trash2, Pencil, Loader2, Check, Zap, RefreshCw, AlertTriangle, Search, X, Lock, ListFilter, ChevronDown, FileJson, Copy, Send, Flame } from 'lucide-react'
import { criarWebhook, atualizarWebhook, toggleWebhook, excluirWebhook, testarWebhook } from '@/app/admin/conexoes/webhooks/actions'
import { resolverRegras } from '@/lib/webhooks/engajamento-regras'

type Wh = { id: string; nome: string; url: string; eventos: string[]; temSecret: boolean; ativo: boolean; ultimoStatus: string | null; ultimoEnvio: string | null; enviosSimultaneos: number; filtroSimulados: string[]; engajamentoRegras?: unknown }
type Evt = { chave: string; label: string; descricao?: string; grupo?: string }
type Sim = { id: string; titulo: string }

function gerarSecret() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function WebhooksConfig({ webhooks, eventos, simulados, precisaMigrar }: { webhooks: Wh[]; eventos: Evt[]; simulados: Sim[]; precisaMigrar: boolean }) {
  const [dialog, setDialog] = useState<{ modo: 'novo' | 'editar'; wh?: Wh } | null>(null)
  const [payloadWh, setPayloadWh] = useState<Wh | null>(null)
  const [busca, setBusca] = useState('')
  const [guiaAberta, setGuiaAberta] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const labelEvento = (c: string) => eventos.find((e) => e.chave === c)?.label ?? c

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? webhooks.filter((w) => `${w.nome} ${w.url}`.toLowerCase().includes(q)) : webhooks
  }, [webhooks, busca])

  function toggle(w: Wh) {
    start(async () => { const r = await toggleWebhook(w.id, !w.ativo); if (r.ok) router.refresh(); else toast.error(r.error ?? 'Erro') })
  }
  function excluir(id: string) {
    if (!confirm('Excluir este webhook?')) return
    start(async () => { const r = await excluirWebhook(id); if (r.ok) { toast.success('Webhook excluído.'); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }
  const [testando, setTestando] = useState<string | null>(null)
  async function testar(w: Wh, evento?: string) {
    setTestando(w.id)
    const r = await testarWebhook(w.id, evento)
    setTestando(null)
    if (r.ok) toast.success(`Teste enviado (${r.evento}) — HTTP ${r.status} em ${r.ms}ms`)
    else toast.error(`Falha no teste${r.evento ? ` (${r.evento})` : ''}: ${r.error ?? 'erro'}`)
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
            <p className="text-sm text-muted-foreground">Crie um workflow no n8n com um nó <b>Webhook</b>, copie a URL de produção e cole aqui. A cada evento assinado enviamos um <code className="rounded bg-muted px-1">POST</code> (formato estilo dos webhooks de venda, fácil de filtrar). Use o botão <b className="inline-flex items-center gap-1"><FileJson className="h-3 w-3" /> Ver payload</b> em cada webhook para inspecionar o JSON completo:</p>
            <pre className="mt-2 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">{JSON.stringify(exemploPayload('estudante.finalizou'), null, 2)}</pre>
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
                          {w.temSecret && <span className="inline-flex items-center gap-0.5"><Lock className="h-3 w-3" /> assinado</span>}
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
                      <Button variant="outline" size="icon" onClick={() => testar(w)} disabled={testando === w.id} aria-label="Testar" title="Enviar um POST de teste (payload de exemplo)">{testando === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
                      <Button variant="outline" size="icon" onClick={() => setPayloadWh(w)} aria-label="Ver payload" title="Ver payload enviado"><FileJson className="h-4 w-4" /></Button>
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
      {payloadWh && <PayloadDialog wh={payloadWh} eventos={eventos} onClose={() => setPayloadWh(null)} />}
    </div>
  )
}

/**
 * Monta um exemplo do corpo REAL enviado (espelha `lib/webhooks/dispatch.ts`). Estrutura fixa
 * em todos os eventos; os campos de resultado variam conforme o evento (iniciou → nulls).
 */
function exemploPayload(evento: string) {
  const statusEvento: Record<string, string> = {
    'estudante.iniciou': 'iniciado',
    'estudante.finalizou': 'finalizado',
    'estudante.nao_finalizou': 'nao_finalizado',
    'estudante.visualizou_relatorio': 'relatorio_visualizado',
    'estudante.baixou_relatorio': 'relatorio_baixado',
    'gamificacao.inativo': 'inativo',
    'gamificacao.sequencia': 'sequencia',
    'gamificacao.marco': 'marco',
  }
  const finalizado = evento === 'estudante.finalizou'
  const ehEngaj = evento.startsWith('gamificacao.')
  // Bloco de gamificação (eventos gamificacao.*) — populado por tipo; null nos demais (estrutura fixa).
  const engajamento = evento === 'gamificacao.inativo'
    ? { tipo: 'inativo', dias: 1, marco: null, streak_atual: 3, streak_maior: 12, mensagem: 'Oi João! Notamos que faz 1 dia que você não aparece por aqui. Bora voltar e retomar sua rotina de estudos? 💪' }
    : evento === 'gamificacao.sequencia'
      ? { tipo: 'sequencia', dias: 4, marco: null, streak_atual: 4, streak_maior: 12, mensagem: 'Mandou bem, João! Já são 4 dias seguidos estudando. Continue firme e não perca o ritmo! 🔥' }
      : evento === 'gamificacao.marco'
        ? { tipo: 'marco', dias: null, marco: 7, streak_atual: 7, streak_maior: 12, mensagem: 'Parabéns, João! 🏆 Você completou 7 dias consecutivos de estudo. Que constância!' }
        : { tipo: null, dias: null, marco: null, streak_atual: null, streak_maior: null, mensagem: null }
  return {
    id: ehEngaj ? null : '3f9a1c7e-0b2d-4e6a-9c11-8d5e2a7b4f10',
    type: 'estudante',
    webhook_type: 'progressao_estudante',
    plataforma: { id: 'ce74e4ab-dea1-4aaf-9122-992075d0912a', nome: 'Plataforma Simulado', slug: 'simulado' },
    event: evento,
    status: statusEvento[evento] ?? evento,
    dates: { created_at: '2026-07-16T13:00:00.000Z', occurred_at: '2026-07-16T13:00:00.000Z' },
    tenant_id: 'ce74e4ab-dea1-4aaf-9122-992075d0912a',
    contact: {
      id: 'a17b93c2-4d8e-4f1a-b6c0-2e9f7d3a5c88',
      name: 'João da Silva',
      email: 'joao.silva@email.com',
      doc: '12345678900',
      phone_number: '5571999670570',
      phone_local_code: '71',
      plano: 'passaporte',
    },
    // Nos eventos de engajamento não há sessão/simulado → esses campos vão null (igual ao envio real).
    simulado: ehEngaj ? { id: null, name: null } : { id: 'b2c4d6e8-1a3b-5c7d-9e0f-2b4d6f8a0c11', name: 'Simulado PGE — 1ª fase' },
    resultado: {
      sessao_id: ehEngaj ? null : '3f9a1c7e-0b2d-4e6a-9c11-8d5e2a7b4f10',
      nota: finalizado ? 8.5 : null,
      acertos: finalizado ? 17 : null,
      total: finalizado ? 20 : null,
      tentativa: ehEngaj ? null : 1,
      motivo: evento === 'estudante.nao_finalizou' ? 'tempo_esgotado' : null,
    },
    engajamento,
  }
}

/** Pop-up que mostra o CÓDIGO/estrutura do que é enviado (headers + body), estilo n8n. */
function PayloadDialog({ wh, eventos, onClose }: { wh: Wh; eventos: Evt[]; onClose: () => void }) {
  const eventosDoWh = wh.eventos.length ? wh.eventos : eventos.map((e) => e.chave)
  const [evento, setEvento] = useState(eventosDoWh[0] ?? 'estudante.finalizou')
  const [testando, setTestando] = useState(false)
  const labelEvento = (c: string) => eventos.find((e) => e.chave === c)?.label ?? c

  const corpo = useMemo(() => JSON.stringify(exemploPayload(evento), null, 2), [evento])
  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Webhook-Evento': evento }
    if (wh.temSecret) h['X-Webhook-Signature'] = 'sha256=e3b0c44298fc1c149afbf4c8996fb924…'
    return JSON.stringify(h, null, 2)
  }, [evento, wh.temSecret])

  const copiar = (txt: string) => { navigator.clipboard.writeText(txt).then(() => toast.success('Copiado!')).catch(() => toast.error('Não foi possível copiar')) }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex items-center justify-between bg-primary px-5 py-3 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold"><FileJson className="h-4 w-4" /> Payload enviado</h2>
            <p className="truncate text-xs text-primary-foreground/70">{wh.nome}</p>
          </div>
          <DialogClose render={<button type="button" aria-label="Fechar" className="rounded-md p-1 transition-colors hover:bg-white/20" />}><X className="h-4 w-4" /></DialogClose>
        </div>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
          <p className="text-xs text-muted-foreground">Exemplo do <code className="rounded bg-muted px-1">POST</code> que este webhook recebe. A estrutura é fixa em todos os eventos (campos que não se aplicam vão <code className="rounded bg-muted px-1">null</code>).</p>

          {/* Seletor de evento */}
          <div className="space-y-1.5">
            <Label>Evento</Label>
            <div className="flex flex-wrap gap-1.5">
              {eventosDoWh.map((c) => (
                <button key={c} type="button" onClick={() => setEvento(c)} className={cn('rounded-full border px-3 py-1 text-xs transition-colors', evento === c ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{labelEvento(c)}</button>
              ))}
            </div>
          </div>

          <BlocoCodigo titulo="Headers" texto={headers} onCopy={() => copiar(headers)} />
          <BlocoCodigo titulo="Body (JSON)" texto={corpo} onCopy={() => copiar(corpo)} />

          {wh.temSecret ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Lock className="mt-0.5 h-3 w-3 shrink-0" /> Este webhook está assinado: o corpo é validado no header <code className="rounded bg-muted px-1">X-Webhook-Signature</code> com HMAC-SHA256 do segredo.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Este webhook não tem segredo, então não enviamos assinatura. Adicione um segredo na edição para assinar o corpo.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/30 p-3">
          <Button type="button" variant="outline" disabled={testando} onClick={async () => {
            setTestando(true)
            const r = await testarWebhook(wh.id, evento)
            setTestando(false)
            if (r.ok) toast.success(`Teste enviado (${r.evento}) — HTTP ${r.status} em ${r.ms}ms`)
            else toast.error(`Falha no teste: ${r.error ?? 'erro'}`)
          }}>{testando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Enviar teste</Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Fechar</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BlocoCodigo({ titulo, texto, onCopy }: { titulo: string; texto: string; onCopy: () => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onCopy}><Copy className="h-3 w-3" /> Copiar</Button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/30 p-3 text-[11px] leading-relaxed"><code>{texto}</code></pre>
    </div>
  )
}

/** "7, 14 21;30" → [7,14,21,30] */
function parseMarcos(s: string): number[] {
  return [...new Set(s.split(/[^\d]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
}

function CampoMensagemWh({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">Mensagem</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
      <span className="block text-[10px] text-muted-foreground">Variáveis: <code className="font-mono">{'{{nome}}'}</code> <code className="font-mono">{'{{dias}}'}</code> <code className="font-mono">{'{{marco}}'}</code> <code className="font-mono">{'{{streak}}'}</code> <code className="font-mono">{'{{maior}}'}</code></span>
    </label>
  )
}

function WebhookDialog({ modo, wh, eventos, simulados, onClose }: { modo: 'novo' | 'editar'; wh?: Wh; eventos: Evt[]; simulados: Sim[]; onClose: () => void }) {
  const [nome, setNome] = useState(wh?.nome ?? '')
  const [url, setUrl] = useState(wh?.url ?? '')
  // O segredo NUNCA chega ao browser (só `temSecret`). Campo começa vazio: em branco = manter o atual.
  const [secret, setSecret] = useState('')
  const [ativo, setAtivo] = useState(wh?.ativo ?? true)
  const [envios, setEnvios] = useState(wh?.enviosSimultaneos ?? 5)
  // NOVO webhook começa só com eventos de SIMULADO (não marca gamificação por padrão → evita
  // "webhook de entrega veio com gamificação"). Ao editar, mantém o que estava salvo.
  const [sel, setSel] = useState<Set<string>>(new Set(wh?.eventos ?? eventos.filter((e) => e.grupo !== 'gamificacao').map((e) => e.chave)))
  const [filtrarSim, setFiltrarSim] = useState<boolean>((wh?.filtroSimulados?.length ?? 0) > 0)
  const [simSel, setSimSel] = useState<Set<string>>(new Set(wh?.filtroSimulados ?? []))
  // Regras de engajamento POR WEBHOOK — aparecem inline quando o evento gamificacao.* é marcado.
  const regras0 = resolverRegras(wh?.engajamentoRegras)
  const [inativoDias, setInativoDias] = useState(regras0.inativo.dias ?? 1)
  const [inativoMsg, setInativoMsg] = useState(regras0.inativo.mensagem)
  const [seqDias, setSeqDias] = useState(regras0.sequencia.dias ?? 4)
  const [seqMsg, setSeqMsg] = useState(regras0.sequencia.mensagem)
  const [marcosTxt, setMarcosTxt] = useState((regras0.marco.marcos ?? []).join(', '))
  const [marcoMsg, setMarcoMsg] = useState(regras0.marco.mensagem)
  const [pending, start] = useTransition()
  const router = useRouter()

  const toggleEvt = (c: string) => setSel((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n })
  const toggleSim = (id: string) => setSimSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const urlOk = /^https?:\/\/.+/i.test(url.trim())
  const nomeOk = nome.trim().length >= 3
  const grupoSim = eventos.filter((e) => e.grupo !== 'gamificacao')
  const grupoGamif = eventos.filter((e) => e.grupo === 'gamificacao')
  const temSimSel = grupoSim.some((e) => sel.has(e.chave))

  function salvar() {
    if (!nomeOk) return toast.error('O nome deve ter no mínimo 3 caracteres.')
    if (!urlOk) return toast.error('Informe uma URL válida (http/https).')
    if (sel.size === 0) return toast.error('Selecione ao menos um evento.')
    start(async () => {
      const data = {
        nome, url, eventos: [...sel], secret: secret || undefined, ativo,
        enviosSimultaneos: envios,
        filtroSimulados: filtrarSim ? [...simSel] : [],
        // Regras salvas sempre (só valem para os eventos gamificacao.* que o webhook assina).
        engajamentoRegras: {
          inativo: { dias: inativoDias, mensagem: inativoMsg },
          sequencia: { dias: seqDias, mensagem: seqMsg },
          marco: { marcos: parseMarcos(marcosTxt), mensagem: marcoMsg },
        },
      }
      const r = modo === 'novo' ? await criarWebhook(data) : await atualizarWebhook(wh!.id, data)
      if (r.ok) { toast.success(modo === 'novo' ? 'Webhook criado.' : 'Webhook atualizado.'); onClose(); router.refresh() }
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  // Campo de regra exibido inline sob um evento de gamificação marcado.
  function RegraGamif({ chave }: { chave: string }) {
    if (chave === 'gamificacao.inativo') return (
      <div className="mt-1 space-y-2 rounded-lg border border-dashed bg-muted/20 p-2.5">
        <label className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Enviar após</span>
          <Input type="number" min={1} value={inativoDias} onChange={(e) => setInativoDias(Math.max(1, Number(e.target.value) || 1))} className="h-8 w-20 text-center" /><span className="text-muted-foreground">dia(s) sem entrar</span></label>
        <CampoMensagemWh value={inativoMsg} onChange={setInativoMsg} />
      </div>
    )
    if (chave === 'gamificacao.sequencia') return (
      <div className="mt-1 space-y-2 rounded-lg border border-dashed bg-muted/20 p-2.5">
        <label className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Ao atingir</span>
          <Input type="number" min={2} value={seqDias} onChange={(e) => setSeqDias(Math.max(2, Number(e.target.value) || 2))} className="h-8 w-20 text-center" /><span className="text-muted-foreground">dias seguidos</span></label>
        <CampoMensagemWh value={seqMsg} onChange={setSeqMsg} />
      </div>
    )
    if (chave === 'gamificacao.marco') return (
      <div className="mt-1 space-y-2 rounded-lg border border-dashed bg-muted/20 p-2.5">
        <label className="block space-y-1"><span className="text-[11px] font-medium text-muted-foreground">Marcos (dias) — editável</span>
          <Input value={marcosTxt} onChange={(e) => setMarcosTxt(e.target.value)} placeholder="7, 14, 21, 30" className="h-8 tabular-nums" />
          <span className="block text-[10px] text-muted-foreground">Aplicados: <strong className="tabular-nums">{parseMarcos(marcosTxt).join(', ') || '—'}</strong></span></label>
        <CampoMensagemWh value={marcoMsg} onChange={setMarcoMsg} />
      </div>
    )
    return null
  }

  const linhaEvento = (e: Evt) => {
    const on = sel.has(e.chave)
    return (
      <div key={e.chave}>
        <button type="button" onClick={() => toggleEvt(e.chave)} className={cn('flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors', on ? 'bg-primary/5' : 'hover:bg-muted')}>
          <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
          <span className="min-w-0">
            <span className="block text-sm leading-tight">{e.label}</span>
            {e.descricao && <span className="block text-[11px] leading-snug text-muted-foreground">{e.descricao}</span>}
          </span>
        </button>
        {/* Regras aparecem quando o evento de gamificação é marcado (editáveis por webhook). */}
        {on && e.grupo === 'gamificacao' && <div className="pl-6"><RegraGamif chave={e.chave} /></div>}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl">
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

          {/* Eventos de SIMULADO */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Eventos de simulado</Label>
            <div className="space-y-1 rounded-lg border p-2">{grupoSim.map(linhaEvento)}</div>
            {temSimSel && (
              <div className="space-y-1.5 pt-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={filtrarSim} onChange={(e) => setFiltrarSim(e.target.checked)} className="accent-primary" /> Enviar só de simulados específicos</label>
                {filtrarSim && (
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
            )}
          </div>

          {/* Eventos de GAMIFICAÇÃO (engajamento) — com regras editáveis por evento marcado */}
          {grupoGamif.length > 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Flame className="h-3.5 w-3.5" /> Gamificação (engajamento)</Label>
              <div className="space-y-1 rounded-lg border p-2">{grupoGamif.map(linhaEvento)}</div>
              <p className="text-[11px] text-muted-foreground">Marque um gatilho para editar as regras dele (dias/marcos/mensagem). As regras valem só para este webhook.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Segredo (opcional — assina o corpo com HMAC)</Label>
            <div className="flex gap-2">
              <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={wh?.temSecret ? '•••••• (deixe em branco para manter o atual)' : 'deixe em branco para não assinar'} />
              <Button type="button" variant="outline" onClick={() => setSecret(gerarSecret())}><RefreshCw className="mr-1 h-4 w-4" /> Gerar</Button>
            </div>
            {wh?.temSecret && <p className="text-xs text-muted-foreground">Já existe um segredo salvo (oculto). Preencha só para trocá-lo.</p>}
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
