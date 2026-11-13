'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Gauge, ListChecks, FileText, PackageSearch, Play, Loader2, Check, EyeOff, ShieldCheck, RotateCcw, Printer, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/admin/data-table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ROTULO_CATEGORIA, ROTULO_SEVERIDADE, type Categoria, type Severidade } from '@/lib/seguranca/tipos'
import type { AchadoLinha } from '@/lib/seguranca/leitura'

export interface DetalheVarredura {
  varredura: any
  novos: { fingerprint: string; titulo: string; severidade: string }[]
  resolvidos: { fingerprint: string; titulo: string; severidade: string }[]
  persistentes: { fingerprint: string; titulo: string; severidade: string }[]
  erros: string[]
}

const ABAS = [
  { id: 'geral', label: 'Visão geral', icon: Gauge },
  { id: 'achados', label: 'Achados', icon: ListChecks },
  { id: 'relatorios', label: 'Relatórios', icon: FileText },
  { id: 'atualizacoes', label: 'Atualizações', icon: PackageSearch },
]

/** Abas de sublinhado (border-b-2), padrão do admin. */
export function SegurancaTabs({ ativa }: { ativa: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b">
      {ABAS.map((t) => {
        const Icone = t.icon
        return (
          <Link key={t.id} href={`/admin/seguranca?aba=${t.id}`}
            className={cn('relative flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition',
              ativa === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icone className="h-4 w-4 shrink-0" />{t.label}
          </Link>
        )
      })}
    </div>
  )
}

export const SEV_CLS: Record<Severidade, string> = {
  critico: 'bg-destructive text-destructive-foreground',
  alto: 'bg-destructive/15 text-destructive',
  medio: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  baixo: 'bg-muted text-muted-foreground',
}
export function SevBadge({ s }: { s: string }) {
  const k = s as Severidade
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', SEV_CLS[k] ?? SEV_CLS.baixo)}>{ROTULO_SEVERIDADE[k] ?? s}</span>
}

export function BotaoExecutar({ podeExecutar }: { podeExecutar: boolean }) {
  const router = useRouter()
  const [rodando, setRodando] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  if (!podeExecutar) return null
  async function rodar() {
    setRodando(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/seguranca/executar', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? `Concluída: ${j.total} achado(s), ${j.novos} novo(s), ${j.resolvidos} resolvido(s).` : (j.message ?? 'Falha ao executar.'))
      if (r.ok) router.refresh()
    } catch { setMsg('Falha de rede.') } finally { setRodando(false) }
  }
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <button type="button" onClick={rodar} disabled={rodando}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
        {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {rodando ? 'Executando…' : 'Executar varredura agora'}
      </button>
    </div>
  )
}

type Acao = 'resolvido' | 'ignorado' | 'aceito' | 'aberto'
const ROTULO_ACAO: Record<Acao, string> = { resolvido: 'Marcar como resolvido', ignorado: 'Ignorar', aceito: 'Aceitar o risco', aberto: 'Reabrir' }

export function AchadosTable({ rows, total, filtros, podeGerenciar }: { rows: AchadoLinha[]; total: number; filtros: React.ReactNode; podeGerenciar: boolean }) {
  const router = useRouter()
  const [alvo, setAlvo] = React.useState<{ row: AchadoLinha; acao: Acao } | null>(null)
  const [motivo, setMotivo] = React.useState('')
  const [salvando, setSalvando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  async function confirmar() {
    if (!alvo) return
    if (alvo.acao !== 'aberto' && !motivo.trim()) { setErro('Informe o motivo.'); return }
    setSalvando(true); setErro(null)
    const r = await fetch('/api/admin/seguranca/achado', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: alvo.row.id, status: alvo.acao, motivo: motivo.trim() || undefined }),
    }).catch(() => null)
    setSalvando(false)
    if (!r || !r.ok) { setErro((await r?.json().catch(() => ({})))?.message ?? 'Falha ao salvar.'); return }
    setAlvo(null); setMotivo(''); router.refresh()
  }

  return (
    <>
      <DataTable<AchadoLinha>
        rows={rows} total={total} getRowId={(r) => r.id} selectable={false} searchable searchPlaceholder="Buscar por título, arquivo ou detalhe…"
        perPageOptions={[10, 25, 50]} defaultPerPage={25} defaultSort={{ key: 'severidade_peso', dir: 'desc' }} filters={filtros}
        nomeSingular="achado" nomePlural="achados" empty="Nenhum achado com estes filtros."
        rowActions={podeGerenciar ? (r) => (r.status === 'aberto'
          ? [
              { label: ROTULO_ACAO.resolvido, icon: <Check className="h-4 w-4" />, onClick: () => { setAlvo({ row: r, acao: 'resolvido' }); setMotivo(''); setErro(null) } },
              { label: ROTULO_ACAO.ignorado, icon: <EyeOff className="h-4 w-4" />, onClick: () => { setAlvo({ row: r, acao: 'ignorado' }); setMotivo(''); setErro(null) } },
              { label: ROTULO_ACAO.aceito, icon: <ShieldCheck className="h-4 w-4" />, onClick: () => { setAlvo({ row: r, acao: 'aceito' }); setMotivo(''); setErro(null) } },
            ]
          : [{ label: ROTULO_ACAO.aberto, icon: <RotateCcw className="h-4 w-4" />, onClick: () => { setAlvo({ row: r, acao: 'aberto' }); setMotivo(''); setErro(null) } }]) : undefined}
        columns={[
          { key: 'severidade_peso', header: 'Severidade', sortable: true, width: '8rem', render: (r) => <SevBadge s={r.severidade} /> },
          { key: 'titulo', header: 'Achado', sortable: true, truncate: false, render: (r) => (
            <div className="min-w-0 py-1">
              <p className="truncate font-medium" title={r.titulo}>{r.titulo}</p>
              {r.recomendacao && <p className="truncate text-xs text-muted-foreground" title={r.recomendacao}>{r.recomendacao}</p>}
            </div>
          ), title: (r) => r.titulo },
          { key: 'categoria', header: 'Categoria', sortable: true, width: '11rem', render: (r) => ROTULO_CATEGORIA[r.categoria as Categoria] ?? r.categoria },
          { key: 'arquivo', header: 'Local', width: '16rem', render: (r) => <span className="font-mono text-xs">{r.arquivo ?? '—'}</span>, title: (r) => r.arquivo ?? '' },
          { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (r) => <span className="capitalize" title={r.motivo_status ?? undefined}>{r.status}</span> },
          { key: 'ultima_vez', header: 'Visto em', sortable: true, width: '9rem', render: (r) => new Date(r.ultima_vez).toLocaleDateString('pt-BR') },
        ]}
      />
      <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) setAlvo(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{alvo ? ROTULO_ACAO[alvo.acao] : ''}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{alvo?.row.titulo}</p>
          {alvo?.acao !== 'aberto' && (
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={1000} placeholder="Motivo (obrigatório, fica no log de auditoria)"
              className="w-full rounded-lg border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
          )}
          {erro && <p className="text-xs text-destructive">{erro}</p>}
          <DialogFooter>
            <button type="button" onClick={() => setAlvo(null)} className="h-9 rounded-lg border px-3 text-sm hover:bg-muted">Cancelar</button>
            <button type="button" onClick={confirmar} disabled={salvando} className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">{salvando ? 'Salvando…' : 'Confirmar'}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export interface VarreduraLinha { id: string; origem: string; iniciado: string; total: number; criticos: number; altos: number; novos: number; resolvidos: number; erros: number }

export function VarreduraTable({ rows, total }: { rows: VarreduraLinha[]; total: number }) {
  return (
    <DataTable<VarreduraLinha>
      rows={rows} total={total} getRowId={(r) => r.id} selectable={false} perPageOptions={[10, 25]} defaultPerPage={10}
      nomeSingular="varredura" nomePlural="varreduras" empty="Nenhuma varredura executada ainda."
      columns={[
        { key: 'iniciado_em', header: 'Início', sortable: false, width: '12rem', render: (r) => <Link className="font-medium hover:underline" href={`/admin/seguranca?aba=relatorios&v=${r.id}`}>{r.iniciado}</Link> },
        { key: 'origem', header: 'Origem', width: '7rem', render: (r) => r.origem },
        { key: 'total', header: 'Achados', width: '7rem', render: (r) => <span className="tabular-nums">{r.total}</span> },
        { key: 'criticos', header: 'Crít./Altos', width: '8rem', render: (r) => <span className="tabular-nums">{r.criticos}/{r.altos}</span> },
        { key: 'novos', header: 'Novos', width: '6rem', render: (r) => <span className="tabular-nums">{r.novos}</span> },
        { key: 'resolvidos', header: 'Resolvidos', width: '7rem', render: (r) => <span className="tabular-nums">{r.resolvidos}</span> },
        { key: 'erros', header: 'Erros', width: '6rem', render: (r) => <span className="tabular-nums">{r.erros}</span> },
      ]}
    />
  )
}

export interface AtualizacaoRow { id: string; pacote: string; versao_atual: string | null; versao_alvo: string | null; tipo: string; cve_ids: string[]; severidade: string; detectado_em: string }

export function AtualizacoesTable({ rows, total, filtros }: { rows: AtualizacaoRow[]; total: number; filtros: React.ReactNode }) {
  return (
    <DataTable<AtualizacaoRow>
      rows={rows} total={total} getRowId={(r) => r.id} selectable={false} searchable searchPlaceholder="Buscar pacote…"
      perPageOptions={[10, 25, 50]} defaultPerPage={25} defaultSort={{ key: 'detectado_em', dir: 'desc' }} filters={filtros}
      nomeSingular="pacote" nomePlural="pacotes" empty="Nenhuma atualização pendente."
      columns={[
        { key: 'pacote', header: 'Pacote', sortable: true, render: (r) => <span className="font-mono text-xs font-medium">{r.pacote}</span> },
        { key: 'versao', header: 'Versão', width: '14rem', render: (r) => <span className="font-mono text-xs">{r.versao_atual ?? '?'} → {r.versao_alvo ?? 'última'}</span> },
        { key: 'tipo', header: 'Salto', sortable: true, width: '7rem', render: (r) => <span className="capitalize">{r.tipo}</span> },
        { key: 'severidade', header: 'Severidade', sortable: true, width: '8rem', render: (r) => (r.cve_ids.length ? <SevBadge s={r.severidade} /> : <span className="text-muted-foreground">—</span>) },
        { key: 'cve', header: 'CVEs', width: '16rem', render: (r) => <span className="font-mono text-xs">{r.cve_ids.slice(0, 3).join(', ') || '—'}{r.cve_ids.length > 3 ? ` +${r.cve_ids.length - 3}` : ''}</span>, title: (r) => r.cve_ids.join(', ') },
        { key: 'detectado_em', header: 'Detectado', sortable: true, width: '9rem', render: (r) => new Date(r.detectado_em).toLocaleDateString('pt-BR') },
      ]}
    />
  )
}

export function AcoesRelatorio({ id }: { id: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/admin/seguranca/exportar?varredura=${id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><Download className="h-4 w-4" />Exportar CSV</a>
      <Link href={`/admin/seguranca/relatorio/${id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><Printer className="h-4 w-4" />Versão imprimível</Link>
    </div>
  )
}

export function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground print:hidden">
      <Printer className="h-4 w-4" />Imprimir / salvar PDF
    </button>
  )
}

export function DiffVarredura({ det }: { det: DetalheVarredura }) {
  const bloco = (titulo: string, itens: { fingerprint: string; titulo: string; severidade: string }[]) => (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo} ({itens.length})</h3>
      {itens.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nenhum.</p> : (
        <ul className="mt-1 space-y-1">
          {itens.slice(0, 100).map((i) => (
            <li key={i.fingerprint} className="flex items-center gap-2 text-sm"><SevBadge s={i.severidade} /><span className="truncate">{i.titulo}</span></li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {bloco('Novos / reabertos', det.novos)}
      {bloco('Resolvidos', det.resolvidos)}
      {bloco('Persistentes', det.persistentes)}
      {det.erros.length > 0 && (
        <div className="lg:col-span-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checagens com falha</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">{det.erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

