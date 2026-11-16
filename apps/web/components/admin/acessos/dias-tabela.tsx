'use client'

import * as React from 'react'
import { ChevronRight, Loader2, AlertTriangle } from 'lucide-react'
import { DataTable } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { DiaLinha, DiaDetalhe } from '@/lib/acessos/dia-tipos'

/**
 * Acessos agrupados por DIA (BRT): 1 linha por dia (agregada no servidor). Clicar abre o relatório resumido do dia,
 * carregado SOB DEMANDA em `endpoint` (GET ?dia=YYYY-MM-DD, com checkPermission no servidor). Serve aluno e equipe.
 */
export function AcessosPorDiaTable({
  rows, total, filtros, endpoint, nomePessoa, defaultPerPage = 10, buscaPlaceholder = 'Buscar por IP, navegador ou sistema…', fonteMemoria = false,
}: {
  rows: DiaLinha[]; total: number; filtros: React.ReactNode
  /** Ex.: `/api/admin/acessos/dia?estudante=<id>` — o componente acrescenta `&dia=`. */
  endpoint: string
  nomePessoa: string
  defaultPerPage?: number
  buscaPlaceholder?: string
  fonteMemoria?: boolean
}) {
  const [aberto, setAberto] = React.useState<DiaLinha | null>(null)

  return (
    <>
      <DataTable<DiaLinha>
        rows={rows} total={total} getRowId={(r) => r.dia} selectable={false} searchable searchPlaceholder={buscaPlaceholder}
        perPageOptions={[10, 25, 50]} defaultPerPage={defaultPerPage} defaultSort={{ key: 'dia', dir: 'desc' }} filters={filtros}
        nomeSingular="dia" nomePlural="dias" empty="Nenhum acesso registrado neste período."
        redimensionavel onRowClick={(r) => setAberto(r)}
        columns={[
          { key: 'dia', header: 'Data', sortable: true, width: '10rem', render: (r) => (
            <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">{r.data}<span className="text-xs font-normal uppercase text-muted-foreground">{r.semana}</span></span>
          ) },
          { key: 'sessoes', header: 'Sessões', sortable: true, width: '7rem', render: (r) => <span className="tabular-nums">{r.sessoes}</span> },
          { key: 'faixa', header: 'Primeiro – último', width: '10rem', render: (r) => <span className="tabular-nums">{r.faixa}</span> },
          { key: 'tempo', header: 'Tempo ativo', sortable: true, width: '8rem', render: (r) => r.tempo },
          { key: 'ips', header: 'IPs', width: '12rem', render: (r) => (
            <span className="inline-flex items-center gap-1 tabular-nums">{r.ipPrincipal}{r.ipsExtra > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">+{r.ipsExtra}</Badge>}</span>
          ), title: (r) => r.ips.join(', ') || '—' },
          { key: 'aparelhos', header: 'Aparelhos', width: '14rem', render: (r) => (
            <span className="inline-flex items-center gap-1">{r.aparelhoPrincipal}{r.aparelhosExtra > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">+{r.aparelhosExtra}</Badge>}</span>
          ), title: (r) => r.aparelhos.join(', ') || '—' },
          { key: 'paginas', header: 'Páginas', width: '6.5rem', render: (r) => <span className="tabular-nums">{r.paginas}</span> },
          { key: 'status', header: 'Status', width: '8rem', render: (r) => r.ativa
            ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Ativa</Badge>
            : <Badge variant="outline">Encerrado</Badge> },
          { key: 'abrir', header: <span className="sr-only">Relatório</span>, width: '3rem', align: 'right', render: () => <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden /> },
        ]}
      />
      {fonteMemoria && <p className="text-xs text-muted-foreground">Agrupado em memória (até 2000 sessões). Aplique a migração 20261121130000_acessos_por_dia.sql para a agregação completa no banco.</p>}
      {aberto && <RelatorioDia linha={aberto} endpoint={endpoint} nomePessoa={nomePessoa} onFechar={() => setAberto(null)} />}
    </>
  )
}

function StatusSessao({ s, motivo }: { s: 'ativa' | 'inativa' | 'encerrada'; motivo: string | null }) {
  if (s === 'ativa') return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Ativa</Badge>
  if (s === 'inativa') return <Badge variant="secondary">Inativa</Badge>
  return <Badge variant="outline">Encerrada{motivo === 'revogado_admin' || motivo === 'encerrada_admin' ? ' (admin)' : motivo === 'logout' ? ' (saiu)' : ''}</Badge>
}

function RelatorioDia({ linha, endpoint, nomePessoa, onFechar }: { linha: DiaLinha; endpoint: string; nomePessoa: string; onFechar: () => void }) {
  const [det, setDet] = React.useState<DiaDetalhe | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)

  React.useEffect(() => {
    const ctl = new AbortController()
    setDet(null); setErro(null)
    fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}dia=${linha.dia}`, { signal: ctl.signal, credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.message ?? 'Não foi possível carregar o relatório do dia.')
        setDet(j as DiaDetalhe)
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setErro(e.message) })
    return () => ctl.abort()
  }, [endpoint, linha.dia])

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onFechar() }}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="truncate">Relatório do dia · {linha.data} ({linha.semana})</SheetTitle>
          <SheetDescription className="truncate">{nomePessoa} · {linha.sessoes} sessão(ões) · {linha.faixa} · tempo ativo {linha.tempo}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {!det && !erro && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}
          {erro && <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{erro}</div>}
          {det && <Corpo det={det} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

const Titulo = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>

function Corpo({ det }: { det: DiaDetalhe }) {
  return (
    <>
      {det.truncado && <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Dia com muito volume: o relatório mostra os primeiros registros do dia.</p>}

      <section>
        <Titulo>Sessões do dia ({det.sessoes.length}) · tempo total {det.tempoTotal}</Titulo>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>{['Início', 'Fim', 'Duração', 'IP', 'Aparelho', 'Método', 'Origem', 'Status'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {det.sessoes.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhuma sessão.</td></tr>}
              {det.sessoes.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{s.inicio}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{s.fim}</td>
                  <td className="whitespace-nowrap px-3 py-2">{s.duracao}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{s.ip}</td>
                  <td className="px-3 py-2">{s.aparelho}</td>
                  <td className="whitespace-nowrap px-3 py-2">{s.metodo}</td>
                  <td className="px-3 py-2">{s.origem}</td>
                  <td className="px-3 py-2"><StatusSessao s={s.status} motivo={s.motivo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <Titulo>IPs distintos ({det.ips.length})</Titulo>
          <ul className="space-y-1 text-sm">
            {det.ips.length === 0 && <li className="text-muted-foreground">—</li>}
            {det.ips.map((i) => <li key={i.valor} className="flex justify-between gap-2 rounded-lg border px-3 py-1.5"><span className="tabular-nums">{i.valor}</span><span className="text-muted-foreground">{i.sessoes} sessão(ões)</span></li>)}
          </ul>
        </section>
        <section>
          <Titulo>Aparelhos distintos ({det.aparelhos.length})</Titulo>
          <ul className="space-y-1 text-sm">
            {det.aparelhos.length === 0 && <li className="text-muted-foreground">—</li>}
            {det.aparelhos.map((i) => <li key={i.valor} className="flex justify-between gap-2 rounded-lg border px-3 py-1.5"><span className="truncate">{i.valor}</span><span className="shrink-0 text-muted-foreground">{i.sessoes} sessão(ões)</span></li>)}
          </ul>
        </section>
      </div>

      <section>
        <Titulo>Páginas mais vistas e tempo por página</Titulo>
        {det.semDetalhesDeAtividade ? (
          <p className="text-sm text-muted-foreground">Rastreio de páginas ainda não ativado neste ambiente (aplicar as migrações de rastreio).</p>
        ) : det.paginas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma página registrada neste dia.</p> : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Página</th><th className="px-3 py-2 font-medium">Vistas</th><th className="px-3 py-2 font-medium">Tempo</th></tr>
              </thead>
              <tbody>
                {det.paginas.map((p) => (
                  <tr key={p.rota} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{p.rota}</td>
                    <td className="px-3 py-2 tabular-nums">{p.vistas || '—'}</td>
                    <td className="px-3 py-2">{p.tempo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <Titulo>Eventos principais</Titulo>
        {det.eventosResumo.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento além de navegação.</p> : (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {det.eventosResumo.map((e) => <Badge key={e.rotulo} variant="secondary">{e.rotulo}: {e.total}</Badge>)}
            </div>
            <ul className="space-y-1 text-sm">
              {det.eventos.map((e, i) => (
                <li key={i} className="flex gap-3 rounded-lg border px-3 py-1.5">
                  <span className="shrink-0 tabular-nums text-muted-foreground">{e.hora}</span>
                  <span className="shrink-0 font-medium">{e.rotulo}</span>
                  <span className="min-w-0 truncate text-muted-foreground" title={e.item}>{e.item}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
