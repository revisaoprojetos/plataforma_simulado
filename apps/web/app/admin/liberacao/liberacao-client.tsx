'use client'

import { useState, useTransition } from 'react'
import { ShieldCheck, Plus, Pencil, Pause, Play, Ban, Trash2, Search, FlaskConical, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { confirmar } from '@/components/ui/confirm-dialog'
import type { RegraAdmin, ProdutoSeletor, StatusMapAdmin, PedidosPagina, PedidoAdmin } from '@/lib/integracoes/liberacao/dados'
import type { RegraFiltros, InicioConfig, FimConfig, PedidoNormalizado, ResultadoSimulacao } from '@/lib/integracoes/liberacao/tipos'
import { RegraEditor } from './regra-editor'
import {
  salvarRegraAction, pausarRegraAction, retomarRegraAction, cancelarRegraAction, excluirRegraAction,
  reprocessarPendentesAction, simularPedidoAction, listarPedidosAction, salvarStatusMapAction, removerStatusMapAction,
} from './actions'

const ABAS = [['regras', 'Regras'], ['pedidos', 'Pedidos'], ['simulador', 'Simulador'], ['status', 'Mapa de status']] as const
type Aba = (typeof ABAS)[number][0]

const sel = 'h-9 rounded-lg border bg-background px-2 text-sm'
const chip = 'rounded-full px-2 py-0.5 text-[11px] font-medium'
const ESTADO_LABEL: Record<string, string> = { pending: 'Pendente', granted: 'Concedido', no_matching_rule: 'Sem regra', blocked_by_paused_rule: 'Regra pausada', revoked: 'Revogado', ignored: 'Ignorado' }
const estadoCls = (e: string) =>
  e === 'granted' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  : e === 'no_matching_rule' || e === 'blocked_by_paused_rule' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  : e === 'revoked' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
  : e === 'pending' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
  : 'bg-muted text-muted-foreground'
const classCls = (c: string | null) =>
  c === 'positive' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  : c === 'negative' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
  : 'bg-muted text-muted-foreground'
const statusRegraCls = (s: string) =>
  s === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  : s === 'paused' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
const statusRegraLabel = (s: string) => (s === 'active' ? 'Ativa' : s === 'paused' ? 'Pausada' : 'Cancelada')

function resumoFiltros(f: RegraFiltros): string {
  const p: string[] = []
  if (f.plataformas.length) p.push(f.plataformas.join('/'))
  if (f.produtos.length) p.push(`${f.produtos.length} crit. produto`)
  if (f.ofertas.length) p.push(`${f.ofertas.length} crit. oferta`)
  if (f.periodoDe || f.periodoAte) p.push(`${f.periodoDe ?? '…'}–${f.periodoAte ?? '…'}`)
  if (!p.length) p.push(f.aplicarATudo ? 'todas as compras' : 'sem filtro')
  return p.join(' · ')
}
function resumoJanela(i: InicioConfig, f: FimConfig): string {
  const ini = i.tipo === 'immediate' ? 'imediato' : i.tipo === 'after_days' ? `+${i.dias}d` : `em ${i.data}`
  const fim = f.tipo === 'lifetime' ? 'vitalício' : f.tipo === 'after_days' ? `${f.dias}d` : `até ${f.data}`
  return `${ini} → ${fim}`
}

export function LiberacaoClient({ regras, produtos, statusMaps, pedidosInicial, podeEditar }: {
  regras: RegraAdmin[]; produtos: ProdutoSeletor[]; statusMaps: StatusMapAdmin[]; pedidosInicial: PedidosPagina; podeEditar: boolean
}) {
  const [aba, setAba] = useState<Aba>('regras')
  const [editando, setEditando] = useState<RegraAdmin | null | 'nova'>(null)
  const [salvando, start] = useTransition()

  function salvarRegra(input: Parameters<typeof salvarRegraAction>[0]) {
    start(async () => {
      const r = await salvarRegraAction(input)
      if ('error' in r && r.error) { toast.error(r.error); return }
      const res = (r as any).resumo
      toast.success(`Regra salva.${res ? ` ${res.concedidos} concessão(ões) aplicada(s), ${res.revogados} revogada(s).` : ''}`)
      setEditando(null)
    })
  }
  function pausar(rg: RegraAdmin) {
    start(async () => { const r = await pausarRegraAction(rg.id); if ('error' in r) toast.error(r.error); else toast.success('Regra pausada (acessos atuais mantidos).') })
  }
  async function retomar(rg: RegraAdmin) {
    const ok = await confirmar({ titulo: 'Retomar regra', mensagem: 'A regra volta a conceder para novas compras.', confirmar: 'Retomar' })
    if (!ok) return
    const aplicar = await confirmar({ titulo: 'Compras durante a pausa', mensagem: 'Aplicar também às compras feitas ENQUANTO a regra esteve pausada?', confirmar: 'Sim, aplicar', cancelar: 'Não, só daqui pra frente' })
    start(async () => { const r = await retomarRegraAction(rg.id, aplicar); if ('error' in r) toast.error(r.error); else toast.success(`Regra retomada.${aplicar ? ` ${(r as any).resumo?.concedidos ?? 0} compra(s) da pausa aplicada(s).` : ''}`) })
  }
  async function cancelar(rg: RegraAdmin) {
    const prev = await cancelarRegraAction(rg.id, true)
    const n = ('resumo' in prev ? prev.resumo?.revogados : 0) ?? 0
    const ok = await confirmar({ titulo: 'Cancelar regra', mensagem: `Cancelar é DEFINITIVO. ${n} concessão(ões) ativa(s) serão revogadas (o que outra regra/assinatura garante é mantido). A regra não volta a ativar.`, confirmar: 'Cancelar regra', destrutivo: true })
    if (!ok) return
    start(async () => { const r = await cancelarRegraAction(rg.id, false); if ('error' in r) toast.error(r.error); else toast.success('Regra cancelada.') })
  }
  async function excluir(rg: RegraAdmin) {
    const ok = await confirmar({ titulo: 'Excluir regra', mensagem: 'Revoga as concessões e remove a regra. Prefira Cancelar se quiser manter o histórico.', confirmar: 'Excluir', destrutivo: true })
    if (!ok) return
    start(async () => { const r = await excluirRegraAction(rg.id); if ('error' in r) toast.error(r.error); else toast.success('Regra excluída.') })
  }

  return (
    <div className="w-full space-y-6 px-1">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Regras de liberação</h1>
          <p className="text-sm text-muted-foreground">Libera produtos automaticamente a partir das vendas (webhooks), por regras configuráveis. Casamento AND estrito; concessões com data de início/fim.</p>
        </div>
      </div>

      {/* Abas (sublinhado) */}
      <div className="flex gap-1 border-b">
        {ABAS.map(([k, label]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${aba === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {aba === 'regras' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{regras.length} regra(s).</p>
            {podeEditar && <Button onClick={() => setEditando('nova')}><Plus className="h-4 w-4" />Nova regra</Button>}
          </div>
          {regras.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">Nenhuma regra ainda. Crie a primeira para liberar produtos automaticamente a partir das vendas.</div>
          ) : (
            <div className="grid gap-3">
              {regras.map((rg) => (
                <div key={rg.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{rg.nome}</span>
                        <span className={`${chip} ${statusRegraCls(rg.status)}`}>{statusRegraLabel(rg.status)}</span>
                        <span className="text-xs text-muted-foreground">prioridade {rg.prioridade}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Quando: {resumoFiltros(rg.filtros)}</div>
                      <div className="text-xs text-muted-foreground">Acesso: {resumoJanela(rg.inicio, rg.fim)} · {rg.grantsAtivos} concessão(ões) ativa(s)</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {rg.produtoNomes.map((n, i) => <span key={i} className={`${chip} bg-primary/10 text-primary`}>{n}</span>)}
                      </div>
                    </div>
                    {podeEditar && rg.status !== 'canceled' && (
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditando(rg)}><Pencil className="h-3.5 w-3.5" />Editar</Button>
                        {rg.status === 'active'
                          ? <Button variant="ghost" size="sm" onClick={() => pausar(rg)}><Pause className="h-3.5 w-3.5" />Pausar</Button>
                          : <Button variant="ghost" size="sm" onClick={() => retomar(rg)}><Play className="h-3.5 w-3.5" />Retomar</Button>}
                        <Button variant="ghost" size="sm" onClick={() => cancelar(rg)}><Ban className="h-3.5 w-3.5" />Cancelar</Button>
                        <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => excluir(rg)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {aba === 'pedidos' && <PedidosTab inicial={pedidosInicial} podeEditar={podeEditar} />}
      {aba === 'simulador' && <SimuladorTab />}
      {aba === 'status' && <StatusTab inicial={statusMaps} podeEditar={podeEditar} />}

      {editando && (
        <RegraEditor
          regra={editando === 'nova' ? null : editando}
          produtos={produtos}
          salvando={salvando}
          onSalvar={salvarRegra}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  )
}

// ───────── Pedidos ─────────
function PedidosTab({ inicial, podeEditar }: { inicial: PedidosPagina; podeEditar: boolean }) {
  const [dados, setDados] = useState<PedidosPagina>(inicial)
  const [estado, setEstado] = useState('todos')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [carregando, start] = useTransition()
  const porPagina = 20
  const totalPags = Math.max(1, Math.ceil(dados.total / porPagina))

  function carregar(novoEstado = estado, novaQ = q, novaPage = page) {
    start(async () => {
      const r = await listarPedidosAction({ estado: novoEstado, q: novaQ, page: novaPage })
      if ('error' in r) { toast.error(r.error); return }
      setDados({ rows: r.rows, total: r.total, totaisPorEstado: r.totaisPorEstado })
    })
  }
  function filtrarEstado(e: string) { setEstado(e); setPage(1); carregar(e, q, 1) }
  function buscar() { setPage(1); carregar(estado, q, 1) }
  function irPara(p: number) { setPage(p); carregar(estado, q, p) }

  async function reprocessar() {
    const prev = await reprocessarPendentesAction(true)
    const n = ('resumo' in prev ? prev.resumo?.concedidos : 0) ?? 0
    const novos = ('resumo' in prev ? prev.resumo?.novosCadastros : 0) ?? 0
    const ok = await confirmar({ titulo: 'Reprocessar pendentes', mensagem: `${n} pedido(s) pendente(s) passariam a conceder agora (${novos} criariam cadastro novo). Aplicar?`, confirmar: 'Reprocessar' })
    if (!ok) return
    start(async () => { const r = await reprocessarPendentesAction(false); if ('error' in r) toast.error(r.error); else { toast.success(`${(r as any).resumo.concedidos} pedido(s) concedido(s).`); carregar() } })
  }

  const chips = [['todos', 'Todos'], ['no_matching_rule', ESTADO_LABEL.no_matching_rule], ['blocked_by_paused_rule', ESTADO_LABEL.blocked_by_paused_rule], ['granted', ESTADO_LABEL.granted], ['revoked', ESTADO_LABEL.revoked], ['pending', ESTADO_LABEL.pending], ['ignored', ESTADO_LABEL.ignored]] as const

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map(([k, label]) => (
          <button key={k} onClick={() => filtrarEstado(k)}
            className={`${chip} border ${estado === k ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
            {label}{k !== 'todos' && dados.totaisPorEstado[k] != null ? ` (${dados.totaisPorEstado[k]})` : ''}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar() }} placeholder="E-mail, produto, pedido…" className="w-56 pl-9" />
        </div>
        {podeEditar && <Button variant="outline" onClick={reprocessar} disabled={carregando}><RefreshCw className="h-4 w-4" />Reprocessar pendentes</Button>}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {dados.rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{carregando ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Nenhum pedido.'}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Comprador</th><th className="px-3 py-2">Produto / oferta</th><th className="px-3 py-2">Plataforma</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Pedido</th></tr>
            </thead>
            <tbody className="divide-y">
              {dados.rows.map((p: PedidoAdmin) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="max-w-[16rem] truncate px-3 py-2" title={p.comprador_email ?? ''}>{p.comprador_nome || p.comprador_email || '—'}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2" title={`${p.produto_nome ?? ''} ${p.oferta_nome ?? ''}`}>{p.produto_nome || '—'}{p.oferta_nome ? ` · ${p.oferta_nome}` : ''}</td>
                  <td className="px-3 py-2">{p.provider}</td>
                  <td className="px-3 py-2"><span className={`${chip} ${classCls(p.status_classificacao)}`}>{p.status_bruto || p.status_classificacao || '—'}</span></td>
                  <td className="px-3 py-2"><span className={`${chip} ${estadoCls(p.processing_state)}`}>{ESTADO_LABEL[p.processing_state] ?? p.processing_state}</span></td>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-xs text-muted-foreground" title={p.pedido_id}>{p.pedido_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPags > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button variant="ghost" size="sm" disabled={page <= 1 || carregando} onClick={() => irPara(page - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button>
          <span className="text-muted-foreground">{page} / {totalPags}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPags || carregando} onClick={() => irPara(page + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}

// ───────── Simulador ─────────
function SimuladorTab() {
  const [p, setP] = useState<PedidoNormalizado>({ plataforma: 'guru', produtoId: '', produtoNome: '', ofertaId: '', ofertaNome: '', dataCompra: '' })
  const [res, setRes] = useState<ResultadoSimulacao | null>(null)
  const [rodando, start] = useTransition()
  const upd = (patch: Partial<PedidoNormalizado>) => setP((cur) => ({ ...cur, ...patch }))
  function simular() {
    start(async () => {
      const r = await simularPedidoAction({ ...p, produtoId: p.produtoId || null, produtoNome: p.produtoNome || null, ofertaId: p.ofertaId || null, ofertaNome: p.ofertaNome || null, dataCompra: p.dataCompra || null })
      if ('error' in r) { toast.error(r.error); return }
      setRes(r.resultado)
    })
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Pedido de teste</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">Plataforma<Input className="mt-1" value={p.plataforma} onChange={(e) => upd({ plataforma: e.target.value })} /></label>
          <label className="text-xs font-medium text-muted-foreground">Data da compra<Input type="date" className="mt-1" value={p.dataCompra ?? ''} onChange={(e) => upd({ dataCompra: e.target.value })} /></label>
          <label className="text-xs font-medium text-muted-foreground">ID do produto<Input className="mt-1" value={p.produtoId ?? ''} onChange={(e) => upd({ produtoId: e.target.value })} /></label>
          <label className="text-xs font-medium text-muted-foreground">Nome do produto<Input className="mt-1" value={p.produtoNome ?? ''} onChange={(e) => upd({ produtoNome: e.target.value })} /></label>
          <label className="text-xs font-medium text-muted-foreground">ID da oferta<Input className="mt-1" value={p.ofertaId ?? ''} onChange={(e) => upd({ ofertaId: e.target.value })} /></label>
          <label className="text-xs font-medium text-muted-foreground">Nome da oferta<Input className="mt-1" value={p.ofertaNome ?? ''} onChange={(e) => upd({ ofertaNome: e.target.value })} /></label>
        </div>
        <Button className="mt-4" onClick={simular} disabled={rodando}>{rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}Simular</Button>
      </div>
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Resultado (não grava nada)</p>
        {!res ? <p className="text-sm text-muted-foreground">Preencha o pedido e clique em Simular.</p> : (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Produtos que seriam liberados</p>
              {res.concederiaProdutos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum (nenhuma regra ativa casa).</p>
                : <div className="mt-1 flex flex-wrap gap-1">{res.concederiaProdutos.map((pr) => <span key={pr.id} className={`${chip} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`}>{pr.nome}</span>)}</div>}
            </div>
            <div className="space-y-2">
              {res.regras.map((r) => (
                <div key={r.regraId} className="rounded-lg border p-2">
                  <div className="flex items-center gap-2">
                    <span className={`${chip} ${r.casou ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{r.casou ? 'casou' : 'não casou'}</span>
                    <span className="text-sm font-medium">{r.nome}</span>
                    <span className={`${chip} ${statusRegraCls(r.status)}`}>{statusRegraLabel(r.status)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {r.dimensoes.map((d, i) => <span key={i} className={d.configurada && !d.casou ? 'text-rose-600 dark:text-rose-400' : ''}>{d.dimensao}: {d.configurada ? (d.casou ? 'ok' : 'falhou') : '—'}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ───────── Mapa de status ─────────
function StatusTab({ inicial, podeEditar }: { inicial: StatusMapAdmin[]; podeEditar: boolean }) {
  const [provider, setProvider] = useState('')
  const [valor, setValor] = useState('')
  const [classificacao, setClassificacao] = useState<'positive' | 'negative' | 'neutral'>('positive')
  const [salvando, start] = useTransition()
  function add() {
    if (!valor.trim()) { toast.error('Informe o status.'); return }
    start(async () => { const r = await salvarStatusMapAction({ provider, valor, classificacao }); if ('error' in r) toast.error(r.error); else { toast.success('Mapeamento salvo.'); setValor('') } })
  }
  function remover(id: string) { start(async () => { const r = await removerStatusMapAction(id); if ('error' in r) toast.error(r.error) }) }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Define como um status bruto da plataforma é tratado: <span className="text-emerald-600 dark:text-emerald-400">libera</span>, <span className="text-rose-600 dark:text-rose-400">revoga</span> ou neutro. Sobrepõe os padrões. Deixe a plataforma em branco para valer p/ todas.</p>
      {podeEditar && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-4 shadow-sm">
          <label className="text-xs font-medium text-muted-foreground">Plataforma (ou vazio)<Input className="mt-1 w-40" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="qualquer" /></label>
          <label className="text-xs font-medium text-muted-foreground">Status bruto<Input className="mt-1 w-48" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ex.: waiting_payment" /></label>
          <label className="text-xs font-medium text-muted-foreground">Classificação<select className={`${sel} mt-1 block w-36`} value={classificacao} onChange={(e) => setClassificacao(e.target.value as any)}><option value="positive">Libera</option><option value="negative">Revoga</option><option value="neutral">Neutro</option></select></label>
          <Button onClick={add} disabled={salvando}><Plus className="h-4 w-4" />Adicionar</Button>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {inicial.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Nenhum mapeamento personalizado (usando os padrões).</div> : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Plataforma</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Classificação</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y">
              {inicial.map((m) => (
                <tr key={m.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">{m.provider || <span className="text-muted-foreground">qualquer</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs">{m.valor_normalizado}</td>
                  <td className="px-3 py-2"><span className={`${chip} ${classCls(m.classificacao)}`}>{m.classificacao === 'positive' ? 'Libera' : m.classificacao === 'negative' ? 'Revoga' : 'Neutro'}</span></td>
                  <td className="px-3 py-2 text-right">{podeEditar && <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => remover(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
