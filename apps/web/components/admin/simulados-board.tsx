'use client'
import { confirmar } from '@/components/ui/confirm-dialog'

import { useState, useTransition, useMemo, useEffect } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { EditarPastaDialog } from '@/components/admin/editar-pasta-dialog'
import { excluirPastaFolder } from '@/app/admin/banco-questoes/actions'
import type { TipoSimulado } from '@/lib/simulado/tipo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Clock,
  Calendar,
  MoreHorizontal,
  Pencil,
  Trophy,
  Copy,
  ExternalLink,
  Square,
  Play,
  Send,
  Trash2,
  Lock,
  Unlock,
  Radio,
  FolderPlus,
  Folder,
  FolderOpen,
  FolderCog,
  ChevronLeft,
  ChevronDown,
  FolderInput,
  Palette,
  X,
  Check,
  Loader2,
  Plus,
  BarChart3,
  FolderTree,
  Rows3,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { abrirLinkTemado } from '@/lib/hud/abrir-temado'
import { isoParaBrtLocal } from '@/lib/brt'
import { toast } from 'sonner'
import {
  encerrarSimuladoAction,
  reabrirSimuladoAction,
  publishSimuladoAction,
  deleteSimuladoAction,
  liberarItemAction,
  onlinePorSimulado,
  moverSimuladoParaPasta,
} from '@/app/admin/simulados/actions'

export interface SimuladoCard {
  id: string
  titulo: string
  status: string
  modo_aplicacao: string
  data_inicio: string | null
  data_fim: string | null
  tempo_limite_min: number | null
  embed_token: string | null
  created_at: string
  pasta_id?: string | null
  regras?: { nota_liberada?: boolean; gabarito_liberado?: boolean; caderno_liberado?: boolean } | null
  tipo?: TipoSimulado | null
  vis?: { cor: string | null; icone: string | null; capa: string | null } | null
}

const tipoLabel = (t?: TipoSimulado | null) => (t === 'discursiva' ? 'Discursiva' : t === 'mista' ? 'Mista' : 'Objetiva')

const modoLabel: Record<string, string> = {
  janela_fixa: 'Janela fixa',
  prazo_relativo: 'Prazo relativo',
  aberto: 'Aberto',
}

const secoes = [
  { chave: 'publicado', titulo: 'Em andamento', cor: 'bg-amber-500' },
  { chave: 'rascunho', titulo: 'A iniciar', cor: 'bg-sky-500' },
  { chave: 'encerrado', titulo: 'Encerrado', cor: 'bg-red-500' },
] as const

