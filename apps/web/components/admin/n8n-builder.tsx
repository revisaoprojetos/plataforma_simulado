'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { Workflow, Plus, Trash2, Pencil, Loader2, Check, Zap, MessageCircle, Mail, Globe, GitBranch, ChevronLeft, X, ChevronRight } from 'lucide-react'
import { salvarAutomacao, toggleAutomacao, excluirAutomacao } from '@/app/admin/conexoes/n8n/actions'

type Evt = { chave: string; label: string }
type Sim = { id: string; titulo: string }
type Passo = { id: string; tipo: string; nome: string; config: Record<string, any> }
type Automacao = { id: string; nome: string; ativo: boolean; gatilho: string | null; passos: Passo[]; ultimoStatus: string | null; ultimoRun: string | null }

type CampoDef = { key: string; label: string; textarea?: boolean; select?: string[] }
const TIPOS: Record<string, { nome: string; icon: any; cor: string; campos: CampoDef[] }> = {
  whatsapp: { nome: 'Enviar WhatsApp', icon: MessageCircle, cor: '#25D366', campos: [{ key: 'telefone', label: 'Telefone' }, { key: 'mensagem', label: 'Mensagem', textarea: true }] },
  email: { nome: 'Enviar E-mail', icon: Mail, cor: '#6366f1', campos: [{ key: 'para', label: 'Para' }, { key: 'assunto', label: 'Assunto' }, { key: 'corpo', label: 'Corpo', textarea: true }] },
  http: { nome: 'HTTP Request', icon: Globe, cor: '#f59e0b', campos: [{ key: 'metodo', label: 'Método', select: ['POST', 'GET', 'PUT', 'PATCH'] }, { key: 'url', label: 'URL' }, { key: 'corpo', label: 'Corpo (JSON)', textarea: true }] },
  condicao: { nome: 'Condição (SE)', icon: GitBranch, cor: '#8b5cf6', campos: [{ key: 'campo', label: 'Campo (ex.: resultado.nota)' }, { key: 'operador', label: 'Operador', select: ['>', '>=', '<', '<=', '==', '!='] }, { key: 'valor', label: 'Valor' }] },
}
const VARIAVEIS = ['{{contact.name}}', '{{contact.email}}', '{{contact.phone_number}}', '{{contact.doc}}', '{{simulado.name}}', '{{resultado.nota}}', '{{event}}']

export function N8nBuilder({ automacoes, eventos, simulados }: { automacoes: Automacao[]; eventos: Evt[]; simulados: Sim[] }) {
  const [editando, setEditando] = useState<Automacao | 'nova' | null>(null)
  if (editando) return <Editor automacao={editando === 'nova' ? null : editando} eventos={eventos} onVoltar={() => setEditando(null)} />
  return <Lista automacoes={automacoes} eventos={eventos} onNova={() => setEditando('nova')} onEditar={(a) => setEditando(a)} />
}

