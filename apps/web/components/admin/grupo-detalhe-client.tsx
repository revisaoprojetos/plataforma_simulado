'use client'

import { useState, useTransition, useMemo, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { adicionarMembros, removerMembro, buscarNaoMembros, esvaziarGrupo, excluirGrupo, salvarConfigGrupo, engajamentoGrupo } from '@/app/admin/grupos/actions'
import { confirmar } from '@/components/ui/confirm-dialog'
import { ImportarMembrosDialog } from '@/components/admin/importar-membros-dialog'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, Pencil, Users, UserPlus, UserMinus, Search, Upload, Loader2, X, Download,
  Eye, FolderTree, Activity, Settings, Trash2, FolderInput, ArrowUpDown, ExternalLink, MoreHorizontal,
} from 'lucide-react'

type Est = { id: string; nome: string; email: string | null; classificacao: string | null; ultimo: string | null; simulados: number }
type Sub = { id: string; nome: string; cor: string | null; membros: number }
type Atividade = { id: string; quando: string; operacao: string; texto: string; detalhe: string | null; cor: string; ator: string; email: string | null }
type Origem = 'guru' | 'curseduca' | null
type Grupo = { id: string; nome: string; cor: string | null; descricao: string | null; is_mestre: boolean; pai_id: string | null; codigo: string | null; criado_em: string | null; origem: Origem }
type Aba = 'participantes' | 'subgrupos' | 'atividade' | 'config'

const nf = (n: number) => n.toLocaleString('pt-BR')
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const POR_PAGINA = 11
const ATV_POR_PAGINA = 12

