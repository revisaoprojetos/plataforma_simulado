'use client'

// UI de ATENDIMENTO (admin): abas "Dúvidas" e "Requerimentos" (tab de linha/sublinhado),
// filtro de status por chips (link ?status=), busca + ordenação client-side, e diálogos de
// resposta. Consome as server actions (actions.ts) — autorização real fica no servidor.

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  MessageCircle, FileText, Search, Send, Loader2, ArrowUpDown,
  CornerDownRight, User, Clock, Save, Flag, Star, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { Card, CardContent } from '@/components/ui/card'
import { SecaoHeader } from '@/components/admin/secao-header'
import { AlertBox } from '@/components/ui/alert-box'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { confirmar } from '@/components/ui/confirm-dialog'
import { STATUS_DUVIDA_LABEL, type Duvida, type StatusDuvida } from '@/lib/duvidas/tipos'
import { STATUS_REQ_LABEL, type Requerimento, type StatusRequerimento } from '@/lib/requerimentos/tipos'
import {
  STATUS_REPORTE_LABEL, TIPOS_REPORTE, type Reporte, type Avaliacao, type StatusReporte, type TipoReporte,
} from '@/lib/demandas/tipos'
import {
  carregarThreadDuvidaAction, responderDuvidaAction, responderRequerimentoAction, resolverReporteAction,
  type ThreadDuvida,
} from './actions'

export type DuvidaRow = Duvida & { estudante_nome: string; estudante_email: string | null }
export type RequerimentoRow = Requerimento & { estudante_nome: string; estudante_email: string | null }
export type ReporteRow = Reporte & { estudante_nome: string; estudante_email: string | null; material_titulo: string }
export type AvaliacaoRow = Avaliacao & {
  estudante_nome: string; estudante_email: string | null; material_titulo: string
  material_media: number | null; material_total: number | null
}

type Tab = 'duvidas' | 'requerimentos' | 'demandas'

const TIPO_REPORTE_LABEL: Record<TipoReporte, string> = Object.fromEntries(TIPOS_REPORTE.map((t) => [t.value, t.label])) as Record<TipoReporte, string>

// Semânticas (exceção permitida ao uso de tokens): status mapeia p/ cores de intenção.
const KIND_CLS: Record<string, string> = {
  gold: 'border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200',
  green: 'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200',
  blue: 'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200',
  red: 'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200',
}

function StatusPill({ label, kind }: { label: string; kind: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', KIND_CLS[kind] ?? KIND_CLS.gold)}>
      {label}
    </span>
  )
}

const CHIPS_DUVIDA: { v: string; label: string }[] = [
  { v: '', label: 'Todas' },
  { v: 'aberta', label: 'Aguardando' },
  { v: 'respondida', label: 'Respondidas' },
  { v: 'resolvida', label: 'Resolvidas' },
]
const CHIPS_REQ: { v: string; label: string }[] = [
  { v: '', label: 'Todos' },
  { v: 'em_analise', label: 'Em análise' },
  { v: 'concluido', label: 'Concluídos' },
  { v: 'indeferido', label: 'Indeferidos' },
]
const CHIPS_DEMANDA: { v: string; label: string }[] = [
  { v: '', label: 'Todos' },
  { v: 'aberto', label: 'Abertos' },
  { v: 'em_analise', label: 'Em análise' },
  { v: 'resolvido', label: 'Resolvidos' },
]

/** Estrelas (1–5) para notas de avaliação. Ícone lucide Star (semântica âmbar permitida). */
function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${nota} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('h-3.5 w-3.5', n <= nota ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
      ))}
    </span>
  )
}

/** Cabeçalho de coluna ordenável. */
function SortTh<K extends string>({ k, label, sort, setSort, className }: {
  k: K; label: string; sort: { key: K; dir: 1 | -1 }; setSort: (s: { key: K; dir: 1 | -1 }) => void; className?: string
}) {
  const ativo = sort.key === k
  return (
    <th className={cn('px-3 py-2 text-left font-medium', className)}>
      <button type="button" onClick={() => setSort({ key: k, dir: ativo && sort.dir === 1 ? -1 : 1 })}
        className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground', ativo ? 'text-foreground' : 'text-muted-foreground')}>
        {label} <ArrowUpDown className={cn('h-3 w-3', ativo ? 'opacity-100' : 'opacity-40')} />
      </button>
    </th>
  )
}

