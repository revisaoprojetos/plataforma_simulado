'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { HardDrive, RefreshCw, Loader2, Save, Database, Info, Sparkles, Wand2, Trash2, ListChecks, CheckCircle2, Building2, ChevronRight } from 'lucide-react'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { UsoArmazenamentoBar } from '@/components/super/uso-armazenamento-bar'
import { formatarBytes, gbParaBytes, bytesParaGb } from '@/lib/storage/formato'
import type { EstadoUso } from '@/lib/storage/uso'
import type { RelatorioOrganizador } from '@/lib/storage/organizador'
import { recalcularUsoAction, definirLimiteAction, analisarOrganizacaoAction, aplicarMigracaoAction, limparOrfaosAction } from './actions'

function quandoBrt(iso: string | null): string {
  if (!iso) return 'nunca'
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

/** Editor compacto de limite (em GB) para um bucket ou o global ('*'). */
function EditorLimite({ chave, rotulo, atualBytes, onSalvo }: { chave: string; rotulo: string; atualBytes: number | null; onSalvo: (bytes: number | null) => void }) {
  const [valor, setValor] = useState(atualBytes != null ? String(Number(bytesParaGb(atualBytes).toFixed(2))) : '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const limpo = valor.trim().replace(',', '.')
    const bytes = limpo === '' ? null : gbParaBytes(Number(limpo))
    if (bytes != null && (!isFinite(bytes) || bytes < 0)) {
      toast.error('Informe um número de GB válido (ou deixe vazio para "sem limite").')
      setSalvando(false)
      return
    }
    const r = await definirLimiteAction(chave, bytes)
    setSalvando(false)
    if (!r.ok) return toast.error(r.error ?? 'Falha ao salvar o limite.')
    toast.success('Limite atualizado.')
    onSalvo(bytes)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm">{rotulo}</span>
      <div className="flex items-center gap-1">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') salvar() }}
          placeholder="sem limite"
          inputMode="decimal"
          className="w-24 rounded-lg border bg-transparent px-2 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">GB</span>
        <button
          onClick={salvar}
          disabled={salvando}
          className="ml-1 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
        </button>
      </div>
    </div>
  )
}

/** Painel de organização automática (segura): analisar → corrigir mal posicionados / limpar órfãos. */
function OrganizarPanel() {
  const [rel, setRel] = useState<RelatorioOrganizador | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  async function analisar() {
    setAnalisando(true)
    const r = await analisarOrganizacaoAction()
    setAnalisando(false)
    if (!r.ok || !r.relatorio) return toast.error(r.error ?? 'Falha ao analisar.')
    setRel(r.relatorio)
  }

  async function corrigirMisplaced() {
    if (!rel) return
    const itens = rel.itens.filter((i) => i.status === 'MISPLACED' && i.destino).map((i) => ({ bucket: i.bucket, de: i.path, para: i.destino as string }))
    if (!itens.length) return
    if (!(await confirmar({ titulo: 'Corrigir posicionamento', mensagem: `Mover ${itens.length} arquivo(s) para o caminho correto? Cada um é copiado, as referências são reapontadas e só então o original é apagado (com backup).`, confirmar: 'Corrigir' }))) return
    setAplicando(true)
    const r = await aplicarMigracaoAction(itens)
    setAplicando(false)
    if (!r.ok) return toast.error(r.error ?? 'Falha ao corrigir.')
    toast.success(`${r.migrados ?? 0} corrigido(s)${r.falhas?.length ? ` · ${r.falhas.length} falha(s)` : ''}.`)
    analisar()
  }

  async function limparOrfaos() {
    if (!rel) return
    const n = rel.resumo.ORPHAN
    if (!n) return
    const txt = await pedirTexto({ titulo: 'Limpar órfãos', mensagem: `Digite ${n} para apagar ${n} arquivo(s) sem referência (${formatarBytes(rel.resumo.totalBytesOrfaos)}). Um backup é guardado antes.`, label: 'Quantidade', placeholder: String(n) })
    if (txt === null) return
    if (txt !== String(n)) return toast.error('Quantidade não confere.')
    if (!(await confirmar({ destrutivo: true, mensagem: `Apagar ${n} órfão(s) permanentemente? (backup guardado)`, confirmar: 'Apagar órfãos' }))) return
    setAplicando(true)
    const r = await limparOrfaosAction()
    setAplicando(false)
    if (!r.ok) return toast.error(r.error ?? 'Falha ao limpar.')
    toast.success(`${r.excluidos ?? 0} apagado(s)${r.pulados ? ` · ${r.pulados} pulado(s)` : ''}.`)
    analisar()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4 text-primary" /> Organização automática (segura)</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Analisa o storage e corrige o que está fora do lugar ou solto. Nada é apagado sem prévia, confirmação e backup.</p>
          </div>
          <button onClick={analisar} disabled={analisando || aplicando} className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60">
            {analisando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />} Analisar
          </button>
        </div>
      </div>

      {rel && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> No lugar certo</p>
              <p className="mt-1 text-2xl font-bold">{rel.resumo.OK.toLocaleString('pt-BR')}</p>
            </div>
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-sky-500" /> Mal posicionados</p>
              <p className="mt-1 text-2xl font-bold">{rel.resumo.MISPLACED.toLocaleString('pt-BR')}</p>
              {rel.resumo.MISPLACED > 0 && (
                <button onClick={corrigirMisplaced} disabled={aplicando} className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
                  {aplicando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Corrigir
                </button>
              )}
            </div>
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Trash2 className="h-3.5 w-3.5 text-amber-500" /> Órfãos (sem uso)</p>
              <p className="mt-1 text-2xl font-bold">{rel.resumo.ORPHAN.toLocaleString('pt-BR')}</p>
              <p className="text-[11px] text-muted-foreground">{formatarBytes(rel.resumo.totalBytesOrfaos)}</p>
              {rel.resumo.ORPHAN > 0 && (
                <button onClick={limparOrfaos} disabled={aplicando} className="mt-2 flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60">
                  {aplicando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Limpar órfãos
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Total analisado: {(rel.resumo.OK + rel.resumo.MISPLACED + rel.resumo.ORPHAN).toLocaleString('pt-BR')} arquivo(s).</p>
        </>
      )}
    </div>
  )
}

type PorTenant = { tenantId: string; nome: string; totalBytes: number; arquivos: number }

export function ArmazenamentoClient({ estadoInicial, limitesIniciais, porTenantInicial }: { estadoInicial: EstadoUso; limitesIniciais: Record<string, number | null>; porTenantInicial: PorTenant[] }) {
  const [aba, setAba] = useState<'visao' | 'organizar'>('visao')
  const [estado, setEstado] = useState<EstadoUso>(estadoInicial)
  const [limites, setLimites] = useState<Record<string, number | null>>(limitesIniciais)
  const [recalculando, setRecalculando] = useState(false)

  const snap = estado.snapshot
  const porTenant = porTenantInicial
  const maxTenant = Math.max(1, ...porTenant.map((t) => t.totalBytes))

  async function recalcular() {
    setRecalculando(true)
    const r = await recalcularUsoAction()
    setRecalculando(false)
    if (!r.ok || !r.estado) return toast.error(r.error ?? 'Falha ao recalcular.')
    setEstado(r.estado)
    toast.success('Armazenamento recalculado.')
  }

  const limiteGlobal = limites['*'] ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><HardDrive className="h-5 w-5" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Armazenamento</h1>
            <p className="text-muted-foreground">Uso do storage do projeto (Supabase), por bucket e categoria. Último cálculo: {quandoBrt(estado.calculadoEm)}.</p>
          </div>
        </div>
        <button
          onClick={recalcular}
          disabled={recalculando}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {recalculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {recalculando ? 'Recalculando…' : 'Recalcular'}
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b text-sm">
        <button onClick={() => setAba('visao')} className={`-mb-px border-b-2 px-3 py-2 font-medium transition-colors ${aba === 'visao' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Visão geral</button>
        <button onClick={() => setAba('organizar')} className={`-mb-px border-b-2 px-3 py-2 font-medium transition-colors ${aba === 'organizar' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Organizar</button>
      </div>

      {aba === 'organizar' && <OrganizarPanel />}

      {aba === 'visao' && (<>
      {estado.status === 'erro' && estado.erro && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Último cálculo falhou: {estado.erro}
        </div>
      )}

      {!snap ? (
        <div className="rounded-2xl border bg-muted/30 p-10 text-center">
          <Database className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nunca calculado. Clique em <strong>Recalcular</strong> para varrer os buckets e montar o panorama.</p>
        </div>
      ) : (
        <>
          {/* Resumo global */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total usado</p>
                <p className="text-2xl font-bold tracking-tight">{formatarBytes(snap.totalBytes)}</p>
                <p className="text-xs text-muted-foreground">{snap.totalArquivos.toLocaleString('pt-BR')} arquivos em {snap.buckets.length} bucket(s){limiteGlobal ? ` · limite global ${formatarBytes(limiteGlobal)}` : ''}</p>
              </div>
              <div className="w-full sm:w-auto">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Limite global do projeto</p>
                <EditorLimite chave="*" rotulo="" atualBytes={limiteGlobal} onSalvo={(b) => setLimites((p) => ({ ...p, '*': b }))} />
              </div>
            </div>
          </div>

          {/* Barras por bucket */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {snap.buckets.map((b) => (
              <UsoArmazenamentoBar key={b.bucket} b={b} href={(cat) => `/super/armazenamento/${b.bucket}/${cat}`} />
            ))}
          </div>

          {/* Limites por bucket */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold">Limites por bucket</h2>
            <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" /> Deixe vazio para "sem limite". O uso real é sempre calculado somando os arquivos.</p>
            <div className="space-y-2.5">
              {snap.buckets.map((b) => (
                <EditorLimite
                  key={b.bucket}
                  chave={b.bucket}
                  rotulo={b.bucket}
                  atualBytes={limites[b.bucket] ?? null}
                  onSalvo={(by) => setLimites((p) => ({ ...p, [b.bucket]: by }))}
                />
              ))}
            </div>
          </div>

          {/* Por plataforma */}
          {porTenant.length > 0 && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Por plataforma</h2>
              <ul className="space-y-1">
                {porTenant.map((t) => {
                  const pct = (t.totalBytes / maxTenant) * 100
                  return (
                    <li key={t.tenantId}>
                      <Link href={`/super/plataformas/${t.tenantId}`} className="group flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{t.nome}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatarBytes(t.totalBytes)} · {t.arquivos.toLocaleString('pt-BR')}</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, pct)}%` }} />
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}
      </>)}
    </div>
  )
}
