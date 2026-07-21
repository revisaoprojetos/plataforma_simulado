'use client'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'

import { useState, useTransition, useMemo, useEffect } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { EditarPastaDialog } from '@/components/admin/editar-pasta-dialog'
import { criarPastaFolder, excluirPastaFolder } from '@/app/admin/banco-questoes/actions'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
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
  ChevronLeft,
  FolderInput,
  Palette,
  X,
  Check,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { abrirLinkTemado } from '@/lib/hud/abrir-temado'
import { formatBrt } from '@/lib/brt'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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

function iniciais(titulo: string) {
  return titulo.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function formatDur(min: number | null) {
  if (!min) return 'Sem limite'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h${m}min`
  if (h) return `${h}h`
  return `${m}min`
}

function formatData(s: SimuladoCard) {
  return format(new Date(s.data_inicio ?? s.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
}

const coverClass: Record<string, string> = {
  publicado: 'bg-gradient-to-br from-amber-400 to-orange-500',
  rascunho: 'bg-gradient-to-br from-sky-400 to-blue-500',
  encerrado: 'bg-gradient-to-br from-slate-400 to-slate-600',
}
const dotClass: Record<string, string> = {
  publicado: 'bg-amber-400',
  rascunho: 'bg-sky-400',
  encerrado: 'bg-red-500',
}
const statusLabel: Record<string, string> = {
  publicado: 'Em andamento',
  rascunho: 'Rascunho',
  encerrado: 'Encerrado',
}
const statusText: Record<string, string> = {
  publicado: 'text-amber-600 dark:text-amber-400',
  rascunho: 'text-sky-600 dark:text-sky-400',
  encerrado: 'text-red-600 dark:text-red-400',
}

function SeloLib({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur" title={`${label} liberado(a) para os alunos`}>
      <Unlock className="h-3 w-3" /> {label}
    </span>
  )
}

function CardItem({ s, appUrl, online, onMover }: { s: SimuladoCard; appUrl: string; online: number; onMover?: () => void }) {
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
      await fn(s.id)
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

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {/* Fundo: imagem do banco ou degradê da cor */}
      {capa
        ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
      {!capa && <BancoIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      {/* Link cobre o card (abaixo do kebab) */}
      <Link href={`/admin/simulados/${s.id}`} className="absolute inset-0 z-10" aria-label={s.titulo} />

      {/* Chip do ícone */}
      <span className="pointer-events-none absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: cor }}>
        <BancoIcon className="h-4 w-4" />
      </span>

      {/* Ações (kebab) */}
      <div className="absolute right-2 top-2 z-30 rounded-lg bg-black/40 backdrop-blur [&_button:hover]:!bg-white/20 [&_button]:!text-white/90">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/50" title="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => router.push(`/admin/simulados/${s.id}/ao-vivo`)}><Radio className="mr-2 h-4 w-4" /> Ao vivo (online/progresso)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/admin/simulados/${s.id}`)}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/admin/simulados/${s.id}`)}><Trophy className="mr-2 h-4 w-4" /> Ranking</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={copiarLink}><Copy className="mr-2 h-4 w-4" /> Copiar link</DropdownMenuItem>
            <DropdownMenuItem onClick={abrirSimulado}><ExternalLink className="mr-2 h-4 w-4" /> Abrir simulado</DropdownMenuItem>
            {onMover && <DropdownMenuItem onClick={onMover}><FolderInput className="mr-2 h-4 w-4" /> Mover para pasta</DropdownMenuItem>}
            <DropdownMenuSeparator />
            {s.status === 'publicado' && <DropdownMenuItem onClick={() => acao(encerrarSimuladoAction, 'Simulado encerrado')}><Square className="mr-2 h-4 w-4" /> Encerrar</DropdownMenuItem>}
            {s.status === 'encerrado' && <DropdownMenuItem onClick={() => acao(reabrirSimuladoAction, 'Simulado reaberto')}><Play className="mr-2 h-4 w-4" /> Reabrir</DropdownMenuItem>}
            {s.status === 'rascunho' && <DropdownMenuItem onClick={() => acao(publishSimuladoAction, 'Simulado publicado')}><Send className="mr-2 h-4 w-4" /> Publicar</DropdownMenuItem>}
            {s.status !== 'rascunho' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => toggleLib('nota')}>{estado.nota ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />} {estado.nota ? 'Bloquear nota' : 'Liberar nota'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleLib('gabarito')}>{estado.gabarito ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />} {estado.gabarito ? 'Bloquear gabarito' : 'Liberar gabarito'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleLib('caderno')}>{estado.caderno ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />} {estado.caderno ? 'Bloquear caderno' : 'Liberar caderno'}</DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={excluir} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Rodapé */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        <div className="mb-1 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85 backdrop-blur">
            <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[s.status])} /> {statusLabel[s.status]}
          </span>
          {/* "Fazendo agora" ao vivo — só na visão do admin (o aluno não vê isto). */}
          {online > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur" title={`${online} aluno(s) fazendo agora`}>
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
              {online} fazendo agora
            </span>
          )}
        </div>
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">{tipoLabel(s.tipo)}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">{modoLabel[s.modo_aplicacao] ?? s.modo_aplicacao}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><Clock className="h-3 w-3" /> {formatDur(s.tempo_limite_min)}</span>
        </div>
        {/* Janela do simulado (horário de Brasília): início e fim; só início quando não há fim. */}
        {s.modo_aplicacao === 'janela_fixa' && s.data_inicio ? (
          <div className="mt-1.5 space-y-0.5 text-[11px] font-medium text-white/85">
            <p className="flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0" /> Início: {formatBrt(s.data_inicio)}</p>
            {s.data_fim && <p className="flex items-center gap-1"><Square className="h-3 w-3 shrink-0" /> Encerra: {formatBrt(s.data_fim)}</p>}
          </div>
        ) : (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-white/85">
            <Calendar className="h-3 w-3 shrink-0" />
            {s.modo_aplicacao === 'aberto' ? 'Sempre disponível' : s.modo_aplicacao === 'prazo_relativo' ? 'Prazo definido por aluno' : 'Sem data definida'}
          </p>
        )}
        {(estado.nota || estado.gabarito || estado.caderno) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {estado.nota && <SeloLib label="Nota" />}
            {estado.gabarito && <SeloLib label="Gabarito" />}
            {estado.caderno && <SeloLib label="Caderno" />}
          </div>
        )}
      </div>
    </div>
  )
}

type PastaSim = { id: string; nome: string; cor?: string | null; icone?: string | null; capa?: string | null; count: number }
type DestinoSim = { id: string; nome: string }

export function SimuladosBoard({ simulados, appUrl, onlineInicial = {}, folders = [], destinos = [], atual = null }: {
  simulados: SimuladoCard[]; appUrl: string; onlineInicial?: Record<string, number>
  folders?: PastaSim[]; destinos?: DestinoSim[]; atual?: { id: string; nome: string } | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<string>('todos')
  const [movendo, setMovendo] = useState<SimuladoCard | null>(null)
  const [editandoPasta, setEditandoPasta] = useState<PastaSim | null>(null)
  // "Fazendo agora" por simulado, atualizado sozinho (polling) — igual ao painel "Ao vivo".
  const [online, setOnline] = useState<Record<string, number>>(onlineInicial)
  useEffect(() => {
    const ids = simulados.map((s) => s.id)
    if (!ids.length) return
    let vivo = true
    const tick = async () => { try { const r = await onlinePorSimulado(ids); if (vivo) setOnline(r) } catch { /* silencioso */ } }
    const t = setInterval(tick, 12_000)
    return () => { vivo = false; clearInterval(t) }
  }, [simulados])

  const filtrados = useMemo(() => {
    return simulados.filter((s) => {
      const okBusca = s.titulo.toLowerCase().includes(busca.toLowerCase())
      const okModo = modo === 'todos' || s.modo_aplicacao === modo
      return okBusca && okModo
    })
  }, [simulados, busca, modo])
  const foldersF = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? folders.filter((f) => f.nome.toLowerCase().includes(q)) : folders
  }, [folders, busca])

  const filtros = [
    { v: 'todos', label: 'Todos' },
    { v: 'janela_fixa', label: 'Janela fixa' },
    { v: 'prazo_relativo', label: 'Prazo relativo' },
    { v: 'aberto', label: 'Aberto' },
  ]

  // O diálogo abre FORA da transition (senão o setState que mostra o pop-up é adiado).
  async function novaPasta() {
    const nome = await pedirTexto({ titulo: 'Nova pasta', label: 'Nome da pasta', placeholder: 'ex.: Semana de Atualização', confirmar: 'Criar pasta' })
    if (!nome) return
    start(async () => { const r = await criarPastaFolder(nome, null, 'simulado'); if (r.ok) { toast.success('Pasta criada'); router.refresh() } else toast.error(r.error ?? 'Erro ao criar') })
  }
  async function excluirPasta(f: PastaSim) {
    if (!(await confirmar({ mensagem: `Excluir a pasta "${f.nome}"? Os simulados dentro dela voltam para a raiz (não são apagados).`, destrutivo: true }))) return
    start(async () => { const r = await excluirPastaFolder(f.id); if (r.ok) { toast.success('Pasta excluída'); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }
  const podeMover = destinos.length > 0 || !!atual

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {atual ? (
            <Link href="/admin/simulados" className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted"><ChevronLeft className="h-4 w-4" /> Todas as pastas</Link>
          ) : (
            <button type="button" onClick={novaPasta} disabled={pending} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-muted disabled:opacity-50"><FolderPlus className="h-4 w-4" /> Nova pasta</button>
          )}
          <Input placeholder={atual ? `Buscar em “${atual.nome}”…` : 'Buscar simulado…'} value={busca} onChange={(e) => setBusca(e.target.value)} className="min-w-[180px] flex-1 lg:max-w-md" />
        </div>
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

      {atual && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" /> <span className="font-medium text-foreground">{atual.nome}</span> — {simulados.length} simulado(s)
        </div>
      )}

      {/* Pastas (só na raiz) + divisória entre pastas e simulados */}
      {!atual && foldersF.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2"><Folder className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">Pastas</h2><span className="text-sm text-muted-foreground">({foldersF.length})</span></div>
          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {foldersF.map((f) => <FolderCardSim key={f.id} f={f} onExcluir={() => excluirPasta(f)} onPersonalizar={() => setEditandoPasta(f)} />)}
          </div>
        </div>
      )}

      {secoes.map((sec) => {
        const itens = filtrados.filter((s) => s.status === sec.chave)
        return (
          <div key={sec.chave} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', sec.cor)} />
              <h2 className="font-semibold">{sec.titulo}</h2>
              <span className="text-sm text-muted-foreground">({itens.length})</span>
            </div>
            {itens.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                {sec.chave === 'rascunho'
                  ? 'Nenhum simulado aguardando início'
                  : sec.chave === 'publicado'
                  ? 'Nenhum simulado em andamento'
                  : 'Nenhum simulado encerrado'}
              </p>
            ) : (
              <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {itens.map((s) => (
                  <CardItem key={s.id} s={s} appUrl={appUrl} online={online[s.id] ?? 0} onMover={podeMover ? () => setMovendo(s) : undefined} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {movendo && <MoverSimuladoDialog simulado={movendo} destinos={destinos} atualId={atual?.id ?? null} onClose={() => setMovendo(null)} />}
      {editandoPasta && (
        <EditarPastaDialog
          pasta={{ id: editandoPasta.id, nome: editandoPasta.nome, cor: editandoPasta.cor ?? null, icone: editandoPasta.icone ?? null, capa: editandoPasta.capa ?? null }}
          onClose={() => setEditandoPasta(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}

/** Card de PASTA da Aplicação de Simulado — imagem/cor + nome + nº de simulados. Clicar abre. */
function FolderCardSim({ f, onExcluir, onPersonalizar }: { f: PastaSim; onExcluir: () => void; onPersonalizar: () => void }) {
  const c = f.cor ?? '#6d28d9'
  const Icon = iconeBanco(f.icone)
  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {f.capa ? (
        <img src={f.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
      {!f.capa && <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
      <Link href={`/admin/simulados?pasta=${f.id}`} className="absolute inset-0 z-10" aria-label={f.nome} />
      <div className="pointer-events-none absolute left-3 top-3 z-20">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: c }}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="absolute right-2 top-2 z-30">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50" aria-label="Ações da pasta">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem render={<Link href={`/admin/simulados?pasta=${f.id}`} />}><FolderOpen className="mr-2 h-4 w-4" /> Abrir</DropdownMenuItem>
            <DropdownMenuItem onClick={onPersonalizar}><Palette className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExcluir} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir pasta</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Pasta</p>
        <h3 className="mt-0.5 line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{f.nome}</h3>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur"><Folder className="h-3 w-3" /> {f.count} simulado(s)</span>
      </div>
    </div>
  )
}

function MoverSimuladoDialog({ simulado, destinos, atualId, onClose }: { simulado: SimuladoCard; destinos: DestinoSim[]; atualId: string | null; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sel, setSel] = useState<string | null>(atualId)

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
          <button type="button" onClick={salvar} disabled={pending || sel === atualId}
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