export function AtendimentoClient({ tab, statusFiltro, duvidas, requerimentos, reportes, avaliacoesBaixas, podeResponder, aviso }: {
  tab: Tab
  statusFiltro: string
  duvidas: DuvidaRow[]
  requerimentos: RequerimentoRow[]
  reportes: ReporteRow[]
  avaliacoesBaixas: AvaliacaoRow[]
  podeResponder: boolean
  aviso?: string
}) {
  const [busca, setBusca] = useState('')
  const chips = tab === 'duvidas' ? CHIPS_DUVIDA : tab === 'requerimentos' ? CHIPS_REQ : CHIPS_DEMANDA

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Atendimento</h1>
        <p className="text-muted-foreground">Responda às dúvidas dos alunos, processe os requerimentos e trate as demandas de material.</p>
      </div>

      {/* Abas — tab de linha (sublinhado), navega por ?tab= */}
      <div className="flex gap-8 border-b text-sm">
        {([['duvidas', 'Dúvidas', MessageCircle], ['requerimentos', 'Requerimentos', FileText], ['demandas', 'Demandas', Flag]] as const).map(([id, label, Icon]) => (
          <Link key={id} href={`/admin/atendimento?tab=${id}`}
            className={cn('-mb-px inline-flex items-center gap-1.5 border-b-2 py-2.5 font-medium transition-colors',
              tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
        ))}
      </div>

      {aviso && <AlertBox variante="aviso">{aviso}</AlertBox>}

      {/* Filtros: chips de status (link) + busca */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const on = statusFiltro === c.v
            return (
              <Link key={c.v || 'todas'} href={`/admin/atendimento?tab=${tab}${c.v ? `&status=${c.v}` : ''}`}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                {c.label}
              </Link>
            )
          })}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." className="h-8 w-56 pl-8" />
        </div>
      </div>

      {tab === 'duvidas'
        ? <DuvidasTabela rows={duvidas} busca={busca} podeResponder={podeResponder} />
        : tab === 'requerimentos'
          ? <RequerimentosTabela rows={requerimentos} busca={busca} podeResponder={podeResponder} />
          : <DemandasPainel reportes={reportes} avaliacoes={avaliacoesBaixas} busca={busca} podeResponder={podeResponder} />}
    </div>
  )
}

// ───────────────────────────── Dúvidas ─────────────────────────────