function Lista({ automacoes, eventos, onNova, onEditar }: { automacoes: Automacao[]; eventos: Evt[]; onNova: () => void; onEditar: (a: Automacao) => void }) {
  const [pending, start] = useTransition()
  const labelEvento = (c: string | null) => eventos.find((e) => e.chave === c)?.label ?? c ?? 'Sem gatilho'
  function toggle(a: Automacao) { start(async () => { const r = await toggleAutomacao(a.id, !a.ativo); if (r.ok) location.reload(); else toast.error(r.error ?? 'Erro') }) }
  function excluir(id: string) { if (!confirm('Excluir esta automação?')) return; start(async () => { const r = await excluirAutomacao(id); if (r.ok) location.reload(); else toast.error(r.error ?? 'Erro') }) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Monte fluxos que rodam quando um evento do estudante acontece — sem sair da plataforma.</p>
        <Button onClick={onNova}><Plus className="mr-1.5 h-4 w-4" /> Nova automação</Button>
      </div>

      {automacoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Workflow className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhuma automação ainda. Crie a primeira: escolha um gatilho e adicione ações (WhatsApp, e-mail, HTTP…).</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {automacoes.map((a) => (
            <div key={a.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', a.ativo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}><Workflow className="h-4 w-4" /></span>
                  <p className="truncate font-semibold">{a.nome}</p>
                </div>
                <Switch checked={a.ativo} onCheckedChange={() => toggle(a)} disabled={pending} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Gatilho: <b className="text-foreground">{labelEvento(a.gatilho)}</b></p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {a.passos.length === 0 ? <span className="text-xs text-muted-foreground">Sem ações</span> : a.passos.map((p) => {
                  const t = TIPOS[p.tipo]; const Icon = t?.icon ?? Globe
                  return <span key={p.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]"><Icon className="h-3 w-3" style={{ color: t?.cor }} /> {t?.nome ?? p.tipo}</span>
                })}
              </div>
              {a.ultimoStatus && <p className="mt-2 text-[11px] text-muted-foreground">Última execução: {a.ultimoStatus}{a.ultimoRun ? ` · ${new Date(a.ultimoRun).toLocaleString('pt-BR')}` : ''}</p>}
              <div className="mt-3 flex justify-end gap-1.5">
                <Button variant="outline" size="sm" onClick={() => onEditar(a)}><Pencil className="mr-1 h-3.5 w-3.5" /> Editar</Button>
                <Button variant="outline" size="icon" onClick={() => excluir(a.id)} disabled={pending} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Editor({ automacao, eventos, onVoltar }: { automacao: Automacao | null; eventos: Evt[]; onVoltar: () => void }) {
  const [nome, setNome] = useState(automacao?.nome ?? 'Nova automação')
  const [ativo, setAtivo] = useState(automacao?.ativo ?? true)
  const [gatilho, setGatilho] = useState<string | null>(automacao?.gatilho ?? eventos[0]?.chave ?? null)
  const [passos, setPassos] = useState<Passo[]>(automacao?.passos ?? [])
  const [sel, setSel] = useState<string>('gatilho')
  const [addOpen, setAddOpen] = useState(false)
  const [pending, start] = useTransition()

  const addPasso = (tipo: string) => {
    const t = TIPOS[tipo]
    const novo: Passo = { id: crypto.randomUUID(), tipo, nome: t.nome, config: {} }
    setPassos((p) => [...p, novo]); setSel(novo.id); setAddOpen(false)
  }
  const removePasso = (id: string) => { setPassos((p) => p.filter((x) => x.id !== id)); if (sel === id) setSel('gatilho') }
  const setConfig = (id: string, key: string, val: any) => setPassos((p) => p.map((x) => x.id === id ? { ...x, config: { ...x.config, [key]: val } } : x))

  function salvar() {
    start(async () => {
      const r = await salvarAutomacao(automacao?.id ?? null, { nome, gatilho, passos, ativo })
      if (r.ok) location.reload()
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  const passoSel = passos.find((p) => p.id === sel)

  return (
    <div className="space-y-3">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <Button variant="outline" size="sm" onClick={onVoltar}><ChevronLeft className="mr-1 h-4 w-4" /> Voltar</Button>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="max-w-xs" />
        <div className="flex items-center gap-2"><Switch checked={ativo} onCheckedChange={setAtivo} id="auto-ativo" /><Label htmlFor="auto-ativo" className="text-sm">Ativa</Label></div>
        <Button className="ml-auto" onClick={salvar} disabled={pending}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Salvar</Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Canvas estilo n8n */}
        <div className="relative overflow-x-auto rounded-2xl border bg-[radial-gradient(circle,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:18px_18px] p-6 dark:bg-[radial-gradient(circle,rgba(148,163,184,0.12)_1px,transparent_1px)]">
          <div className="flex min-h-[260px] items-center gap-0">
            {/* Nó de gatilho */}
            <NoCard selecionado={sel === 'gatilho'} onClick={() => setSel('gatilho')} icon={Zap} cor="#f97316" titulo="Gatilho" sub={eventos.find((e) => e.chave === gatilho)?.label ?? 'Escolha o evento'} trigger />
            {passos.map((p) => {
              const t = TIPOS[p.tipo]
              return (
                <div key={p.id} className="flex items-center">
                  <Conector />
                  <NoCard selecionado={sel === p.id} onClick={() => setSel(p.id)} icon={t?.icon ?? Globe} cor={t?.cor ?? '#64748b'} titulo={t?.nome ?? p.tipo} sub={resumo(p)} onRemove={() => removePasso(p.id)} />
                </div>
              )
            })}
            {/* Botão adicionar */}
            <Conector />
            <div className="relative">
              <button type="button" onClick={() => setAddOpen((v) => !v)} className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-primary/40 text-primary transition hover:bg-primary/5" aria-label="Adicionar ação"><Plus className="h-5 w-5" /></button>
              {addOpen && (
                <div className="absolute left-14 top-0 z-20 w-52 rounded-xl border bg-popover p-1 shadow-lg">
                  <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">Ferramentas</p>
                  {Object.entries(TIPOS).map(([tipo, t]) => {
                    const Icon = t.icon
                    return (
                      <button key={tipo} type="button" onClick={() => addPasso(tipo)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `${t.cor}22`, color: t.cor }}><Icon className="h-3.5 w-3.5" /></span>
                        {t.nome}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Painel de edição do nó */}
        <div className="rounded-2xl border bg-card p-4">
          {sel === 'gatilho' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#f9731622', color: '#f97316' }}><Zap className="h-4 w-4" /></span><h3 className="text-sm font-semibold">Gatilho</h3></div>
              <div className="space-y-1.5">
                <Label>Evento que dispara</Label>
                <div className="space-y-1 rounded-lg border p-2">
                  {eventos.map((e) => (
                    <button key={e.chave} type="button" onClick={() => setGatilho(e.chave)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', gatilho === e.chave ? 'bg-primary/5 font-medium' : 'hover:bg-muted')}>
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', gatilho === e.chave ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{gatilho === e.chave && <Check className="h-3 w-3" />}</span>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : passoSel ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => { const t = TIPOS[passoSel.tipo]; const Icon = t?.icon ?? Globe; return <><span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${t?.cor}22`, color: t?.cor }}><Icon className="h-4 w-4" /></span><h3 className="text-sm font-semibold">{t?.nome}</h3></> })()}
                </div>
                <Button variant="ghost" size="icon" onClick={() => removePasso(passoSel.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
              {TIPOS[passoSel.tipo]?.campos.map((c) => (
                <div key={c.key} className="space-y-1.5">
                  <Label>{c.label}</Label>
                  {c.select ? (
                    <select value={passoSel.config[c.key] ?? c.select[0]} onChange={(e) => setConfig(passoSel.id, c.key, e.target.value)} className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                      {c.select.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : c.textarea ? (
                    <Textarea rows={3} value={passoSel.config[c.key] ?? ''} onChange={(e) => setConfig(passoSel.id, c.key, e.target.value)} placeholder="use variáveis como {{contact.name}}" />
                  ) : (
                    <Input value={passoSel.config[c.key] ?? ''} onChange={(e) => setConfig(passoSel.id, c.key, e.target.value)} />
                  )}
                </div>
              ))}
              <div className="rounded-lg border bg-muted/30 p-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Variáveis</p>
                <div className="mt-1 flex flex-wrap gap-1">{VARIAVEIS.map((v) => <code key={v} className="rounded bg-muted px-1 text-[10px]">{v}</code>)}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">As ações <b>WhatsApp</b> e <b>E-mail</b> ficam salvas; o envio real depende da integração desses canais (em preparação). <b>HTTP Request</b> já pode chamar qualquer URL (inclusive um fluxo n8n).</p>
    </div>
  )
}

function resumo(p: Passo): string {
  if (p.tipo === 'http') return `${p.config.metodo ?? 'POST'} ${p.config.url ?? '—'}`
  if (p.tipo === 'whatsapp') return p.config.telefone ? String(p.config.telefone) : 'sem destino'
  if (p.tipo === 'email') return p.config.para ? String(p.config.para) : 'sem destino'
  if (p.tipo === 'condicao') return `${p.config.campo ?? '?'} ${p.config.operador ?? ''} ${p.config.valor ?? ''}`
  return ''
}

function Conector() {
  return (
    <div className="flex items-center text-muted-foreground/50">
      <ChevronRight className="h-5 w-5" />
    </div>
  )
}

function NoCard({ selecionado, onClick, icon: Icon, cor, titulo, sub, onRemove, trigger }: { selecionado: boolean; onClick: () => void; icon: any; cor: string; titulo: string; sub: string; onRemove?: () => void; trigger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('group relative flex w-44 flex-col gap-2 rounded-2xl border-2 bg-card p-3 text-left shadow-sm transition-all hover:shadow-md', selecionado ? 'border-primary ring-2 ring-primary/20' : 'border-border', trigger && 'rounded-l-[2rem]')}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${cor}22`, color: cor }}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{titulo}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      {onRemove && <span onClick={(e) => { e.stopPropagation(); onRemove() }} className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition group-hover:opacity-100"><X className="h-3 w-3" /></span>}
    </button>
  )
}