function formatDur(min: number | null) {
  if (!min) return 'Sem limite'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h${m}min`
  if (h) return `${h}h`
  return `${m}min`
}

/** "DD/MM HH:mm" em horário de Brasília — versão compacta para os cards. */
function compactoBrt(iso?: string | null): string {
  const s = isoParaBrtLocal(iso)
  if (!s) return ''
  const [d, t] = s.split('T')
  const [, mo, da] = d.split('-')
  return `${da}/${mo} ${t}`
}

const dotClass: Record<string, string> = {
  publicado: 'bg-amber-500',
  rascunho: 'bg-sky-500',
  encerrado: 'bg-red-500',
}
const statusLabel: Record<string, string> = {
  publicado: 'Em andamento',
  rascunho: 'Agendado',
  encerrado: 'Encerrado',
}
const statusChipClass: Record<string, string> = {
  publicado: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  rascunho: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  encerrado: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

/** Rótulo-resumo do estado de uma pasta (mostrado ao lado do nome da seção). */
function statusPasta(sims: SimuladoCard[]): { label: string; cls: string } | null {
  if (!sims.length) return null
  if (sims.every((s) => s.modo_aplicacao === 'aberto' && s.status === 'publicado'))
    return { label: 'Aberto ao público', cls: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' }
  if (sims.some((s) => s.status === 'publicado')) return { label: 'Em andamento', cls: statusChipClass.publicado }
  if (sims.some((s) => s.status === 'rascunho')) return { label: 'A iniciar', cls: statusChipClass.rascunho }
  return { label: 'Encerrado', cls: statusChipClass.encerrado }
}

/** Chip clicável de liberação (Nota / Gabarito / Caderno): verde quando liberado, neutro quando bloqueado. */
function LiberacaoChip({ label, on, pending, onClick }: { label: string; on: boolean; pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={on}
      title={on ? `${label} liberado(a) — clique para bloquear` : `${label} bloqueado(a) — clique para liberar`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50',
        on
          ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
          : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40',
      )}
    >
      {on ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {label}
    </button>
  )
}

/** Cartão de simulado (admin): capa em cima, corpo com chips, LIBERAÇÕES clicáveis e ações inline. */
function CardSimuladoAdmin({ s, appUrl, online, onMover, selecionado, onSelecionar }: {
  s: SimuladoCard; appUrl: string; online: number
  onMover?: () => void; selecionado: boolean; onSelecionar: (v: boolean) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // Estado efetivo (modo configurado + override manual do admin).
  const efetivo = resolverLiberacoes(s.regras, { status: s.status, data_fim: s.data_fim })
  const [override, setOverride] = useState<Partial<Record<'nota' | 'gabarito' | 'caderno', boolean>>>({})
  const estado = {
    nota: override.nota ?? efetivo.notaLiberada,
    gabarito: override.gabarito ?? efetivo.gabaritoLiberado,
    caderno: override.caderno ?? efetivo.cadernoLiberado,
  }

  const linkAcesso = s.embed_token ? `${appUrl}/aluno/login?token=${s.embed_token}` : null
  const rotulo = { nota: 'Nota/desempenho', gabarito: 'Gabarito', caderno: 'Caderno (PDF)' }

  function toggleLib(item: 'nota' | 'gabarito' | 'caderno') {
    const novo = !estado[item]
    setOverride((p) => ({ ...p, [item]: novo }))
    startTransition(async () => {
      await liberarItemAction(s.id, item, novo)
      toast.success(`${rotulo[item]} ${novo ? 'liberado(a) para os alunos' : 'bloqueado(a)'}`)
      router.refresh()
    })
  }

  function acao(fn: (id: string) => Promise<unknown>, msg: string) {
    startTransition(async () => {
      const r = (await fn(s.id)) as { error?: string } | null | undefined
      if (r && typeof r === 'object' && r.error) { toast.error(r.error); return }
      toast.success(msg)
      router.refresh()
    })
  }

  function copiarLink() {
    if (!linkAcesso) return toast.error('Link indisponível.')
    navigator.clipboard.writeText(linkAcesso).then(() => toast.success('Link copiado'))
  }

  function abrirSimulado() {
    if (!linkAcesso) return toast.error('Link indisponível.')
    abrirLinkTemado(linkAcesso)
  }

  async function excluir() {
    if (!(await confirmar({ mensagem: `Excluir o simulado "${s.titulo}"? Esta ação não pode ser desfeita.`, destrutivo: true }))) return
    startTransition(async () => {
      const r = await deleteSimuladoAction(s.id)
      if (r?.error) toast.error(r.error)
      else toast.success('Simulado excluído')
      router.refresh()
    })
  }

  const cor = s.vis?.cor ?? '#6d28d9'
  const BancoIcon = iconeBanco(s.vis?.icone)
  const capa = s.vis?.capa
  const detalhe = `/admin/simulados/${s.id}`

  // Subtítulo (janela/disponibilidade) — horário de Brasília.
  const subtitulo = s.modo_aplicacao === 'janela_fixa' && s.data_inicio
    ? (s.data_fim ? `${compactoBrt(s.data_inicio)} — ${compactoBrt(s.data_fim)}` : `A partir de ${compactoBrt(s.data_inicio)}`)
    : s.modo_aplicacao === 'aberto' ? 'Sempre disponível'
      : s.modo_aplicacao === 'prazo_relativo' ? 'Prazo definido por aluno' : 'Sem data definida'

  return (
    <div className={cn(
      'group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md',
      selecionado ? 'ring-2 ring-primary' : 'ring-1 ring-transparent',
    )}>
      {/* Capa */}
      <div className="relative aspect-[16/9] overflow-hidden">
        {capa
          ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(140deg, ${cor} 0%, #0f172a 140%)` }} />}
        {!capa && <BancoIcon className="absolute -right-4 -top-4 h-28 w-28 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

        {/* Link cobre a capa (abaixo dos controles) */}
        <Link href={detalhe} className="absolute inset-0 z-0" aria-label={s.titulo} />

        {/* Faixa superior: "fazendo agora" + seleção/kebab */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
          <div className="pointer-events-auto">
            {online > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur" title={`${online} aluno(s) fazendo agora`}>
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
                {online} fazendo agora
              </span>
            )}
          </div>
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              role="checkbox"
              aria-checked={selecionado}
              aria-label={selecionado ? 'Desmarcar simulado' : 'Selecionar simulado'}
              onClick={() => onSelecionar(!selecionado)}
              className={cn('flex h-6 w-6 items-center justify-center rounded-md border backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                selecionado ? 'border-primary bg-primary text-primary-foreground' : 'border-white/40 bg-black/35 text-transparent hover:bg-black/50')}>
              <Check className="h-4 w-4" />
            </button>
            <div className="rounded-lg bg-black/40 backdrop-blur [&_button:hover]:!bg-white/20 [&_button]:!text-white/90">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/50" title="Mais ações">
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => router.push(`/admin/simulados/${s.id}/ao-vivo`)}><Radio className="mr-2 h-4 w-4" /> Ao vivo (online/progresso)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(detalhe)}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(detalhe)}><Trophy className="mr-2 h-4 w-4" /> Ranking</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={copiarLink}><Copy className="mr-2 h-4 w-4" /> Copiar link</DropdownMenuItem>
                  <DropdownMenuItem onClick={abrirSimulado}><ExternalLink className="mr-2 h-4 w-4" /> Abrir aplicação</DropdownMenuItem>
                  {onMover && <DropdownMenuItem onClick={onMover}><FolderInput className="mr-2 h-4 w-4" /> Mover para pasta</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  {s.status === 'publicado' && <DropdownMenuItem onClick={() => acao(encerrarSimuladoAction, 'Simulado encerrado')}><Square className="mr-2 h-4 w-4" /> Encerrar</DropdownMenuItem>}
                  {s.status === 'encerrado' && <DropdownMenuItem onClick={() => acao(reabrirSimuladoAction, 'Simulado reaberto')}><Play className="mr-2 h-4 w-4" /> Reabrir</DropdownMenuItem>}
                  {s.status === 'rascunho' && <DropdownMenuItem onClick={() => acao(publishSimuladoAction, 'Simulado publicado')}><Send className="mr-2 h-4 w-4" /> Publicar</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={excluir} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Chip do ícone da marca */}
        <span className="pointer-events-none absolute bottom-2 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm ring-1 ring-white/20" style={{ background: cor }}>
          <BancoIcon className="h-4 w-4" />
        </span>
      </div>

      {/* Corpo */}
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', statusChipClass[s.status])}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[s.status])} /> {statusLabel[s.status] ?? s.status}
          </span>
        </div>

        <h3 className="line-clamp-2 text-sm font-bold leading-snug">
          <Link href={detalhe} className="transition-colors hover:text-primary">{s.titulo}</Link>
        </h3>
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3 shrink-0" /> {subtitulo}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{tipoLabel(s.tipo)}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><Clock className="h-3 w-3" /> {formatDur(s.tempo_limite_min)}</span>
        </div>

        {/* Liberações (clicáveis) */}
        <div className="mt-0.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Liberações</p>
          <div className="flex flex-wrap gap-1.5">
            <LiberacaoChip label="Nota" on={estado.nota} pending={pending} onClick={() => toggleLib('nota')} />
            <LiberacaoChip label="Gabarito" on={estado.gabarito} pending={pending} onClick={() => toggleLib('gabarito')} />
            <LiberacaoChip label="Caderno" on={estado.caderno} pending={pending} onClick={() => toggleLib('caderno')} />
          </div>
        </div>

        {/* Ações inline */}
        <div className="mt-auto flex items-center gap-1.5 pt-1.5">
          <button type="button" onClick={abrirSimulado} disabled={!linkAcesso}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
            <ExternalLink className="h-4 w-4" /> Abrir aplicação
          </button>
          <button type="button" onClick={copiarLink} title="Copiar link de acesso"
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary">
            <Copy className="h-4 w-4" />
          </button>
          <Link href={`/admin/simulados/${s.id}/ao-vivo`} title="Ranking e desempenho ao vivo"
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary">
            <BarChart3 className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Tile "adicionar" no fim de cada seção. */
function NovoTile({ pastaNome }: { pastaNome?: string }) {
  return (
    <Link href="/admin/simulados/novo"
      className="group flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-muted/20 p-4 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.04] hover:text-primary">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed transition-colors group-hover:border-primary"><Plus className="h-5 w-5" /></span>
      <span className="text-sm font-medium">{pastaNome ? 'Novo simulado nesta pasta' : 'Novo simulado'}</span>
    </Link>
  )
}

type PastaSim = { id: string; nome: string; cor?: string | null; icone?: string | null; capa?: string | null; count: number }
type DestinoSim = { id: string; nome: string }
export type SimuladoCatalogo = SimuladoCard & { grupoId: string | null }

export function SimuladosBoard({ simulados, appUrl, onlineInicial = {}, folders = [], destinos = [], atual = null, catalogo }: {
  simulados: SimuladoCard[]; appUrl: string; onlineInicial?: Record<string, number>
  folders?: PastaSim[]; destinos?: DestinoSim[]; atual?: { id: string; nome: string } | null
  catalogo?: { sims: SimuladoCatalogo[]; grupos: PastaSim[] }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<string>('todos')
  const [movendo, setMovendo] = useState<SimuladoCard | null>(null)
  const [editandoPasta, setEditandoPasta] = useState<PastaSim | null>(null)
  const [criandoPasta, setCriandoPasta] = useState(false)
  const [selecao, setSelecao] = useState<Set<string>>(new Set())

  // Fonte de dados: quando estamos numa pasta (?pasta=id) usamos os simulados daquele nível;
  // na raiz usamos o catálogo completo (todos os simulados) para montar as seções por pasta.
  const todos = useMemo(() => (atual ? simulados : (catalogo?.sims ?? simulados)) as SimuladoCard[], [atual, simulados, catalogo])

  // Vista: "pastas" (seções por pasta, padrão) ou "status" (grade por Em andamento/A iniciar/Encerrado).
  const [vista, setVista] = useState<'pastas' | 'status'>('pastas')
  useEffect(() => { const v = localStorage.getItem('simulados-vista-2'); if (v === 'pastas' || v === 'status') setVista(v) }, [])
  useEffect(() => { localStorage.setItem('simulados-vista-2', vista) }, [vista])

  // Seções recolhidas.
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set())
  const toggleSecao = (chave: string) =>
    setRecolhidas((prev) => { const n = new Set(prev); if (n.has(chave)) n.delete(chave); else n.add(chave); return n })

  // "Fazendo agora" por simulado, atualizado sozinho (SSE → polling).
  const [online, setOnline] = useState<Record<string, number>>(onlineInicial)
  const idsMonitor = useMemo(() => todos.map((s) => s.id), [todos])
  useEffect(() => {
    const ids = idsMonitor
    if (!ids.length) return
    let vivo = true
    let es: EventSource | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    const tick = async () => { try { const r = await onlinePorSimulado(ids); if (vivo) setOnline(r) } catch { /* silencioso */ } }
    const iniciarPolling = () => { if (!poll) { void tick(); poll = setInterval(tick, 12_000) } }
    try {
      es = new EventSource(`/api/stream/online?ids=${encodeURIComponent(ids.join(','))}`)
      es.onmessage = (ev) => { try { const r = JSON.parse(ev.data) as Record<string, number>; if (vivo) setOnline(r) } catch { /* frame inválido */ } }
      es.onerror = () => { try { es?.close() } catch { /* */ } es = null; iniciarPolling() }
    } catch {
      iniciarPolling()
    }
    return () => { vivo = false; try { es?.close() } catch { /* */ } if (poll) clearInterval(poll) }
  }, [idsMonitor])

  // Filtro (busca + modo) aplicado a todos os simulados.
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return todos.filter((s) => (!q || s.titulo.toLowerCase().includes(q)) && (modo === 'todos' || s.modo_aplicacao === modo))
  }, [todos, busca, modo])

  // Agrupamento por pasta (Aplicação de Simulado). Ordem: pastas na ordem recebida + "Sem pasta" no fim.
  // Dentro de uma pasta (atual != null) não agrupamos: tudo cai em "semPasta" (uma única seção).
  const secoesPasta = useMemo(() => {
    const porPasta = new Map<string, SimuladoCard[]>()
    const semPasta: SimuladoCard[] = []
    for (const s of filtrados) {
      if (!atual && s.pasta_id) { const arr = porPasta.get(s.pasta_id) ?? []; arr.push(s); porPasta.set(s.pasta_id, arr) }
      else semPasta.push(s)
    }
    const comFolder = folders.map((f) => ({ folder: f as PastaSim | null, sims: porPasta.get(f.id) ?? [] }))
    // Só mostra pastas vazias quando não há busca ativa (senão a busca "some" mas deixa pastas vazias).
    const visiveis = busca.trim() ? comFolder.filter((x) => x.sims.length > 0) : comFolder
    return { pastas: visiveis, semPasta }
  }, [filtrados, folders, busca, atual])

  const filtros = [
    { v: 'todos', label: 'Todos' },
    { v: 'janela_fixa', label: 'Janela fixa' },
    { v: 'prazo_relativo', label: 'Prazo relativo' },
    { v: 'aberto', label: 'Aberto' },
  ]

  const podeMover = destinos.length > 0 || !!atual
  const simById = useMemo(() => new Map(todos.map((s) => [s.id, s])), [todos])
  const setSel = (id: string, v: boolean) => setSelecao((p) => { const n = new Set(p); if (v) n.add(id); else n.delete(id); return n })

  async function excluirPasta(f: PastaSim) {
    if (!(await confirmar({ mensagem: `Excluir a pasta "${f.nome}"? Os simulados dentro dela voltam para a raiz (não são apagados).`, destrutivo: true }))) return
    start(async () => { const r = await excluirPastaFolder(f.id); if (r.ok) { toast.success('Pasta excluída'); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }

  // Alternar (em massa) uma liberação para TODOS os simulados de uma pasta.
  function alternarPasta(sims: SimuladoCard[], item: 'nota' | 'gabarito') {
    const alvos = sims.filter((s) => s.status !== 'rascunho')
    if (!alvos.length) return toast.error('Nenhum simulado publicado/encerrado nesta pasta.')
    const flag = item === 'nota' ? 'notaLiberada' : 'gabaritoLiberado'
    const liberados = alvos.filter((s) => resolverLiberacoes(s.regras, { status: s.status, data_fim: s.data_fim })[flag]).length
    const liberar = liberados < alvos.length // se nem todos liberados → libera todos; senão bloqueia todos
    start(async () => {
      await Promise.all(alvos.map((s) => liberarItemAction(s.id, item, liberar)))
      toast.success(`${item === 'nota' ? 'Notas' : 'Gabaritos'} ${liberar ? 'liberados' : 'bloqueados'} em ${alvos.length} simulado(s)`)
      router.refresh()
    })
  }

  const totalFiltrado = filtrados.length

  return (
    <div className="space-y-6">
      {/* Barra de ferramentas */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {atual ? (
            <Link href="/admin/simulados" className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted"><ChevronLeft className="h-4 w-4" /> Todas as pastas</Link>
          ) : (
            <button type="button" onClick={() => setCriandoPasta(true)} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-muted"><FolderPlus className="h-4 w-4" /> Nova pasta</button>
          )}
          <Input placeholder={atual ? `Buscar em “${atual.nome}”…` : 'Buscar simulado…'} value={busca} onChange={(e) => setBusca(e.target.value)} className="min-w-[180px] flex-1 lg:max-w-md" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!atual && (
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {([['pastas', 'Pastas', FolderTree], ['status', 'Status', Rows3]] as const).map(([v, label, Icon]) => (
                <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}
                  className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
                    vista === v ? 'bg-[var(--tab-active,var(--background))] text-[color:var(--tab-active-foreground,var(--foreground))] shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {filtros.map((f) => (
              <button key={f.v} onClick={() => setModo(f.v)}
                className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  modo === f.v ? 'bg-[var(--tab-active,var(--background))] text-[color:var(--tab-active-foreground,var(--foreground))] shadow-sm' : 'text-muted-foreground hover:bg-[var(--tab-active,var(--background))] hover:text-[color:var(--tab-active-foreground,var(--foreground))]')}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {atual && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" /> <span className="font-medium text-foreground">{atual.nome}</span> — {totalFiltrado} simulado(s)
        </div>
      )}

      {/* Conteúdo */}
      {vista === 'status' && !atual ? (
        <SecoesStatus sims={filtrados} online={online} appUrl={appUrl} onMover={podeMover ? (s) => setMovendo(s) : undefined}
          recolhidas={recolhidas} toggleSecao={toggleSecao} selecao={selecao} onSelecionar={setSel} />
      ) : (
        <div className="space-y-8">
          {secoesPasta.pastas.map(({ folder, sims }) => (
            folder && <PastaSection key={folder.id} folder={folder} sims={sims} online={online} appUrl={appUrl}
              aberto={!recolhidas.has(`p:${folder.id}`)} toggle={() => toggleSecao(`p:${folder.id}`)}
              onGerenciar={() => setEditandoPasta(folder)} onExcluir={() => excluirPasta(folder)}
              onAlternar={(item) => alternarPasta(sims, item)} pendingBulk={pending}
              onMover={podeMover ? (s) => setMovendo(s) : undefined} selecao={selecao} onSelecionar={setSel} />
          ))}

          {/* Sem pasta (ou o conteúdo de dentro de uma pasta aberta) */}
          {(atual || secoesPasta.semPasta.length > 0) && (
            <SecaoSimples titulo={atual ? atual.nome : 'Sem pasta'} icone={atual ? FolderOpen : FolderInput}
              sims={secoesPasta.semPasta} online={online} appUrl={appUrl}
              aberto={!recolhidas.has('sem-pasta')} toggle={() => toggleSecao('sem-pasta')}
              onMover={podeMover ? (s) => setMovendo(s) : undefined} selecao={selecao} onSelecionar={setSel}
              mostrarNovo={!!atual} />
          )}

          {folders.length === 0 && secoesPasta.semPasta.length === 0 && !atual && (
            <p className="rounded-2xl border border-dashed py-14 text-center text-sm text-muted-foreground">Nenhum simulado ainda. Crie o primeiro em “Novo simulado”.</p>
          )}
        </div>
      )}

      {/* Barra de seleção em massa */}
      {selecao.size > 0 && (
        <BarraSelecao ids={[...selecao]} simById={simById} onLimpar={() => setSelecao(new Set())} onRefresh={() => router.refresh()} />
      )}

      {movendo && <MoverSimuladoDialog simulado={movendo} destinos={destinos} atualId={atual?.id ?? null} onClose={() => setMovendo(null)} />}
      {editandoPasta && (
        <EditarPastaDialog
          pasta={{ id: editandoPasta.id, nome: editandoPasta.nome, cor: editandoPasta.cor ?? null, icone: editandoPasta.icone ?? null, capa: editandoPasta.capa ?? null }}
          onClose={() => setEditandoPasta(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {criandoPasta && (
        <EditarPastaDialog area="simulado" onClose={() => setCriandoPasta(false)} onSaved={() => router.refresh()} />
      )}
    </div>
  )
}

/** Uma seção de PASTA: cabeçalho (nome + contagem + status + ações em massa) e grade de cards. */
function PastaSection({ folder, sims, online, appUrl, aberto, toggle, onGerenciar, onExcluir, onAlternar, pendingBulk, onMover, selecao, onSelecionar }: {
  folder: PastaSim; sims: SimuladoCard[]; online: Record<string, number>; appUrl: string
  aberto: boolean; toggle: () => void; onGerenciar: () => void; onExcluir: () => void
  onAlternar: (item: 'nota' | 'gabarito') => void; pendingBulk: boolean
  onMover?: (s: SimuladoCard) => void; selecao: Set<string>; onSelecionar: (id: string, v: boolean) => void
}) {
  const st = statusPasta(sims)
  const cor = folder.cor ?? '#6d28d9'
  const Icon = iconeBanco(folder.icone)
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={toggle} aria-expanded={aberto} className="group flex min-w-0 items-center gap-2 text-left">
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground', !aberto && '-rotate-90')} />
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white shadow-sm" style={{ background: cor }}><Icon className="h-3.5 w-3.5" /></span>
          <span className="truncate font-semibold">{folder.nome}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{sims.length} simulado(s)</span>
          {st && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', st.cls)}>{st.label}</span>}
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => onAlternar('nota')} disabled={pendingBulk}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
            <Unlock className="h-3.5 w-3.5" /> Alternar notas
          </button>
          <button type="button" onClick={() => onAlternar('gabarito')} disabled={pendingBulk}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
            <Unlock className="h-3.5 w-3.5" /> Alternar gabaritos
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-semibold shadow-sm outline-none transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
              <FolderCog className="h-3.5 w-3.5" /> Gerenciar pasta
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onGerenciar}><Palette className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/admin/simulados?pasta=${folder.id}`} />}><FolderOpen className="mr-2 h-4 w-4" /> Abrir pasta</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExcluir} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir pasta</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {aberto && (
        <div className="grid items-stretch gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {sims.map((s) => (
            <CardSimuladoAdmin key={s.id} s={s} appUrl={appUrl} online={online[s.id] ?? 0}
              onMover={onMover ? () => onMover(s) : undefined} selecionado={selecao.has(s.id)} onSelecionar={(v) => onSelecionar(s.id, v)} />
          ))}
          <NovoTile pastaNome={folder.nome} />
        </div>
      )}
    </section>
  )
}

/** Seção simples (sem ações de pasta) — usada para "Sem pasta" e para o nível de dentro de uma pasta. */
function SecaoSimples({ titulo, icone: Icone, sims, online, appUrl, aberto, toggle, onMover, selecao, onSelecionar, mostrarNovo }: {
  titulo: string; icone: any; sims: SimuladoCard[]; online: Record<string, number>; appUrl: string
  aberto: boolean; toggle: () => void; onMover?: (s: SimuladoCard) => void
  selecao: Set<string>; onSelecionar: (id: string, v: boolean) => void; mostrarNovo?: boolean
}) {
  return (
    <section className="space-y-3">
      <button type="button" onClick={toggle} aria-expanded={aberto} className="group flex items-center gap-2 text-left">
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground', !aberto && '-rotate-90')} />
        <Icone className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{titulo}</span>
        <span className="text-sm text-muted-foreground">{sims.length} simulado(s)</span>
      </button>
      {aberto && (
        sims.length === 0 && !mostrarNovo ? (
          <p className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">Nenhum simulado aqui.</p>
        ) : (
          <div className="grid items-stretch gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sims.map((s) => (
              <CardSimuladoAdmin key={s.id} s={s} appUrl={appUrl} online={online[s.id] ?? 0}
                onMover={onMover ? () => onMover(s) : undefined} selecionado={selecao.has(s.id)} onSelecionar={(v) => onSelecionar(s.id, v)} />
            ))}
            {mostrarNovo && <NovoTile pastaNome={titulo} />}
          </div>
        )
      )}
    </section>
  )
}

/** Seções por status (Em andamento / A iniciar / Encerrado) em grade — vista "Status". */
function SecoesStatus({ sims, online, appUrl, onMover, recolhidas, toggleSecao, selecao, onSelecionar }: {
  sims: SimuladoCard[]; online: Record<string, number>; appUrl: string
  onMover?: (s: SimuladoCard) => void; recolhidas: Set<string>; toggleSecao: (chave: string) => void
  selecao: Set<string>; onSelecionar: (id: string, v: boolean) => void
}) {
  return (
    <div className="space-y-8">
      {secoes.map((sec) => {
        const itens = sims.filter((s) => s.status === sec.chave)
        const aberto = !recolhidas.has(sec.chave)
        return (
          <div key={sec.chave} className="space-y-3">
            <button type="button" onClick={() => toggleSecao(sec.chave)} aria-expanded={aberto}
              className="group flex w-full items-center gap-2 rounded-lg py-0.5 text-left transition-colors">
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground', !aberto && '-rotate-90')} />
              <span className={cn('h-2.5 w-2.5 rounded-full', sec.cor)} />
              <span className="font-semibold">{sec.titulo}</span>
              <span className="text-sm text-muted-foreground">({itens.length})</span>
            </button>
            {aberto && (itens.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                {sec.chave === 'rascunho' ? 'Nenhum simulado aguardando início' : sec.chave === 'publicado' ? 'Nenhum simulado em andamento' : 'Nenhum simulado encerrado'}
              </p>
            ) : (
              <div className="grid items-stretch gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {itens.map((s) => (
                  <CardSimuladoAdmin key={s.id} s={s} appUrl={appUrl} online={online[s.id] ?? 0}
                    onMover={onMover ? () => onMover(s) : undefined} selecionado={selecao.has(s.id)} onSelecionar={(v) => onSelecionar(s.id, v)} />
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** Barra flutuante de seleção em massa: liberar nota/gabarito/caderno, encerrar, limpar. */
function BarraSelecao({ ids, simById, onLimpar, onRefresh }: {
  ids: string[]; simById: Map<string, SimuladoCard>; onLimpar: () => void; onRefresh: () => void
}) {
  const [pending, start] = useTransition()
  const acionaveis = ids.map((id) => simById.get(id)).filter(Boolean) as SimuladoCard[]

  function liberar(item: 'nota' | 'gabarito' | 'caderno') {
    const alvos = acionaveis.filter((s) => s.status !== 'rascunho')
    if (!alvos.length) return toast.error('Selecione simulados publicados/encerrados.')
    start(async () => {
      await Promise.all(alvos.map((s) => liberarItemAction(s.id, item, true)))
      toast.success(`${item === 'nota' ? 'Nota' : item === 'gabarito' ? 'Gabarito' : 'Caderno'} liberado(a) em ${alvos.length} simulado(s)`)
      onLimpar(); onRefresh()
    })
  }
  function encerrar() {
    const alvos = acionaveis.filter((s) => s.status === 'publicado')
    if (!alvos.length) return toast.error('Nenhum simulado em andamento na seleção.')
    start(async () => {
      await Promise.all(alvos.map((s) => encerrarSimuladoAction(s.id)))
      toast.success(`${alvos.length} simulado(s) encerrado(s)`)
      onLimpar(); onRefresh()
    })
  }

  return createPortal(
    <div className="fixed inset-x-0 bottom-4 z-[120] flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card/95 px-3 py-2 shadow-xl backdrop-blur">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary">
          <Users className="h-4 w-4" /> {ids.length} selecionado(s)
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">Liberar:</span>
        <button type="button" onClick={() => liberar('nota')} disabled={pending} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-50"><Unlock className="h-3.5 w-3.5" /> Nota</button>
        <button type="button" onClick={() => liberar('gabarito')} disabled={pending} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-50"><Unlock className="h-3.5 w-3.5" /> Gabarito</button>
        <button type="button" onClick={() => liberar('caderno')} disabled={pending} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-50"><Unlock className="h-3.5 w-3.5" /> Caderno</button>
        <button type="button" onClick={encerrar} disabled={pending} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-amber-500 hover:text-amber-600 disabled:opacity-50"><Square className="h-3.5 w-3.5" /> Encerrar</button>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <button type="button" onClick={onLimpar} className="ml-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Limpar seleção"><X className="h-4 w-4" /></button>
      </div>
    </div>,
    document.body,
  )
}

function MoverSimuladoDialog({ simulado, destinos, atualId, onClose }: { simulado: SimuladoCard; destinos: DestinoSim[]; atualId: string | null; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sel, setSel] = useState<string | null>(simulado.pasta_id ?? atualId)

  function salvar() {
    start(async () => {
      const r = await moverSimuladoParaPasta(simulado.id, sel)
      if (r.ok) { toast.success(sel ? 'Movido para a pasta' : 'Movido para a raiz'); router.refresh(); onClose() } else toast.error(r.error ?? 'Erro ao mover')
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FolderInput className="h-4 w-4" /> Mover “{simulado.titulo}”</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-4">
          <OpcaoSim ativo={sel === null} onClick={() => setSel(null)} icon={<Radio className="h-4 w-4 text-muted-foreground" />} label="Raiz (sem pasta)" />
          {destinos.length === 0 && <p className="px-1 py-2 text-center text-xs text-muted-foreground">Nenhuma pasta criada ainda.</p>}
          {destinos.map((d) => (
            <OpcaoSim key={d.id} ativo={sel === d.id} onClick={() => setSel(d.id)} icon={<Folder className="h-4 w-4 text-muted-foreground" />} label={d.nome} />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending || sel === (simulado.pasta_id ?? atualId)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Mover
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function OpcaoSim({ ativo, onClick, icon, label }: { ativo: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
        {ativo && <Check className="h-3 w-3" />}
      </span>
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
    </button>
  )
}