function DuvidasTabela({ rows, busca, podeResponder }: { rows: DuvidaRow[]; busca: string; podeResponder: boolean }) {
  type K = 'aluno' | 'titulo' | 'status' | 'data'
  const [sort, setSort] = useState<{ key: K; dir: 1 | -1 }>({ key: 'data', dir: -1 })
  const [aberta, setAberta] = useState<DuvidaRow | null>(null)

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let arr = rows
    if (q) arr = rows.filter((d) => `${d.estudante_nome} ${d.estudante_email ?? ''} ${d.titulo} ${d.categoria ?? ''}`.toLowerCase().includes(q))
    const val = (d: DuvidaRow) => sort.key === 'aluno' ? d.estudante_nome.toLowerCase()
      : sort.key === 'titulo' ? d.titulo.toLowerCase()
      : sort.key === 'status' ? d.status
      : d.ultima_msg_em
    return [...arr].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [rows, busca, sort])

  return (
    <>
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={MessageCircle} titulo="Fila de dúvidas" subtitulo={`${filtradas.length} de ${rows.length}`} />
        <CardContent className="px-0 py-0">
          {filtradas.length === 0 ? (
            <VazioOuSemResultado total={rows.length} icon={MessageCircle} vazio="Nenhuma dúvida recebida ainda." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs">
                  <tr>
                    <SortTh k="aluno" label="Aluno" sort={sort} setSort={setSort} />
                    <SortTh k="titulo" label="Dúvida" sort={sort} setSort={setSort} />
                    <SortTh k="status" label="Status" sort={sort} setSort={setSort} />
                    <SortTh k="data" label="Última mensagem" sort={sort} setSort={setSort} />
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((d) => {
                    const st = STATUS_DUVIDA_LABEL[d.status as StatusDuvida] ?? { label: d.status, kind: 'gold' }
                    return (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{d.estudante_nome}</div>
                          {d.estudante_email && <div className="text-xs text-muted-foreground">{d.estudante_email}</div>}
                        </td>
                        <td className="max-w-[28rem] px-3 py-2.5">
                          <div className="truncate font-medium">{d.titulo}</div>
                          {d.categoria && <div className="text-xs text-muted-foreground">{d.categoria}</div>}
                        </td>
                        <td className="px-3 py-2.5"><StatusPill label={st.label} kind={st.kind} /></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatBrt(d.ultima_msg_em) ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button size="sm" variant="outline" onClick={() => setAberta(d)}>
                            {podeResponder ? 'Responder' : 'Ver'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {aberta && (
        <DuvidaDialog row={aberta} podeResponder={podeResponder} onClose={() => setAberta(null)} />
      )}
    </>
  )
}

function DuvidaDialog({ row, podeResponder, onClose }: { row: DuvidaRow; podeResponder: boolean; onClose: () => void }) {
  const router = useRouter()
  const [thread, setThread] = useState<ThreadDuvida | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, startEnviar] = useTransition()

  // Carrega a thread ao abrir.
  useEffect(() => {
    let vivo = true
    carregarThreadDuvidaAction(row.id).then((r) => {
      if (!vivo) return
      if (r.ok && r.thread) setThread(r.thread)
      else setErro(r.error ?? 'Falha ao carregar.')
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [row.id])

  function enviar() {
    if (!texto.trim()) { toast.error('Escreva a resposta.'); return }
    startEnviar(async () => {
      const r = await responderDuvidaAction(row.id, texto)
      if (r.ok) { toast.success('Resposta enviada.'); onClose(); router.refresh() }
      else toast.error(r.error ?? 'Falha ao enviar.')
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5" /> {row.titulo}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> {row.estudante_nome}{row.estudante_email ? ` · ${row.estudante_email}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {carregando && <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando conversa...</div>}
          {erro && <AlertBox variante="perigo">{erro}</AlertBox>}
          {thread?.mensagens.map((m) => {
            const prof = m.autor_tipo === 'professor'
            return (
              <div key={m.id} className={cn('flex', prof ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm', prof ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
                  <div className={cn('mb-0.5 text-[11px] font-medium', prof ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {m.autor_nome ?? (prof ? 'Equipe' : 'Aluno')} · {formatBrt(m.criado_em) ?? ''}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                </div>
              </div>
            )
          })}
          {thread && thread.mensagens.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sem mensagens.</p>}
        </div>

        {podeResponder && (
          <DialogFooter className="mx-0 mb-0 flex-col gap-2 sm:flex-col sm:items-stretch">
            <div className="flex items-start gap-2">
              <CornerDownRight className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a resposta ao aluno..."
                rows={3} className="flex-1 resize-none" disabled={enviando} />
            </div>
            <div className="flex justify-end">
              <Button onClick={enviar} disabled={enviando || !texto.trim()}>
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Enviar resposta
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────── Requerimentos ─────────────────────────────

function RequerimentosTabela({ rows, busca, podeResponder }: { rows: RequerimentoRow[]; busca: string; podeResponder: boolean }) {
  type K = 'protocolo' | 'aluno' | 'tipo' | 'status' | 'data'
  const [sort, setSort] = useState<{ key: K; dir: 1 | -1 }>({ key: 'data', dir: -1 })
  const [aberto, setAberto] = useState<RequerimentoRow | null>(null)

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let arr = rows
    if (q) arr = rows.filter((r) => `${r.protocolo} ${r.estudante_nome} ${r.estudante_email ?? ''} ${r.tipo} ${r.descricao}`.toLowerCase().includes(q))
    const val = (r: RequerimentoRow) => sort.key === 'protocolo' ? r.protocolo
      : sort.key === 'aluno' ? r.estudante_nome.toLowerCase()
      : sort.key === 'tipo' ? r.tipo.toLowerCase()
      : sort.key === 'status' ? r.status
      : r.criado_em
    return [...arr].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [rows, busca, sort])

  return (
    <>
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={FileText} titulo="Fila de requerimentos" subtitulo={`${filtrados.length} de ${rows.length}`} />
        <CardContent className="px-0 py-0">
          {filtrados.length === 0 ? (
            <VazioOuSemResultado total={rows.length} icon={FileText} vazio="Nenhum requerimento recebido ainda." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs">
                  <tr>
                    <SortTh k="protocolo" label="Protocolo" sort={sort} setSort={setSort} />
                    <SortTh k="aluno" label="Aluno" sort={sort} setSort={setSort} />
                    <SortTh k="tipo" label="Tipo" sort={sort} setSort={setSort} />
                    <SortTh k="status" label="Status" sort={sort} setSort={setSort} />
                    <SortTh k="data" label="Aberto em" sort={sort} setSort={setSort} />
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((r) => {
                    const st = STATUS_REQ_LABEL[r.status as StatusRequerimento] ?? { label: r.status, kind: 'gold' }
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-medium">{r.protocolo}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{r.estudante_nome}</div>
                          {r.estudante_email && <div className="text-xs text-muted-foreground">{r.estudante_email}</div>}
                        </td>
                        <td className="max-w-[20rem] px-3 py-2.5"><div className="truncate">{r.tipo}</div></td>
                        <td className="px-3 py-2.5"><StatusPill label={st.label} kind={st.kind} /></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatBrt(r.criado_em) ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button size="sm" variant="outline" onClick={() => setAberto(r)}>
                            {podeResponder ? 'Processar' : 'Ver'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {aberto && <RequerimentoDialog row={aberto} podeResponder={podeResponder} onClose={() => setAberto(null)} />}
    </>
  )
}

function RequerimentoDialog({ row, podeResponder, onClose }: { row: RequerimentoRow; podeResponder: boolean; onClose: () => void }) {
  const router = useRouter()
  const [status, setStatus] = useState<StatusRequerimento>(row.status)
  const [resposta, setResposta] = useState(row.resposta ?? '')
  const [salvando, startSalvar] = useTransition()

  function salvar() {
    startSalvar(async () => {
      if (status === 'indeferido' && row.status !== 'indeferido') {
        if (!(await confirmar({ titulo: 'Indeferir requerimento', mensagem: `Indeferir o requerimento ${row.protocolo}? O aluno verá essa decisão.`, destrutivo: true, confirmar: 'Indeferir' }))) return
      }
      const patch: { status?: StatusRequerimento; resposta?: string } = {}
      if (status !== row.status) patch.status = status
      if (resposta.trim() !== (row.resposta ?? '')) patch.resposta = resposta
      if (!patch.status && patch.resposta === undefined) { toast.info('Nada alterado.'); return }
      const r = await responderRequerimentoAction(row.id, patch)
      if (r.ok) { toast.success('Requerimento atualizado.'); onClose(); router.refresh() }
      else toast.error(r.error ?? 'Falha ao salvar.')
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> {row.tipo}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono">{row.protocolo}</span>
            <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {row.estudante_nome}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatBrt(row.criado_em) ?? '—'}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Pedido do aluno</div>
            <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">{row.descricao}</div>
          </div>
          {row.contexto && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Contexto</div>
              <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{row.contexto}</div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Status</div>
              {podeResponder ? (
                <Select value={status} onValueChange={(v) => v && setStatus(v as StatusRequerimento)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="em_analise">Em análise</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="indeferido">Indeferido</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <StatusPill label={STATUS_REQ_LABEL[row.status].label} kind={STATUS_REQ_LABEL[row.status].kind} />
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Resposta ao aluno</div>
            <Textarea value={resposta} onChange={(e) => setResposta(e.target.value)} rows={4}
              placeholder="Escreva a resposta / decisão do requerimento..." className="resize-none" disabled={!podeResponder || salvando} />
          </div>
        </div>

        {podeResponder && (
          <DialogFooter className="mx-0 mb-0">
            <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────── Demandas (reportes + avaliações) ─────────────────────────────

function DemandasPainel({ reportes, avaliacoes, busca, podeResponder }: {
  reportes: ReporteRow[]; avaliacoes: AvaliacaoRow[]; busca: string; podeResponder: boolean
}) {
  // Fila "Precisa de você" (spec §6): reportes abertos + avaliações 1–2★.
  const reportesAbertos = reportes.filter((r) => r.status === 'aberto').length
  const precisaDeVoce = reportesAbertos + avaliacoes.length

  return (
    <div className="space-y-6">
      {/* Destaque "Precisa de você" */}
      <div className={cn('flex flex-wrap items-center gap-4 rounded-xl border p-4',
        precisaDeVoce > 0 ? KIND_CLS.gold : 'bg-card text-muted-foreground')}>
        <AlertTriangle className={cn('h-6 w-6 shrink-0', precisaDeVoce > 0 ? '' : 'opacity-60')} />
        <div className="flex-1">
          <div className="text-sm font-semibold">Precisa de você</div>
          <div className="text-xs opacity-90">
            {precisaDeVoce > 0
              ? `${reportesAbertos} reporte(s) aberto(s) e ${avaliacoes.length} avaliação(ões) baixa(s) (1–2★) aguardando atenção.`
              : 'Nenhuma demanda urgente no momento.'}
          </div>
        </div>
        <div className="text-2xl font-bold tabular-nums">{precisaDeVoce}</div>
      </div>

      <ReportesTabela rows={reportes} busca={busca} podeResponder={podeResponder} />
      <AvaliacoesBaixasTabela rows={avaliacoes} busca={busca} />
    </div>
  )
}

function ReportesTabela({ rows, busca, podeResponder }: { rows: ReporteRow[]; busca: string; podeResponder: boolean }) {
  type K = 'material' | 'tipo' | 'status' | 'aluno' | 'data'
  const [sort, setSort] = useState<{ key: K; dir: 1 | -1 }>({ key: 'data', dir: -1 })
  const [aberto, setAberto] = useState<ReporteRow | null>(null)

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let arr = rows
    if (q) arr = rows.filter((r) => `${r.material_titulo} ${r.estudante_nome} ${r.estudante_email ?? ''} ${TIPO_REPORTE_LABEL[r.tipo] ?? r.tipo} ${r.descricao}`.toLowerCase().includes(q))
    const val = (r: ReporteRow) => sort.key === 'material' ? r.material_titulo.toLowerCase()
      : sort.key === 'tipo' ? r.tipo
      : sort.key === 'status' ? r.status
      : sort.key === 'aluno' ? r.estudante_nome.toLowerCase()
      : r.criado_em
    return [...arr].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [rows, busca, sort])

  return (
    <>
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={Flag} titulo="Reportes de material" subtitulo={`${filtrados.length} de ${rows.length}`} />
        <CardContent className="px-0 py-0">
          {filtrados.length === 0 ? (
            <VazioOuSemResultado total={rows.length} icon={Flag} vazio="Nenhum reporte de material recebido ainda." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs">
                  <tr>
                    <SortTh k="material" label="Material / página" sort={sort} setSort={setSort} />
                    <SortTh k="tipo" label="Tipo" sort={sort} setSort={setSort} />
                    <SortTh k="status" label="Status" sort={sort} setSort={setSort} />
                    <SortTh k="aluno" label="Aluno" sort={sort} setSort={setSort} />
                    <SortTh k="data" label="Recebido em" sort={sort} setSort={setSort} />
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((r) => {
                    const st = STATUS_REPORTE_LABEL[r.status as StatusReporte] ?? { label: r.status, kind: 'gold' }
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="max-w-[24rem] px-3 py-2.5">
                          <div className="truncate font-medium">{r.material_titulo}</div>
                          {r.pagina != null && <div className="text-xs text-muted-foreground">Página {r.pagina}</div>}
                        </td>
                        <td className="px-3 py-2.5">{TIPO_REPORTE_LABEL[r.tipo] ?? r.tipo}</td>
                        <td className="px-3 py-2.5"><StatusPill label={st.label} kind={st.kind} /></td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{r.estudante_nome}</div>
                          {r.estudante_email && <div className="text-xs text-muted-foreground">{r.estudante_email}</div>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatBrt(r.criado_em) ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button size="sm" variant="outline" onClick={() => setAberto(r)}>
                            {podeResponder ? 'Tratar' : 'Ver'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {aberto && <ReporteDialog row={aberto} podeResponder={podeResponder} onClose={() => setAberto(null)} />}
    </>
  )
}

function ReporteDialog({ row, podeResponder, onClose }: { row: ReporteRow; podeResponder: boolean; onClose: () => void }) {
  const router = useRouter()
  const [status, setStatus] = useState<StatusReporte>(row.status)
  const [resposta, setResposta] = useState(row.resposta ?? '')
  const [salvando, startSalvar] = useTransition()

  function salvar() {
    startSalvar(async () => {
      const patch: { status?: StatusReporte; resposta?: string } = {}
      if (status !== row.status) patch.status = status
      if (resposta.trim() !== (row.resposta ?? '')) patch.resposta = resposta
      if (!patch.status && patch.resposta === undefined) { toast.info('Nada alterado.'); return }
      const r = await resolverReporteAction(row.id, patch)
      if (r.ok) { toast.success('Reporte atualizado.'); onClose(); router.refresh() }
      else toast.error(r.error ?? 'Falha ao salvar.')
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2"><Flag className="h-5 w-5" /> {row.material_titulo}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{TIPO_REPORTE_LABEL[row.tipo] ?? row.tipo}</span>
            {row.pagina != null && <span>· Página {row.pagina}</span>}
            <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {row.estudante_nome}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatBrt(row.criado_em) ?? '—'}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Relato do aluno</div>
            <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">{row.descricao}</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Status</div>
              {podeResponder ? (
                <Select value={status} onValueChange={(v) => v && setStatus(v as StatusReporte)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_analise">Em análise</SelectItem>
                    <SelectItem value="resolvido">Resolvido</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <StatusPill label={STATUS_REPORTE_LABEL[row.status].label} kind={STATUS_REPORTE_LABEL[row.status].kind} />
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Resposta ao aluno</div>
            <Textarea value={resposta} onChange={(e) => setResposta(e.target.value)} rows={4}
              placeholder="Escreva a resposta / tratativa do reporte..." className="resize-none" disabled={!podeResponder || salvando} />
          </div>
        </div>

        {podeResponder && (
          <DialogFooter className="mx-0 mb-0">
            <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AvaliacoesBaixasTabela({ rows, busca }: { rows: AvaliacaoRow[]; busca: string }) {
  type K = 'material' | 'nota' | 'aluno' | 'data'
  const [sort, setSort] = useState<{ key: K; dir: 1 | -1 }>({ key: 'data', dir: -1 })

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let arr = rows
    if (q) arr = rows.filter((a) => `${a.material_titulo} ${a.estudante_nome} ${a.estudante_email ?? ''} ${a.comentario ?? ''}`.toLowerCase().includes(q))
    const val = (a: AvaliacaoRow) => sort.key === 'material' ? a.material_titulo.toLowerCase()
      : sort.key === 'nota' ? a.nota
      : sort.key === 'aluno' ? a.estudante_nome.toLowerCase()
      : a.criado_em
    return [...arr].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [rows, busca, sort])

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      <SecaoHeader icon={Star} titulo="Avaliações baixas (1–2★)" subtitulo={`${filtradas.length} de ${rows.length}`} />
      <CardContent className="px-0 py-0">
        {filtradas.length === 0 ? (
          <VazioOuSemResultado total={rows.length} icon={Star} vazio="Nenhuma avaliação baixa registrada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs">
                <tr>
                  <SortTh k="material" label="Material" sort={sort} setSort={setSort} />
                  <SortTh k="nota" label="Nota" sort={sort} setSort={setSort} />
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Comentário</th>
                  <SortTh k="aluno" label="Aluno" sort={sort} setSort={setSort} />
                  <SortTh k="data" label="Avaliado em" sort={sort} setSort={setSort} />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="max-w-[22rem] px-3 py-2.5">
                      <div className="truncate font-medium">{a.material_titulo}</div>
                      {a.material_media != null && a.material_total != null && (
                        <div className="text-xs text-muted-foreground">Média {a.material_media.toFixed(1)}★ · {a.material_total} avaliação(ões)</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><Estrelas nota={a.nota} /></td>
                    <td className="max-w-[26rem] px-3 py-2.5 text-muted-foreground">
                      {a.comentario ? <span className="line-clamp-2 whitespace-pre-wrap">{a.comentario}</span> : <span className="opacity-60">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{a.estudante_nome}</div>
                      {a.estudante_email && <div className="text-xs text-muted-foreground">{a.estudante_email}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatBrt(a.criado_em) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ───────────────────────────── Comuns ─────────────────────────────

function VazioOuSemResultado({ total, icon: Icon, vazio }: { total: number; icon: React.ComponentType<{ className?: string }>; vazio: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
      {total === 0 ? <Icon className="h-8 w-8" /> : <Search className="h-8 w-8" />}
      <p className="text-sm">{total === 0 ? vazio : 'Nenhum resultado para o filtro/busca.'}</p>
    </div>
  )
}