function quandoStr(iso: string): string {
  const dt = new Date(iso); if (isNaN(dt.getTime())) return '—'
  const hh = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
  const same = (a: Date, b: Date) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const hoje = new Date(); const ontem = new Date(Date.now() - 86400000)
  if (same(dt, hoje)) return `hoje, ${hh}`
  if (same(dt, ontem)) return `ontem, ${hh}`
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}, ${hh}`
}

function tempoRel(iso: string | null): string {
  if (!iso) return 'nunca acessou'
  const t = new Date(iso).getTime(); if (isNaN(t)) return '—'
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 3600) return 'agora há pouco'
  const h = Math.floor(s / 3600)
  if (h < 24) return h <= 1 ? 'há 1 hora' : `há ${h} horas`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 30) return `há ${d} dias`
  const me = Math.floor(d / 30); if (me < 12) return `há ${me} ${me > 1 ? 'meses' : 'mês'}`
  return `há ${Math.floor(me / 12)} ano(s)`
}
const inativo = (iso: string | null) => { if (!iso) return true; const d = (Date.now() - new Date(iso).getTime()) / 86400000; return isNaN(d) || d > 30 }

export function GrupoDetalheClient({ grupo, membros: membrosBase, subgrupos, pastas, atividades }: {
  grupo: Grupo; membros: Est[]; subgrupos: Sub[]; pastas: { id: string; nome: string }[]; atividades: Atividade[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [aba, setAba] = useState<Aba>('participantes')
  const [atvPag, setAtvPag] = useState(1)

  // Engajamento (último acesso + simulados) buscado SOB DEMANDA — não trava o load da página.
  const [engajMapa, setEngajMapa] = useState<Record<string, { last: string | null; feitos: number }> | null>(null)
  const engajOk = engajMapa !== null
  useEffect(() => {
    let vivo = true
    engajamentoGrupo(grupo.id).then((r) => { if (vivo) setEngajMapa(r.ok ? (r.mapa ?? {}) : {}) })
    return () => { vivo = false }
  }, [grupo.id])
  const membros = useMemo(() => membrosBase.map((e) => ({ ...e, ultimo: engajMapa?.[e.id]?.last ?? null, simulados: engajMapa?.[e.id]?.feitos ?? 0 })), [membrosBase, engajMapa])
  const [importando, setImportando] = useState(false)
  const [adicionando, setAdicionando] = useState(false)
  const [buscaMembros, setBuscaMembros] = useState('')
  const [plano, setPlano] = useState<string>('todos')
  const [ordem, setOrdem] = useState<'nome' | 'ultimo' | 'simulados'>('nome')
  const [pagina, setPagina] = useState(1)

  const cor = grupo.cor ?? '#6d28d9'
  const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')

  // Distribuição por plano.
  const dist = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of membros) { const k = e.classificacao || 'sem plano'; m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [membros])

  // KPIs de engajamento (dados reais das sessões).
  const kpis = useMemo(() => {
    const total = membros.length
    const ativos7 = membros.filter((e) => e.ultimo && (Date.now() - new Date(e.ultimo).getTime()) / 86400000 <= 7).length
    const sem30 = membros.filter((e) => inativo(e.ultimo)).length
    const feitos = membros.reduce((a, e) => a + e.simulados, 0)
    return { total, ativos7, sem30, feitos, media: total ? feitos / total : 0, planos: dist.length }
  }, [membros, dist])

  // Filtro + ordenação + paginação.
  const filtrados = useMemo(() => {
    const q = buscaMembros.trim().toLowerCase()
    let arr = membros.filter((e) => {
      if (plano !== 'todos' && (e.classificacao || 'sem plano') !== plano) return false
      if (q && !`${e.nome} ${e.email ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
    arr = [...arr].sort((a, b) =>
      ordem === 'ultimo' ? (new Date(b.ultimo ?? 0).getTime() - new Date(a.ultimo ?? 0).getTime())
        : ordem === 'simulados' ? (b.simulados - a.simulados)
          : (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    return arr
  }, [membros, buscaMembros, plano, ordem])
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const pag = Math.min(pagina, totalPaginas)
  const visiveis = filtrados.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA)
  useEffect(() => { setPagina(1) }, [buscaMembros, plano, ordem])

  async function remover(e: Est) {
    if (!(await confirmar({ mensagem: `Remover "${e.nome}" do grupo?`, destrutivo: true }))) return
    start(async () => { const r = await removerMembro(grupo.id, e.id); if (r.ok) { toast.success('Removido do grupo'); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }
  function exportarCsv() {
    const linhas = [['Nome', 'Email', 'Plano', 'Último acesso', 'Simulados'],
      ...filtrados.map((e) => [e.nome, e.email ?? '', e.classificacao ?? '', e.ultimo ?? '', String(e.simulados)])]
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `${grupo.nome}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const abas: { k: Aba; label: string; icon: any; count?: number }[] = [
    { k: 'participantes', label: 'Participantes', icon: Users, count: membros.length },
    { k: 'subgrupos', label: 'Subgrupos', icon: FolderTree, count: subgrupos.length },
    { k: 'atividade', label: 'Atividade', icon: Activity, count: atividades.length },
    { k: 'config', label: 'Configurações', icon: Settings },
  ]

  return (
    <div className="animate-page space-y-5">
      {/* Área superior: cabeçalho + KPIs num painel único (roxo claro) */}
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent shadow-sm">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start gap-4 p-5">
          <Link href="/admin/grupos" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"><ChevronLeft className="h-5 w-5" /></Link>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: cor }}><Users className="h-7 w-7" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Link href="/admin/grupos" className="hover:text-primary">Grupos</Link><span>/</span>
              {grupo.is_mestre && <><span>Pastas</span><span>/</span></>}
              <span className="truncate font-semibold text-primary">{grupo.nome}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{grupo.nome}</h1>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{grupo.is_mestre ? 'pasta' : 'grupo'}</span>
              <OrigemBadge origem={grupo.origem} />
              {grupo.origem && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Sincronizado
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-muted-foreground">
              <span><span className="font-semibold text-foreground/80">{nf(membros.length)}</span> participantes</span>
              {grupo.codigo && <><span className="text-muted-foreground/40">|</span><span>Código <span className="font-mono text-xs">{grupo.codigo}</span></span></>}
              {grupo.criado_em && <><span className="text-muted-foreground/40">|</span><span>Criado em {new Date(grupo.criado_em).toLocaleDateString('pt-BR')}</span></>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setImportando(true)} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary"><Upload className="h-4 w-4" /> Importar</button>
            <button type="button" onClick={exportarCsv} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary"><Download className="h-4 w-4" /> Exportar</button>
            <button type="button" onClick={() => setAba('config')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"><Pencil className="h-4 w-4" /> Editar grupo</button>
            <button type="button" onClick={() => setAba('config')} title="Mais" className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-5 md:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Participantes" valor={nf(kpis.total)} hint="no grupo" pct={100} barra="bg-primary" badge="—" tone="muted" />
          <Kpi label="Ativos 7 dias" valor={engajOk ? nf(kpis.ativos7) : '…'} hint={engajOk ? 'do total do grupo' : 'calculando…'} pct={engajOk && kpis.total ? (kpis.ativos7 / kpis.total) * 100 : 0} barra="bg-emerald-500" badge={engajOk && kpis.total ? `${Math.round((kpis.ativos7 / kpis.total) * 100)}%` : '—'} tone="ok" />
          <Kpi label="Sem acesso 30d" valor={engajOk ? nf(kpis.sem30) : '…'} hint={engajOk ? 'candidatos a reengajar' : 'calculando…'} pct={engajOk && kpis.total ? (kpis.sem30 / kpis.total) * 100 : 0} barra="bg-amber-500" badge={engajOk && kpis.total ? `${Math.round((kpis.sem30 / kpis.total) * 100)}%` : '—'} tone="warn" />
          <Kpi label="Simulados feitos" valor={engajOk ? nf(kpis.feitos) : '…'} hint={engajOk ? `média de ${kpis.media.toFixed(1).replace('.', ',')} por aluno` : 'calculando…'} pct={engajOk ? Math.min(100, kpis.media * 10) : 0} barra="bg-sky-500" badge="—" tone="muted" />
          <Kpi label="Planos distintos" valor={nf(kpis.planos)} hint={dist.slice(0, 2).map(([k]) => cap(k)).join(', ') || '—'} pct={Math.min(100, kpis.planos * 20)} barra="bg-primary" badge="—" tone="muted" />
        </div>
      </div>

      {/* Abas (segmentadas, mesmo modelo + ícones) */}
      <div>
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
          {abas.map((t) => {
            const on = aba === t.k
            return (
              <button key={t.k} type="button" onClick={() => setAba(t.k)}
                className={cn('inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                  on ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <t.icon className="h-4 w-4" /> {t.label}
                {t.count != null && <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', on ? 'bg-white/20 text-primary-foreground' : 'bg-muted text-muted-foreground')}>{nf(t.count)}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Participantes ── */}
      {aba === 'participantes' && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 p-3">
              <div>
                <div className="text-sm font-semibold">Participantes</div>
                <div className="text-xs text-muted-foreground">{nf(visiveis.length)} de {nf(filtrados.length)} exibidos · página {pag}</div>
              </div>
              <button type="button" onClick={() => setAdicionando(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"><UserPlus className="h-4 w-4" /> Adicionar estudantes</button>
            </div>
            <div className="space-y-2.5 border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={buscaMembros} onChange={(e) => setBuscaMembros(e.target.value)} placeholder="Buscar participante por nome ou e-mail…"
                  className="w-full rounded-lg border bg-card py-2 pl-9 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                {buscaMembros && <button type="button" onClick={() => setBuscaMembros('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[['todos', 'Todos', membros.length] as const, ...dist.map(([k, n]) => [k, cap(k), n] as const)].map(([k, label, n]) => {
                  const on = plano === k
                  return <button key={k} type="button" onClick={() => setPlano(k)} className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition', on ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground')}>{label} <span className="font-mono opacity-70">{nf(n as number)}</span></button>
                })}
                <div className="ml-auto">
                  <label className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <select value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className="cursor-pointer bg-transparent outline-none">
                      <option value="nome">Nome (A → Z)</option>
                      <option value="ultimo">Último acesso</option>
                      <option value="simulados">Mais simulados</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            {membros.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground"><Users className="h-7 w-7 opacity-40" /><p className="text-sm">Nenhum participante no grupo.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div style={{ gridTemplateColumns: '1fr 120px 150px 72px' }} className="grid items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <div>Estudante</div><div>Plano</div><div>Último acesso</div><div className="text-right">Ações</div>
                  </div>
                  {visiveis.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Nenhum participante encontrado.</p>
                  ) : visiveis.map((e) => (
                    <div key={e.id} style={{ gridTemplateColumns: '1fr 120px 150px 72px' }} className="group grid items-center gap-2 border-b border-border/60 px-4 py-2.5 transition-colors hover:bg-muted/40">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{iniciais(e.nome)}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/admin/estudantes/${e.id}`} className="truncate text-[13.5px] font-medium hover:text-primary">{e.nome}</Link>
                            {engajOk && inativo(e.ultimo) && <span className="shrink-0 rounded-full bg-rose-500/12 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-600 dark:text-rose-400">inativo</span>}
                          </div>
                          {e.email && <p className="truncate text-xs text-muted-foreground">{e.email}</p>}
                        </div>
                      </div>
                      <div><ClassificacaoBadge classificacao={e.classificacao} /></div>
                      <div className="text-xs">
                        {engajOk ? (
                          <>
                            <div className="text-foreground/80">{tempoRel(e.ultimo)}</div>
                            <div className="text-muted-foreground">{e.simulados ? `${nf(e.simulados)} simulado(s)` : 'sem simulados'}</div>
                          </>
                        ) : <div className="text-muted-foreground">—</div>}
                      </div>
                      <div className="flex items-center justify-end gap-0.5">
                        <Link href={`/admin/estudantes/${e.id}`} title="Ver estudante" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"><Eye className="h-4 w-4" /></Link>
                        <button type="button" onClick={() => remover(e)} disabled={pending} title="Remover do grupo" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><UserMinus className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                <span>Mostrando {nf(visiveis.length)} de {nf(filtrados.length)}</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pag === 1} className="rounded-lg border bg-card px-2.5 py-1 font-semibold disabled:opacity-40">Anterior</button>
                  <span className="px-1 font-mono">{pag}/{totalPaginas}</span>
                  <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pag === totalPaginas} className="rounded-lg border bg-card px-2.5 py-1 font-semibold disabled:opacity-40">Próxima</button>
                </div>
              </div>
            )}
          </section>

          {/* Sidebar */}
          <div className="space-y-4">
            <Painel titulo="Entrada de alunos" icon={UserPlus}>
              <p className="text-xs text-muted-foreground">Adicione estudantes já cadastrados ou importe por lista/arquivo (e-mail, CPF ou nome).</p>
              <button type="button" onClick={() => setAdicionando(true)} className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">Selecionar estudantes</button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setImportando(true)} className="rounded-lg border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:border-primary hover:text-primary">Importar lista/CSV</button>
                <Link href="/admin/estudantes" className="rounded-lg border bg-card px-3 py-2 text-center text-xs font-semibold transition-colors hover:border-primary hover:text-primary">Estudantes</Link>
              </div>
            </Painel>

            <Painel titulo="Distribuição por plano" icon={Users}>
              {dist.length === 0 ? <p className="text-xs text-muted-foreground">Sem membros.</p> : dist.map(([k, n]) => {
                const pct = membros.length ? Math.round((n / membros.length) * 100) : 0
                return (
                  <div key={k} className="space-y-1">
                    <div className="flex items-center justify-between text-xs"><span className="font-medium">{cap(k)}</span><span className="font-mono text-muted-foreground">{nf(n)} · {pct}%</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
            </Painel>

            {grupo.origem && (
              <Painel titulo="Automações do grupo" icon={Settings}
                action={<Link href="/admin/integracoes" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Integrações <ExternalLink className="h-3 w-3" /></Link>}>
                <AutoRow titulo={`Sincronizar com ${grupo.origem === 'guru' ? 'Guru' : 'Curseduca'}`} desc="Novas compras entram no grupo automaticamente." on />
                <AutoRow titulo="Remover ao cancelar" desc="Cancelamentos e reembolsos saem do grupo." on />
                <AutoRow titulo="Avisar time pedagógico" desc="Notificação de picos de entrada (em breve)." on={false} />
                <p className="pt-1 text-[11px] text-muted-foreground">Controlado pela integração — ajuste em Integrações.</p>
              </Painel>
            )}

            {atividades.length > 0 && (
              <Painel titulo="Atividade recente" icon={Activity}
                action={<button type="button" onClick={() => setAba('atividade')} className="text-xs font-semibold text-primary hover:underline">Ver tudo</button>}>
                {atividades.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex gap-2.5">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.cor)} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium leading-tight">{a.texto}</p>
                      {a.detalhe && <p className="truncate text-[11px] text-muted-foreground">{a.detalhe}</p>}
                      <p className="text-[11px] text-muted-foreground/80">{quandoStr(a.quando)} · {a.ator}</p>
                    </div>
                  </div>
                ))}
              </Painel>
            )}
          </div>
        </div>
      )}

      {/* ── Subgrupos ── */}
      {aba === 'subgrupos' && (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b bg-muted/30 p-3"><span className="flex items-center gap-2 text-sm font-semibold"><FolderTree className="h-4 w-4 text-primary" /> Subgrupos <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{nf(subgrupos.length)}</span></span></div>
          {!grupo.is_mestre ? (
            <p className="p-6 text-sm text-muted-foreground">Este é um grupo comum — não contém subgrupos. Só pastas (grupos mestre) agrupam outros grupos.</p>
          ) : subgrupos.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum subgrupo nesta pasta ainda. Arraste grupos para cá na tela de Grupos.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {subgrupos.map((s) => (
                <Link key={s.id} href={`/admin/grupos/${s.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: s.cor ?? 'var(--muted-foreground)' }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.nome}</span>
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Users className="h-3.5 w-3.5" /> {nf(s.membros)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Atividade ── */}
      {aba === 'atividade' && (() => {
        const totalPag = Math.max(1, Math.ceil(atividades.length / ATV_POR_PAGINA))
        const p = Math.min(atvPag, totalPag)
        const vis = atividades.slice((p - 1) * ATV_POR_PAGINA, p * ATV_POR_PAGINA)
        return (
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 p-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" /> Linha do tempo do grupo <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{nf(atividades.length)}</span></span>
              <Link href="/admin/auditoria" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Auditoria <ExternalLink className="h-3 w-3" /></Link>
            </div>
            {atividades.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground"><Activity className="h-7 w-7 opacity-40" /><p className="text-sm">Nenhum evento registrado neste grupo ainda.</p><p className="text-xs">Ações (adicionar/remover membros, importações, edições) aparecem aqui.</p></div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div style={{ gridTemplateColumns: '150px minmax(0,1fr) 220px' }} className="grid items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <div>Quando</div><div>Evento</div><div>Por</div>
                    </div>
                    {vis.map((a) => (
                      <div key={a.id} style={{ gridTemplateColumns: '150px minmax(0,1fr) 220px' }} className="grid items-start gap-2 border-b border-border/60 px-4 py-3 transition-colors hover:bg-muted/40">
                        <div className="pt-0.5 font-mono text-xs text-muted-foreground">{quandoStr(a.quando)}</div>
                        <div className="flex min-w-0 gap-2.5">
                          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.cor)} />
                          <div className="min-w-0">
                            <span className="text-sm font-semibold">{a.texto}</span>
                            {a.detalhe && <div className="mt-0.5 break-words text-xs text-muted-foreground">{a.detalhe}</div>}
                          </div>
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <div className="truncate text-sm font-medium">{a.ator}</div>
                          {a.email && <div className="truncate text-xs text-muted-foreground">{a.email}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {totalPag > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    <span>Mostrando {nf(vis.length)} de {nf(atividades.length)} eventos</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setAtvPag((x) => Math.max(1, x - 1))} disabled={p === 1} className="rounded-lg border bg-card px-2.5 py-1 font-semibold disabled:opacity-40">Anterior</button>
                      <span className="px-1 font-mono">{p}/{totalPag}</span>
                      <button type="button" onClick={() => setAtvPag((x) => Math.min(totalPag, x + 1))} disabled={p === totalPag} className="rounded-lg border bg-card px-2.5 py-1 font-semibold disabled:opacity-40">Próxima</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )
      })()}

      {/* ── Configurações ── */}
      {aba === 'config' && <ConfigTab grupo={grupo} pastas={pastas} membros={membros.length} />}

      {importando && <ImportarMembrosDialog grupoId={grupo.id} onClose={() => setImportando(false)} />}
      {adicionando && <AdicionarDialog grupoId={grupo.id} onClose={() => setAdicionando(false)} />}
    </div>
  )
}

function Kpi({ label, valor, hint, pct, barra, badge, tone = 'muted' }: { label: string; valor: string; hint: string; pct: number; barra: string; badge?: string; tone?: 'ok' | 'warn' | 'muted' }) {
  const toneCls = tone === 'ok' ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
    : tone === 'warn' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-500' : 'bg-muted text-muted-foreground'
  return (
    <div className="rounded-2xl border bg-card p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground" title={label}>{label}</div>
        {badge && <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold', toneCls)}>{badge}</span>}
      </div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight">{valor}</div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', barra)} style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} /></div>
      {hint && <div className="mt-1.5 truncate text-xs text-muted-foreground" title={hint}>{hint}</div>}
    </div>
  )
}

function Painel({ titulo, icon: Icon, children, action }: { titulo: string; icon: any; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 p-3">
        <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {titulo}</span>
        {action}
      </div>
      <div className="space-y-2.5 p-3">{children}</div>
    </section>
  )
}

function AutoRow({ titulo, desc, on }: { titulo: string; desc: string; on: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-sm font-medium">{titulo}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
      <span className={cn('mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors', on ? 'bg-primary' : 'bg-muted')} title="Controlado pela integração">
        <span className={cn('h-4 w-4 rounded-full bg-white shadow transition-transform', on && 'translate-x-4')} />
      </span>
    </div>
  )
}

function OrigemBadge({ origem }: { origem: Origem }) {
  if (origem === 'guru') return <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Guru</span>
  if (origem === 'curseduca') return <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Curseduca</span>
  return null
}

function ConfigTab({ grupo, pastas, membros }: { grupo: Grupo; pastas: { id: string; nome: string }[]; membros: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [nome, setNome] = useState(grupo.nome)
  const [descricao, setDescricao] = useState(grupo.descricao ?? '')
  const [pai, setPai] = useState<string>(grupo.pai_id ?? '')

  function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    start(async () => {
      const r = await salvarConfigGrupo(grupo.id, nome.trim(), descricao.trim() || null, pai || null)
      if (r.ok) { toast.success('Grupo atualizado'); router.refresh() } else toast.error(r.error ?? 'Erro ao salvar')
    })
  }
  async function esvaziar() {
    if (!(await confirmar({ titulo: 'Esvaziar participantes', mensagem: `Remover os ${nf(membros)} vínculo(s) sem excluir o grupo?`, destrutivo: true }))) return
    start(async () => { const r = await esvaziarGrupo(grupo.id); if (r.ok) { toast.success(`${nf(r.removidos ?? 0)} removido(s)`); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }
  async function excluir() {
    if (!(await confirmar({ titulo: 'Excluir grupo', mensagem: grupo.is_mestre ? 'Excluir a pasta? Os subgrupos vão para a raiz (não são apagados).' : 'Excluir o grupo? Os vínculos de membros são removidos.', destrutivo: true }))) return
    start(async () => { const r = await excluirGrupo(grupo.id); if (r.ok) { toast.success('Grupo excluído'); router.push('/admin/grupos') } else toast.error(r.error ?? 'Erro') })
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-bold">Dados do grupo</h3>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Descrição</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="w-full resize-y rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Opcional" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pasta pai</label>
            <select value={pai} onChange={(e) => setPai(e.target.value)} className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Sem pasta (raiz)</option>
              {pastas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={salvar} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">{pending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar alterações</button>
            <button type="button" onClick={() => { setNome(grupo.nome); setDescricao(grupo.descricao ?? ''); setPai(grupo.pai_id ?? '') }} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-destructive/40 bg-card p-5 shadow-sm">
        <h3 className="text-sm font-bold text-destructive">Zona de risco</h3>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <div className="min-w-0"><p className="text-sm font-semibold">Esvaziar participantes</p><p className="text-xs text-muted-foreground">Remove os {nf(membros)} vínculo(s) sem excluir o grupo.</p></div>
            <button type="button" onClick={esvaziar} disabled={pending || membros === 0} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-destructive/50 px-3 py-1.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"><FolderInput className="h-4 w-4" /> Esvaziar</button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <div className="min-w-0"><p className="text-sm font-semibold">Excluir grupo</p><p className="text-xs text-muted-foreground">Ação permanente. {grupo.is_mestre ? 'Subgrupos vão para a raiz.' : 'Os vínculos são removidos.'}</p></div>
            <button type="button" onClick={excluir} disabled={pending} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-sm font-bold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Excluir</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function AdicionarDialog({ grupoId, onClose }: { grupoId: string; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<Est[]>([])
  const [buscando, setBuscando] = useState(true)
  useEffect(() => {
    let vivo = true; setBuscando(true)
    const t = setTimeout(async () => {
      const r = await buscarNaoMembros(grupoId, busca)
      if (!vivo) return
      setItens(r.ok ? (r.itens ?? []).map((e) => ({ ...e, ultimo: null, simulados: 0 })) : [])
      setBuscando(false)
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, grupoId])

  function add(e: Est) {
    start(async () => {
      const r = await adicionarMembros(grupoId, [e.id])
      if (r.ok) { toast.success(`${e.nome} adicionado`); setItens((p) => p.filter((x) => x.id !== e.id)); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }
  const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="h-4 w-4" /> Adicionar estudantes</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar estudante por nome ou e-mail…" className="w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>
        <div className="scroll-claro min-h-0 flex-1 space-y-1.5 overflow-auto p-3">
          {buscando ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</p>
          ) : itens.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{busca.trim() ? 'Nenhum estudante encontrado.' : 'Comece a digitar para buscar.'}</p>
          ) : itens.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:border-primary/40">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{iniciais(e.nome)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><p className="truncate text-sm font-medium">{e.nome}</p><ClassificacaoBadge classificacao={e.classificacao} /></div>
                {e.email && <p className="truncate text-xs text-muted-foreground">{e.email}</p>}
              </div>
              <button type="button" onClick={() => add(e)} disabled={pending} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"><UserPlus className="h-3.5 w-3.5" /> Adicionar</button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
