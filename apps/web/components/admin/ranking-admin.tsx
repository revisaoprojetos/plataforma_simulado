'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { toast } from 'sonner'
import { Trophy, Flame, Search, X, Download, MoreVertical, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, EyeOff, Eye, Crown, ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal, Eraser, CalendarClock, BarChart3, FlaskConical, Check, Target, FileText, FileSpreadsheet, FileType, FileDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { DetalheAlunoModal } from '@/components/aluno/leitura-ranking'
import type { RankingLeitura, RankingLeituraItem, RankingStatus } from '@/lib/leitura/ranking'
import { obterRankingModulo, carregarRankingOcultos, salvarRankingOcultos } from '@/app/admin/leitura/actions'
import { baixarTabelaCsv, baixarTabelaExcel, baixarTabelaWord, baixarTabelaPdf } from '@/lib/relatorios/exportar-tabela'

const POR_PAG = 10
const POLL_MS = 15_000
type Ordem = 'sequencia' | 'pontos' | 'aulas' | 'acesso' | 'status'
const RANK_STATUS: Record<RankingStatus, number> = { ativo: 3, atencao: 2, risco: 1 }
const iniciais = (n: string) => (n || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

const STATUS: Record<RankingStatus, { rotulo: string; cls: string; dot: string }> = {
  ativo: { rotulo: 'Ativo', cls: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-500' },
  atencao: { rotulo: 'Pendente', cls: 'bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/30', dot: 'bg-amber-500' },
  risco: { rotulo: 'Não ativo', cls: 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/30', dot: 'bg-rose-500' },
}

const hojeBrt = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
function diasDesde(dia: string | null): number {
  if (!dia) return Infinity
  return Math.round((Date.parse(hojeBrt() + 'T00:00:00Z') - Date.parse(dia + 'T00:00:00Z')) / 86_400_000)
}
function ultAcesso(dia: string | null): string {
  if (!dia) return 'não acessou'
  const d = diasDesde(dia)
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`
}
type AcessoFiltro = 'todos' | 'hoje' | 'ontem' | 'sem2' | 'sem3' | 'nunca'
const ACESSO_OPTS: { v: AcessoFiltro; rotulo: string }[] = [
  { v: 'todos', rotulo: 'Todos' }, { v: 'hoje', rotulo: 'Acessou hoje' }, { v: 'ontem', rotulo: 'Acessou ontem' },
  { v: 'sem2', rotulo: '2+ dias sem acesso' }, { v: 'sem3', rotulo: '3+ dias sem acesso' }, { v: 'nunca', rotulo: 'Nunca acessou' },
]
function casaAcesso(dia: string | null, f: AcessoFiltro): boolean {
  if (f === 'todos') return true
  if (f === 'nunca') return !dia
  const d = diasDesde(dia)
  return f === 'hoje' ? d <= 0 : f === 'ontem' ? d === 1 : f === 'sem2' ? d >= 2 : f === 'sem3' ? d >= 3 : true
}

/** Número que anima a transição (count-up) quando o valor muda — usado em pontos e sequência. */
function CountUp({ value, className }: { value: number; className?: string }) {
  const [disp, setDisp] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current, to = value
    prev.current = to
    if (from === to) { setDisp(to); return }
    const ini = performance.now(), dur = 650
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - ini) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setDisp(Math.round(from + (to - from) * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className={className}>{disp.toLocaleString('pt-BR')}</span>
}

/**
 * Reformulação do ranking (ADMIN). Pódio + filtros por status + ordenação + busca + export + recálculo.
 * ATUALIZA AO VIVO: faz polling do ranking (o cache já é invalidado quando um aluno conclui aula/quiz),
 * e ANIMA as mudanças — linhas deslizam para a nova posição (FLIP) e pontos/sequência fazem count-up +
 * destaque quando um aluno passa o outro. Ordenação PRINCIPAL = sequência; desempate = pontos.
 */
export function RankingAdmin({ inicial, moduloId, moduloNome }: { inicial: RankingLeitura; moduloId: string; moduloNome?: string }) {
  const [itens, setItens] = useState<RankingLeituraItem[]>(inicial.itens)
  const [busca, setBusca] = useState('')
  const [nivelMin, setNivelMin] = useState<number | ''>('')
  const [nivelMax, setNivelMax] = useState<number | ''>('')
  const [pctMin, setPctMin] = useState<number | ''>('')
  const [pctMax, setPctMax] = useState<number | ''>('')
  const [seqMin, setSeqMin] = useState<number | ''>('')
  const [seqMax, setSeqMax] = useState<number | ''>('')
  const [acesso, setAcesso] = useState<AcessoFiltro>('todos')
  const [ordem, setOrdem] = useState<Ordem>('sequencia')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [filtro, setFiltro] = useState<'todos' | RankingStatus>('todos')
  const [pagina, setPagina] = useState(1)
  const [aoVivo, setAoVivo] = useState(true)
  const [detalhe, setDetalhe] = useState<RankingLeituraItem | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [mostrarOcultos, setMostrarOcultos] = useState(true)

  // Flash de mudança (id → expira em). Marca quem teve pontos/sequência alterados no último poll.
  const [flash, setFlash] = useState<Record<string, number>>({})
  const anterior = useRef<Map<string, RankingLeituraItem>>(new Map(inicial.itens.map((i) => [i.estudanteId, i])))
  const flipArmed = useRef(false) // só anima a tabela quando a mudança veio de uma ATUALIZAÇÃO ao vivo (não em troca de página/ordenação)

  // Aplica novos dados detectando quem mudou (p/ o flash).
  const aplicar = useCallback((novos: RankingLeituraItem[]) => {
    const mudou: Record<string, number> = {}
    const agora = Date.now()
    for (const n of novos) {
      const a = anterior.current.get(n.estudanteId)
      if (a && (a.score !== n.score || a.streakAtual !== n.streakAtual)) mudou[n.estudanteId] = agora + 1600
    }
    anterior.current = new Map(novos.map((i) => [i.estudanteId, i]))
    if (Object.keys(mudou).length) setFlash((f) => ({ ...f, ...mudou }))
    flipArmed.current = true // próxima renderização pode animar as linhas que de fato mudaram de lugar
    setItens(novos)
  }, [])

  // Polling "ao vivo" — só quando a aba está visível e o modo está ligado.
  useEffect(() => {
    if (!aoVivo || !moduloId) return
    let vivo = true
    const puxar = async () => {
      if (document.hidden) return
      const r = await obterRankingModulo(moduloId).catch(() => null)
      if (vivo && r?.ok && r.itens) aplicar(r.itens)
    }
    const id = setInterval(puxar, POLL_MS)
    return () => { vivo = false; clearInterval(id) }
  }, [aoVivo, moduloId, aplicar])

  // Limpa flashes expirados.
  useEffect(() => {
    if (!Object.keys(flash).length) return
    const t = setTimeout(() => setFlash((f) => Object.fromEntries(Object.entries(f).filter(([, exp]) => exp > Date.now()))), 1700)
    return () => clearTimeout(t)
  }, [flash])


  // Base (reais + ocultos conforme toggle) → filtro de status → busca.
  const reais = useMemo(() => itens.filter((i) => !i.oculto), [itens])
  const qtdOcultos = itens.length - reais.length
  const contagem = useMemo(() => {
    const c = { todos: reais.length, ativo: 0, atencao: 0, risco: 0 }
    for (const i of reais) c[i.status]++
    return c
  }, [reais])

  const lista = useMemo(() => {
    let base = mostrarOcultos ? itens : reais
    if (filtro !== 'todos') base = base.filter((i) => i.status === filtro && !i.oculto)
    const q = busca.trim().toLowerCase()
    if (q) base = base.filter((i) => i.nome.toLowerCase().includes(q) || (i.email ?? '').toLowerCase().includes(q))
    if (nivelMin !== '') base = base.filter((i) => i.nivel >= nivelMin)
    if (nivelMax !== '') base = base.filter((i) => i.nivel <= nivelMax)
    const pctDe = (i: RankingLeituraItem) => (i.totalAulas > 0 ? Math.round((i.aulasConcluidas / i.totalAulas) * 100) : 0)
    if (pctMin !== '') base = base.filter((i) => pctDe(i) >= pctMin)
    if (pctMax !== '') base = base.filter((i) => pctDe(i) <= pctMax)
    if (seqMin !== '') base = base.filter((i) => i.streakAtual >= seqMin)
    if (seqMax !== '') base = base.filter((i) => i.streakAtual <= seqMax)
    if (acesso !== 'todos') base = base.filter((i) => casaAcesso(i.ultimoDiaAtivo, acesso) && !i.oculto)
    const valAcesso = (i: RankingLeituraItem) => (i.ultimoDiaAtivo ? Date.parse(i.ultimoDiaAtivo) : -Infinity)
    const cmp = (a: RankingLeituraItem, b: RankingLeituraItem) => {
      if (a.oculto !== b.oculto) return a.oculto ? 1 : -1 // ocultos sempre no fim
      const c = ordem === 'pontos' ? a.score - b.score || a.streakAtual - b.streakAtual
        : ordem === 'aulas' ? a.aulasConcluidas - b.aulasConcluidas || a.score - b.score
          : ordem === 'acesso' ? valAcesso(a) - valAcesso(b) || a.streakAtual - b.streakAtual
            : ordem === 'status' ? RANK_STATUS[a.status] - RANK_STATUS[b.status] || a.streakAtual - b.streakAtual
              : a.streakAtual - b.streakAtual || a.score - b.score // sequência (principal) → pontos (desempate)
      return dir === 'desc' ? -c : c
    }
    return [...base].sort(cmp)
  }, [itens, reais, mostrarOcultos, filtro, busca, nivelMin, nivelMax, pctMin, pctMax, seqMin, seqMax, acesso, ordem, dir])

  // Posição REAL de cada aluno (rank na ordenação atual, entre TODOS os reais) → o # fica correto mesmo
  // com busca/filtro aplicados (mostra onde o aluno está no ranking, não o índice da lista filtrada).
  const rankById = useMemo(() => {
    const valAcesso = (i: RankingLeituraItem) => (i.ultimoDiaAtivo ? Date.parse(i.ultimoDiaAtivo) : -Infinity)
    const cmp = (a: RankingLeituraItem, b: RankingLeituraItem) => {
      const c = ordem === 'pontos' ? a.score - b.score || a.streakAtual - b.streakAtual
        : ordem === 'aulas' ? a.aulasConcluidas - b.aulasConcluidas || a.score - b.score
          : ordem === 'acesso' ? valAcesso(a) - valAcesso(b) || a.streakAtual - b.streakAtual
            : ordem === 'status' ? RANK_STATUS[a.status] - RANK_STATUS[b.status] || a.streakAtual - b.streakAtual
              : a.streakAtual - b.streakAtual || a.score - b.score
      return dir === 'desc' ? -c : c
    }
    const m = new Map<string, number>()
    ;[...reais].sort(cmp).forEach((x, i) => m.set(x.estudanteId, i + 1))
    return m
  }, [reais, ordem, dir])

  const niveisPresentes = useMemo(() => [...new Set(reais.map((i) => i.nivel))].sort((a, b) => a - b), [reais])
  const nFiltros = [nivelMin !== '', nivelMax !== '', pctMin !== '', pctMax !== '', seqMin !== '', seqMax !== '', acesso !== 'todos', !mostrarOcultos].filter(Boolean).length
  const limparFiltros = () => { setNivelMin(''); setNivelMax(''); setPctMin(''); setPctMax(''); setSeqMin(''); setSeqMax(''); setAcesso('todos'); setMostrarOcultos(true) }

  function ordenarPor(c: Ordem) {
    if (ordem === c) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setOrdem(c); setDir('desc') }
  }

  useEffect(() => { setPagina(1) }, [filtro, busca, nivelMin, nivelMax, pctMin, pctMax, seqMin, seqMax, acesso, ordem, dir, mostrarOcultos])
  const totalPag = Math.max(1, Math.ceil(lista.length / POR_PAG))
  const pag = Math.min(pagina, totalPag)
  const visiveis = lista.slice((pag - 1) * POR_PAG, pag * POR_PAG)

  // Pódio (top 3 por sequência→pontos entre os reais), independente de filtro/busca.
  const podio = useMemo(() => {
    const top = [...reais].sort((a, b) => b.streakAtual - a.streakAtual || b.score - a.score).slice(0, 3)
    return [top[1], top[0], top[2]] as (RankingLeituraItem | undefined)[] // 2º · 1º · 3º
  }, [reais])

  // FLIP: anima SÓ as linhas que mudaram de lugar numa ATUALIZAÇÃO ao vivo. Usa offsetTop (relativo à
  // tabela, NÃO ao viewport) → scroll/altura acima não fazem a tabela inteira animar. Em troca de
  // página/ordenação/filtro (flipArmed=false) reordena na hora, sem animação.
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  const posPrev = useRef<Map<string, number>>(new Map())
  useLayoutEffect(() => {
    const atual = new Map<string, number>()
    rowRefs.current.forEach((el, id) => atual.set(id, el.offsetTop))
    if (flipArmed.current) {
      atual.forEach((top, id) => {
        const el = rowRefs.current.get(id); if (!el) return
        const old = posPrev.current.get(id)
        if (old != null && Math.abs(old - top) > 1) {
          // Mudou de posição (subiu/desceu) → desliza do lugar antigo para o novo.
          el.style.transform = `translateY(${old - top}px)`; el.style.transition = 'transform 0s'
          requestAnimationFrame(() => { el.style.transition = 'transform 520ms cubic-bezier(.22,1,.36,1)'; el.style.transform = '' })
        } else if (old == null) {
          // Entrou nesta página (veio de outra) → aparece suave, sem empurrar a tabela toda.
          el.style.opacity = '0'; el.style.transition = 'opacity 0s'
          requestAnimationFrame(() => { el.style.transition = 'opacity 420ms ease-out'; el.style.opacity = '' })
        }
      })
      flipArmed.current = false
    }
    posPrev.current = atual
  }, [visiveis])

  // Dados do export (respeita filtro/busca/ordem atuais) — mesma matriz p/ CSV/Excel/Word/PDF.
  const nomeArqExport = `ranking_${(moduloNome ?? 'modulo').replace(/\s+/g, '-').toLowerCase()}`
  const tituloExport = `Ranking — ${moduloNome ?? 'Módulo'}`
  const dadosExport = () => {
    const head = ['#', 'Aluno', 'E-mail', 'Nível', 'Aulas', 'Total aulas', 'Progresso %', 'Sequência', 'Pontos', 'Último acesso', 'Status']
    const rows = lista.map((i) => [i.oculto ? '—' : (rankById.get(i.estudanteId) ?? ''), i.nome, i.email ?? '', i.nivel, i.aulasConcluidas, i.totalAulas, i.totalAulas > 0 ? Math.round((i.aulasConcluidas / i.totalAulas) * 100) : 0, i.streakAtual, i.score, ultAcesso(i.ultimoDiaAtivo), STATUS[i.status].rotulo])
    return { head, rows }
  }

  // Seleção + ocultar/reexibir do ranking (contas de teste).
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todosSel = visiveis.length > 0 && visiveis.every((i) => sel.has(i.estudanteId))
  const toggleTodos = () => setSel((s) => { const n = new Set(s); const all = visiveis.every((i) => n.has(i.estudanteId)); visiveis.forEach((i) => all ? n.delete(i.estudanteId) : n.add(i.estudanteId)); return n })
  const [salvandoOcultos, setSalvandoOcultos] = useState(false)
  async function ocultarSel(ocultar: boolean) {
    if (!sel.size || salvandoOcultos) return
    setSalvandoOcultos(true)
    try {
      const atual = await carregarRankingOcultos(moduloId)
      const ids = new Set<string>((atual.ok && Array.isArray((atual as any).estudantes)) ? ((atual as any).estudantes as any[]).map((e) => e.id ?? e) : itens.filter((i) => i.oculto).map((i) => i.estudanteId))
      sel.forEach((id) => (ocultar ? ids.add(id) : ids.delete(id)))
      const grupos = (atual.ok && Array.isArray((atual as any).grupos)) ? ((atual as any).grupos as any[]).map((g) => g.id ?? g) : []
      const r = await salvarRankingOcultos(moduloId, { estudantes: [...ids], grupos, total: false } as any)
      if (!r.ok) { toast.error(r.error ?? 'Falha ao salvar.'); return }
      const fresh = await obterRankingModulo(moduloId, true)
      if (fresh.ok && fresh.itens) aplicar(fresh.itens)
      setSel(new Set())
      toast.success(ocultar ? 'Ocultados do ranking.' : 'Reexibidos no ranking.')
    } catch { toast.error('Falha ao salvar.') } finally { setSalvandoOcultos(false) }
  }

  const TabFiltro = ({ v, rotulo, n, tom }: { v: 'todos' | RankingStatus; rotulo: string; n: number; tom?: string }) => {
    const ativo = filtro === v
    return (
      <button type="button" onClick={() => setFiltro(v)}
        className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', ativo ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
        {tom && <span className={cn('h-1.5 w-1.5 rounded-full', ativo ? 'bg-primary-foreground' : tom)} />}{rotulo} · {n}
      </button>
    )
  }
  const TabOrdem = ({ v, rotulo }: { v: Ordem; rotulo: string }) => (
    <button type="button" onClick={() => { setOrdem(v); setDir('desc') }}
      className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', ordem === v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
      {rotulo}
    </button>
  )
  // Cabeçalho de coluna: com `campo` vira ORDENÁVEL (clique ordena/inverte); o botão usa o MESMO
  // alinhamento da célula para o header ficar alinhado horizontalmente com os dados.
  const Th = ({ children, campo, align = 'left', className }: { children: ReactNode; campo?: Ordem; align?: 'left' | 'center' | 'right'; className?: string }) => {
    const jc = align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
    const ta = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
    if (!campo) return <th className={cn('px-3 py-2.5 font-medium', ta, className)}>{children}</th>
    const ativo = ordem === campo
    return (
      <th className={cn('px-3 py-2.5 font-medium', className)}>
        <button type="button" onClick={() => ordenarPor(campo)} className={cn('inline-flex w-full items-center gap-1 hover:text-foreground', jc, ativo && 'text-foreground')}>
          {children}
          {ativo ? (dir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
        </button>
      </th>
    )
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho + pódio — com fundo animado (aurora suave na cor da marca). */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.1] via-card to-card">
        {/* Blobs animados de fundo. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="rank-blob absolute -left-12 -top-16 h-56 w-56 rounded-full bg-primary/30 blur-3xl" style={{ animation: 'rankBlobA 11s ease-in-out infinite' }} />
          <div className="rank-blob absolute -top-10 right-0 h-48 w-48 rounded-full bg-primary/20 blur-3xl" style={{ animation: 'rankBlobB 14s ease-in-out infinite' }} />
          <div className="rank-blob absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-primary/15 blur-3xl" style={{ animation: 'rankBlobA 17s ease-in-out infinite reverse' }} />
          {/* Brilho diagonal que atravessa lentamente. */}
          <div className="rank-sheen absolute -inset-y-10 -left-1/3 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/5 to-transparent" style={{ animation: 'rankSheen 9s ease-in-out infinite' }} />
        </div>
        <style>{`
          @keyframes rankBlobA{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(24px,-18px) scale(1.18)}}
          @keyframes rankBlobB{0%,100%{transform:translate(0,0) scale(1.1)}50%{transform:translate(-26px,14px) scale(.92)}}
          @keyframes rankSheen{0%{transform:translateX(0) rotate(12deg);opacity:0}15%{opacity:1}50%{transform:translateX(380%) rotate(12deg)}60%,100%{transform:translateX(380%) rotate(12deg);opacity:0}}
          @media (prefers-reduced-motion: reduce){.rank-blob,.rank-sheen{animation:none!important}.rank-sheen{display:none}}
        `}</style>
        <div className="relative grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
          {/* Esquerda: título + pódio */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Admin{moduloNome ? ` · ${moduloNome}` : ''}</p>
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Trophy className="h-6 w-6 text-primary" /> Gestão do ranking</h2>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('relative flex h-2 w-2', aoVivo && 'text-emerald-500')}>
                <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75', aoVivo && 'animate-ping bg-emerald-500')} />
                <span className={cn('relative inline-flex h-2 w-2 rounded-full', aoVivo ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
              </span>
              <button type="button" onClick={() => setAoVivo((v) => !v)} className="hover:text-foreground">{aoVivo ? 'Atualizando ao vivo' : 'Ao vivo pausado'}</button>
            </p>
          </div>

          {/* Direita: pódio 2-1-3 */}
          {reais.length >= 3 && (
            <div className="grid grid-cols-3 items-end gap-3">
              {podio.map((it) => {
                if (!it) return <div key={Math.random()} />
                const alt = it.posicao === 1 ? 'h-24' : it.posicao === 2 ? 'h-16' : 'h-12'
                const cor = it.posicao === 1 ? '#f5c518' : it.posicao === 2 ? '#c7cdd6' : '#cd8d4e'
                return (
                  <button key={it.estudanteId} type="button" onClick={() => setDetalhe(it)} className="group flex flex-col items-center text-center">
                    <span className="relative mb-2 inline-flex rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform group-hover:scale-105"
                      style={{ '--tw-ring-color': cor } as React.CSSProperties}>
                      {it.posicao === 1 && <Crown className="absolute -top-5 left-1/2 z-10 h-5 w-5 -translate-x-1/2 text-[#f5c518]" />}
                      <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'}
                        className={cn('text-white shadow-md', it.posicao === 1 ? 'h-16 w-16 text-lg' : 'h-12 w-12 text-sm')} />
                    </span>
                    <span className="line-clamp-1 max-w-[9rem] text-sm font-semibold">{it.nome.split(' ').slice(0, 2).join(' ')}</span>
                    <span className="flex items-center gap-1.5 text-xs font-bold tabular-nums">
                      <span className="text-primary">{it.score.toLocaleString('pt-BR')} pts</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><Flame className="h-3.5 w-3.5" />{it.streakAtual}</span>
                    </span>
                    <div className={cn('mt-1.5 flex w-full items-start justify-center rounded-t-lg border border-b-0 pt-1.5 text-sm font-black', alt)}
                      style={{ background: `linear-gradient(to top, ${cor}2e, ${cor}0a)`, borderColor: `${cor}66`, color: cor }}>
                      {it.posicao}º
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tudo numa linha: ESQUERDA = status + ordenação · DIREITA = filtros + exportar.
          Sem busca solta (está dentro de Filtros) e sem Recalcular (a tabela atualiza sozinha ao vivo). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border bg-muted/40 p-1">
            <TabFiltro v="todos" rotulo="Todos" n={contagem.todos} />
            <TabFiltro v="ativo" rotulo="Ativos" n={contagem.ativo} tom={STATUS.ativo.dot} />
            <TabFiltro v="atencao" rotulo="Pendente" n={contagem.atencao} tom={STATUS.atencao.dot} />
            <TabFiltro v="risco" rotulo="Não ativo" n={contagem.risco} tom={STATUS.risco.dot} />
          </div>
          <div className="inline-flex rounded-xl border bg-muted/40 p-1">
            <TabOrdem v="pontos" rotulo="Pontos" />
            <TabOrdem v="sequencia" rotulo="Sequência" />
            <TabOrdem v="aulas" rotulo="Aulas" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-[11rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno…" className="h-9 pl-9" />
            {busca && <button type="button" onClick={() => setBusca('')} aria-label="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <RankingFiltros
            valores={{ nivelMin, nivelMax, pctMin, pctMax, seqMin, seqMax, acesso, mostrarOcultos }}
            setNivelMin={setNivelMin} setNivelMax={setNivelMax} setPctMin={setPctMin} setPctMax={setPctMax}
            setSeqMin={setSeqMin} setSeqMax={setSeqMax} setAcesso={setAcesso} setMostrarOcultos={setMostrarOcultos}
            niveis={niveisPresentes} ativos={nFiltros} onLimpar={limparFiltros} temOcultos={qtdOcultos > 0}
          />
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted">
              <Download className="h-4 w-4" /> Exportar <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { const d = dadosExport(); baixarTabelaCsv(nomeArqExport, d.head, d.rows) }}><FileText className="mr-2 h-4 w-4" /> CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={async () => { const d = dadosExport(); await baixarTabelaExcel(nomeArqExport, d.head, d.rows) }}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={async () => { const d = dadosExport(); await baixarTabelaWord(nomeArqExport, tituloExport, d.head, d.rows) }}><FileType className="mr-2 h-4 w-4" /> Word (.docx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { const d = dadosExport(); baixarTabelaPdf(tituloExport, d.head, d.rows) }}><FileDown className="mr-2 h-4 w-4" /> PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Barra de seleção em massa */}
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{sel.size} selecionado(s)</span>
          <button type="button" onClick={() => ocultarSel(true)} disabled={salvandoOcultos} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"><EyeOff className="h-3.5 w-3.5" /> Ocultar do ranking</button>
          <button type="button" onClick={() => ocultarSel(false)} disabled={salvandoOcultos} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"><Eye className="h-3.5 w-3.5" /> Reexibir</button>
          <button type="button" onClick={() => setSel(new Set())} className="ml-auto rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Limpar</button>
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={todosSel} onChange={toggleTodos} className="h-4 w-4 rounded border accent-[var(--primary)]" aria-label="Selecionar todos" /></th>
              <Th align="center" className="w-12">#</Th>
              <Th align="left">Aluno</Th>
              <Th campo="aulas" align="left" className="w-56">Progresso</Th>
              <Th campo="sequencia" align="center" className="w-24">Seq.</Th>
              <Th campo="acesso" align="center" className="w-28">Últ. acesso</Th>
              <Th campo="status" align="center" className="w-28">Status</Th>
              <Th campo="pontos" align="center" className="w-28">Pontos</Th>
              <th className="w-10 px-2 py-2.5" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-12 text-center text-sm text-muted-foreground">Nenhum aluno{busca ? ` para “${busca}”` : filtro !== 'todos' ? ' neste filtro' : ''}.</td></tr>
            ) : visiveis.map((it) => {
              const n = rankById.get(it.estudanteId) ?? 0 // posição REAL no ranking (não o índice da lista filtrada)
              const pct = it.totalAulas > 0 ? Math.round((it.aulasConcluidas / it.totalAulas) * 100) : 0
              const st = STATUS[it.status]
              const flashOn = (flash[it.estudanteId] ?? 0) > Date.now()
              return (
                <tr key={it.estudanteId}
                  ref={(el) => { if (el) rowRefs.current.set(it.estudanteId, el); else rowRefs.current.delete(it.estudanteId) }}
                  className={cn('border-b last:border-0 transition-colors', it.oculto ? 'bg-muted/20 opacity-70' : 'hover:bg-muted/30', flashOn && 'bg-primary/[0.06]')}>
                  <td className="px-3 py-2.5"><input type="checkbox" checked={sel.has(it.estudanteId)} onChange={() => toggleSel(it.estudanteId)} className="h-4 w-4 rounded border accent-[var(--primary)]" aria-label={`Selecionar ${it.nome}`} /></td>
                  <td className="px-2 py-2.5 text-center">
                    <span className={cn('inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-sm font-bold tabular-nums', n <= 3 && !it.oculto ? 'bg-primary/15 text-primary' : 'text-muted-foreground')}>{it.oculto ? '—' : n}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="relative shrink-0">
                        <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'} className="h-9 w-9 text-[11px] text-white" />
                        <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-card px-1 text-[9px] font-bold tabular-nums text-primary shadow-sm">{it.nivel}</span>
                      </span>
                      <span className="min-w-0">
                        <Link href={`/admin/estudantes/${it.estudanteId}`} className="block truncate font-medium hover:underline">{it.nome}</Link>
                        {it.email && <span className="block truncate text-xs text-muted-foreground">{it.email}</span>}
                      </span>
                      {it.oculto && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">teste</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
                      <span className="whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">{it.aulasConcluidas}/{it.totalAulas} · {pct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn('inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-semibold tabular-nums transition-colors', it.streakAtual > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground', flashOn && 'bg-amber-500/15')}>
                      <Flame className="h-3.5 w-3.5" /><CountUp value={it.streakAtual} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm text-muted-foreground">{ultAcesso(it.ultimoDiaAtivo)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', st.cls)}><span className={cn('h-1.5 w-1.5 rounded-full', st.dot)} />{st.rotulo}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <CountUp value={it.score} className={cn('text-base font-extrabold tabular-nums', flashOn ? 'text-primary' : 'text-foreground')} />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <button type="button" onClick={() => setDetalhe(it)} aria-label="Detalhes" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><MoreVertical className="h-4 w-4" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Rodapé: contagem + paginação */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm">
          <span className="text-xs text-muted-foreground">
            {lista.length > 0 ? <>Mostrando <b className="tabular-nums text-foreground">{(pag - 1) * POR_PAG + 1}–{Math.min(pag * POR_PAG, lista.length)}</b> de <b className="tabular-nums text-foreground">{lista.length}</b></> : 'Nenhum aluno'}
            {qtdOcultos > 0 && <> · <button type="button" onClick={() => setMostrarOcultos((v) => !v)} className="underline-offset-2 hover:underline">{mostrarOcultos ? `ocultar ${qtdOcultos} de teste` : `mostrar ${qtdOcultos} de teste`}</button></>}
          </span>
          {totalPag > 1 && (
            <div className="flex items-center gap-1">
              <PagBtn onClick={() => setPagina(1)} disabled={pag <= 1}><ChevronsLeft className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pag <= 1}><ChevronLeft className="h-4 w-4" /></PagBtn>
              <span className="px-2 text-xs text-muted-foreground tabular-nums">{pag}/{totalPag}</span>
              <PagBtn onClick={() => setPagina((p) => Math.min(totalPag, p + 1))} disabled={pag >= totalPag}><ChevronRight className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => setPagina(totalPag)} disabled={pag >= totalPag}><ChevronsRight className="h-4 w-4" /></PagBtn>
            </div>
          )}
        </div>
      </div>

      {detalhe && <DetalheAlunoModal moduloId={moduloId} it={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  )
}

function PagBtn({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-40">{children}</button>
}

/** Seção do pop-up de filtros (módulo-level p/ não remontar os inputs e perder o foco ao digitar). */
function SecaoFiltro({ Icon, titulo, children }: { Icon: any; titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {titulo}</span>
      {children}
    </div>
  )
}

/** Select customizado (popover estilizado via portal — não corta no overflow do modal; anima abrir E fechar). */
function SelectNivel({ label, value, onChange, niveis }: { label: string; value: number | ''; onChange: (v: number | '') => void; niveis: number[] }) {
  const [aberto, setAberto] = useState(false)
  const [render, setRender] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const abrir = () => { if (btn.current) setRect(btn.current.getBoundingClientRect()); setAberto(true) }
  useEffect(() => { if (aberto) setRender(true) }, [aberto])
  useEffect(() => {
    if (!aberto) return
    // Rolar a PÁGINA/modal fecha (o popover é fixo e descolaria do botão); rolar DENTRO da lista não.
    const onScroll = (e: Event) => { if (pop.current && pop.current.contains(e.target as Node)) return; setAberto(false) }
    const onResize = () => setAberto(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onResize); document.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey) }
  }, [aberto])
  const texto = value === '' ? 'Qualquer' : String(value)
  const opts: (number | '')[] = ['', ...niveis]

  return (
    <div className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <button ref={btn} type="button" onClick={() => (aberto ? setAberto(false) : abrir())}
        className={cn('flex h-10 w-full items-center justify-between rounded-xl border bg-background px-3 text-sm outline-none transition-colors hover:bg-muted/40', aberto ? 'ring-2 ring-primary' : 'focus-visible:ring-2 focus-visible:ring-primary')}>
        <span className={cn(value === '' && 'text-muted-foreground')}>{texto}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', aberto && 'rotate-180')} />
      </button>
      {render && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setAberto(false)} />
          <div ref={pop} onAnimationEnd={() => { if (!aberto) setRender(false) }}
            className={cn('fixed z-[111] max-h-56 origin-top overflow-auto rounded-xl border bg-popover p-1 shadow-xl ring-1 ring-foreground/10 duration-150', aberto ? 'animate-in fade-in-0 zoom-in-95' : 'animate-out fade-out-0 zoom-out-95')}
            style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}>
            {opts.map((o) => {
              const sel = String(o) === String(value)
              return (
                <button key={String(o)} type="button" onClick={() => { onChange(o === '' ? '' : Number(o)); setAberto(false) }}
                  className={cn('flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors', sel ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
                  {o === '' ? 'Qualquer' : o}{sel && <Check className="h-3.5 w-3.5" />}
                </button>
              )
            })}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

/** Faixa numérica mín–máx (digitar) — para progresso (%) e sequência (dias). */
function FaixaNum({ min, max, setMin, setMax, sufixo, max100 }: { min: number | ''; max: number | ''; setMin: (v: number | '') => void; setMax: (v: number | '') => void; sufixo?: string; max100?: boolean }) {
  const norm = (s: string) => (s === '' ? '' : Math.max(0, max100 ? Math.min(100, Math.round(Number(s) || 0)) : Math.round(Number(s) || 0)))
  const inp = 'h-10 w-full rounded-xl border bg-background px-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary'
  return (
    <div className="flex items-center gap-2">
      <input type="number" inputMode="numeric" min={0} value={min} onChange={(e) => setMin(norm(e.target.value))} placeholder="mín" className={inp} />
      <span className="shrink-0 text-xs text-muted-foreground">até</span>
      <input type="number" inputMode="numeric" min={0} value={max} onChange={(e) => setMax(norm(e.target.value))} placeholder="máx" className={inp} />
      {sufixo && <span className="shrink-0 text-xs text-muted-foreground">{sufixo}</span>}
    </div>
  )
}

/** Pop-up de filtros do ranking (mesmo padrão do banco de questões do aluno). */
function RankingFiltros({ valores, setNivelMin, setNivelMax, setPctMin, setPctMax, setSeqMin, setSeqMax, setAcesso, setMostrarOcultos, niveis, ativos, onLimpar, temOcultos }: {
  valores: { nivelMin: number | ''; nivelMax: number | ''; pctMin: number | ''; pctMax: number | ''; seqMin: number | ''; seqMax: number | ''; acesso: AcessoFiltro; mostrarOcultos: boolean }
  setNivelMin: (v: number | '') => void; setNivelMax: (v: number | '') => void
  setPctMin: (v: number | '') => void; setPctMax: (v: number | '') => void; setSeqMin: (v: number | '') => void; setSeqMax: (v: number | '') => void
  setAcesso: (v: AcessoFiltro) => void; setMostrarOcultos: (v: boolean) => void
  niveis: number[]; ativos: number; onLimpar: () => void; temOcultos: boolean
}) {
  const [aberto, setAberto] = useState(false)
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto])

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted', ativos > 0 && 'border-primary/40 bg-primary/5 text-primary')}>
        <SlidersHorizontal className="h-4 w-4" /> Filtros
        {ativos > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold tabular-nums text-primary-foreground">{ativos}</span>}
      </button>

      {aberto && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm duration-200 animate-in fade-in sm:items-center sm:p-4" onClick={() => setAberto(false)}>
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border bg-card shadow-2xl duration-200 animate-in slide-in-from-bottom-4 sm:rounded-3xl sm:zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <div className="relative shrink-0 border-b px-5 py-4">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><SlidersHorizontal className="h-5 w-5" /></span>
                <div className="flex-1"><h3 className="text-base font-bold leading-tight">Filtros do ranking</h3><p className="text-xs text-muted-foreground">Refine os alunos exibidos</p></div>
                <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <SecaoFiltro Icon={CalendarClock} titulo="Último acesso">
                <div className="flex flex-wrap gap-1.5">
                  {ACESSO_OPTS.map((o) => (
                    <button key={o.v} type="button" onClick={() => setAcesso(o.v)}
                      className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition', valores.acesso === o.v ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground')}>
                      {o.rotulo}
                    </button>
                  ))}
                </div>
              </SecaoFiltro>

              <SecaoFiltro Icon={BarChart3} titulo="Nível">
                <div className="grid grid-cols-2 gap-2.5">
                  <SelectNivel label="Mínimo" value={valores.nivelMin} onChange={setNivelMin} niveis={niveis} />
                  <SelectNivel label="Máximo" value={valores.nivelMax} onChange={setNivelMax} niveis={niveis} />
                </div>
              </SecaoFiltro>

              <SecaoFiltro Icon={Target} titulo="Progresso (%)">
                <FaixaNum min={valores.pctMin} max={valores.pctMax} setMin={setPctMin} setMax={setPctMax} sufixo="%" max100 />
              </SecaoFiltro>

              <SecaoFiltro Icon={Flame} titulo="Sequência (dias)">
                <FaixaNum min={valores.seqMin} max={valores.seqMax} setMin={setSeqMin} setMax={setSeqMax} sufixo="dias" />
              </SecaoFiltro>

              {temOcultos && (
                <SecaoFiltro Icon={FlaskConical} titulo="Mais opções">
                  <button type="button" onClick={() => setMostrarOcultos(!valores.mostrarOcultos)}
                    className={cn('flex w-full items-center gap-3 rounded-xl border p-3 text-left transition', valores.mostrarOcultos ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:border-foreground/20 hover:bg-muted/40')}>
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', valores.mostrarOcultos ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><FlaskConical className="h-4 w-4" /></span>
                    <span className="flex-1"><span className="block text-sm font-semibold leading-tight">Mostrar contas de teste</span><span className="block text-[11px] leading-tight text-muted-foreground">Exibe quem está marcado como teste (não compete)</span></span>
                    <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors', valores.mostrarOcultos ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{valores.mostrarOcultos && <Check className="h-3.5 w-3.5" />}</span>
                  </button>
                </SecaoFiltro>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3.5">
              <button type="button" onClick={onLimpar} className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><Eraser className="h-4 w-4" /> Limpar{ativos > 0 ? ` (${ativos})` : ''}</button>
              <button type="button" onClick={() => setAberto(false)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95"><Check className="h-4 w-4" /> Aplicar</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
