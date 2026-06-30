'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  encerrarSimuladoAction,
  reabrirSimuladoAction,
  publishSimuladoAction,
  deleteSimuladoAction,
  liberarGabaritoAction,
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
  regras?: { gabarito_liberado?: boolean } | null
}

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

function CardItem({ s, appUrl }: { s: SimuladoCard; appUrl: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [gabLiberado, setGabLiberado] = useState(!!s.regras?.gabarito_liberado)

  const linkAcesso = s.embed_token ? `${appUrl}/aluno/login?token=${s.embed_token}` : null

  function toggleGabarito() {
    const novo = !gabLiberado
    setGabLiberado(novo)
    startTransition(async () => {
      await liberarGabaritoAction(s.id, novo)
      toast.success(novo ? 'Gabarito liberado para os alunos' : 'Gabarito bloqueado')
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
    window.open(linkAcesso, '_blank')
  }

  function excluir() {
    if (!confirm(`Excluir o simulado "${s.titulo}"? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      const r = await deleteSimuladoAction(s.id)
      if (r?.error) toast.error(r.error)
      else toast.success('Simulado excluído')
      router.refresh()
    })
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Capa estilo caderno (altura fixa) */}
      <Link href={`/admin/simulados/${s.id}`} className="block">
        <div className={cn('relative flex h-32 items-center justify-center overflow-hidden', coverClass[s.status] ?? coverClass.rascunho)}>
          <div className="absolute left-2 top-0 bottom-0 flex flex-col justify-center gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="h-2 w-2 rounded-full bg-black/25 ring-1 ring-white/20" />
            ))}
          </div>
          <span className="text-5xl font-extrabold tracking-widest text-white/30 select-none">
            {iniciais(s.titulo)}
          </span>
          <span className={cn('absolute right-3 top-3 h-3 w-3 rounded-full ring-2 ring-white/50', dotClass[s.status])} />
          <span className="absolute bottom-2 left-3 rounded-md bg-black/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            {modoLabel[s.modo_aplicacao] ?? s.modo_aplicacao}
          </span>
        </div>
      </Link>

      {/* Corpo padronizado */}
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/admin/simulados/${s.id}`} className="min-w-0 flex-1">
            <h3 className="truncate font-semibold leading-tight hover:underline">{s.titulo}</h3>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger
              className="shrink-0 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              title="Mais ações"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => router.push(`/admin/simulados/${s.id}`)}>
                <Pencil className="mr-2 h-4 w-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/admin/simulados/${s.id}`)}>
                <Trophy className="mr-2 h-4 w-4" /> Ranking
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={copiarLink}>
                <Copy className="mr-2 h-4 w-4" /> Copiar link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={abrirSimulado}>
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir simulado
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {s.status === 'publicado' && (
                <DropdownMenuItem onClick={() => acao(encerrarSimuladoAction, 'Simulado encerrado')}>
                  <Square className="mr-2 h-4 w-4" /> Encerrar
                </DropdownMenuItem>
              )}
              {s.status === 'encerrado' && (
                <DropdownMenuItem onClick={() => acao(reabrirSimuladoAction, 'Simulado reaberto')}>
                  <Play className="mr-2 h-4 w-4" /> Reabrir
                </DropdownMenuItem>
              )}
              {s.status === 'rascunho' && (
                <DropdownMenuItem onClick={() => acao(publishSimuladoAction, 'Simulado publicado')}>
                  <Send className="mr-2 h-4 w-4" /> Publicar
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={excluir} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className={cn('mt-1 text-xs font-medium', statusText[s.status])}>{statusLabel[s.status]}</p>

        {/* Liberar gabarito — só quando encerrado */}
        {s.status === 'encerrado' && (
          <button onClick={toggleGabarito} disabled={pending} title={gabLiberado ? 'Gabarito liberado para os alunos — clique para bloquear' : 'Liberar o gabarito para os alunos verem suas respostas'}
            className={cn('mt-2 inline-flex items-center gap-1.5 self-start rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
              gabLiberado ? 'border-green-500/60 bg-background text-green-700 dark:border-green-600/50 dark:text-green-400' : 'text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-foreground')}>
            {gabLiberado ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {gabLiberado ? 'Gabarito liberado' : 'Liberar gabarito'}
          </button>
        )}

        {/* Rodapé sempre na base, formato único */}
        <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] whitespace-nowrap text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatDur(s.tempo_limite_min)}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatData(s)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function SimuladosBoard({ simulados, appUrl }: { simulados: SimuladoCard[]; appUrl: string }) {
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<string>('todos')

  const filtrados = useMemo(() => {
    return simulados.filter((s) => {
      const okBusca = s.titulo.toLowerCase().includes(busca.toLowerCase())
      const okModo = modo === 'todos' || s.modo_aplicacao === modo
      return okBusca && okModo
    })
  }, [simulados, busca, modo])

  const filtros = [
    { v: 'todos', label: 'Todos' },
    { v: 'janela_fixa', label: 'Janela fixa' },
    { v: 'prazo_relativo', label: 'Prazo relativo' },
    { v: 'aberto', label: 'Aberto' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Input
          placeholder="Buscar simulado…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="lg:max-w-xl"
        />
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {filtros.map((f) => (
            <button
              key={f.v}
              onClick={() => setModo(f.v)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                modo === f.v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

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
                  <CardItem key={s.id} s={s} appUrl={appUrl} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
