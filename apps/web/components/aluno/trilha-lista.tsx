'use client'

import Link from 'next/link'
import { Zap, Flame, Target, CalendarClock, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Trilha, TrilhaNode } from '@/components/aluno/trilha-simulados'
import { SimboloNo } from '@/components/gamificacao/simbolo-no'
import { DEFAULT_TRILHA_SIMBOLOS, coresNo, type TrilhaSimbolos, type SimboloEstado } from '@/lib/gamificacao/trilha-simbolos'

const estadoDe = (n: TrilhaNode): SimboloEstado => n.estado === 'concluido' ? 'concluido' : n.estado === 'atual' ? 'atual' : 'disponivel'

const STATUS: Record<string, { label: string; cls: string }> = {
  concluido: { label: 'Concluído', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  atual: { label: 'Em andamento', cls: 'bg-primary/15 text-primary' },
  disponivel: { label: 'Disponível', cls: 'bg-muted text-muted-foreground' },
}

function Linha({ n, simbolos }: { n: TrilhaNode; simbolos: TrilhaSimbolos }) {
  const est = estadoDe(n)
  const c = coresNo(est, simbolos[est])
  const href = n.hrefLeitura ?? n.href
  const bloqueada = !href
  const st = STATUS[est]
  return (
    <div className={cn('flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors', n.estado === 'atual' ? 'border-primary/40 bg-primary/[0.04]' : 'bg-card hover:bg-muted/40')}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 shadow-sm" style={{ background: c.fundo, borderColor: c.borda }}>
        <SimboloNo config={simbolos[est]} escala={0.6} cor={c.simbolo} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{n.titulo}</p>
        <p className="truncate text-xs text-muted-foreground">{n.statusLabel || n.quando || (bloqueada ? 'Conclua a aula anterior' : '')}</p>
      </div>
      {/* Acertos */}
      <div className="hidden w-40 shrink-0 items-center gap-2 sm:flex">
        {n.acerto != null ? (
          <>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${n.acerto}%` }} />
            </span>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{n.acerto}%</span>
          </>
        ) : <span className="flex-1 text-center text-xs text-muted-foreground/60">—</span>}
      </div>
      {/* Ação */}
      <div className="shrink-0">
        {bloqueada ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Bloqueada</span>
        ) : (
          <Link href={href!} className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition-all active:scale-[0.98]',
            n.estado === 'concluido' ? 'border bg-card text-foreground hover:bg-muted' : 'bg-primary text-primary-foreground hover:brightness-110')}>
            {n.acaoLeitura ?? n.acao}
          </Link>
        )}
      </div>
    </div>
  )
}

function Stat({ icon: Icon, valor, rotulo }: { icon: any; valor: string; rotulo: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight">{valor}</p>
        <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      </div>
    </div>
  )
}

/** Formato "Lista compacta" (1c): estatísticas no topo + tabela por aula (status, acertos, ação). */
export function TrilhaLista({ trilhas, gamAtivo, simbolos = DEFAULT_TRILHA_SIMBOLOS }: {
  trilhas: Trilha[]; gamAtivo: boolean; simbolos?: TrilhaSimbolos
}) {
  const total = trilhas.reduce((a, t) => a + t.total, 0)
  const done = trilhas.reduce((a, t) => a + t.done, 0)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const nodes = trilhas.flatMap((t) => t.nodes)
  const acertos = nodes.filter((n) => n.acerto != null)
  const media = acertos.length ? Math.round(acertos.reduce((a, n) => a + (n.acerto ?? 0), 0) / acertos.length) : null

  return (
    <div className="space-y-4">
      {/* Estatísticas no topo */}
      <div className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-4">
        <Stat icon={Target} valor={`${pct}%`} rotulo={`${done} de ${total} aulas`} />
        {gamAtivo && media != null && <Stat icon={Flame} valor={`${media}%`} rotulo="média de acertos" />}
        <Stat icon={Zap} valor={`${nodes.length}`} rotulo="aulas na trilha" />
        <Stat icon={CalendarClock} valor={`${done}/${total}`} rotulo="progresso" />
      </div>

      {/* Lista por trilha */}
      <div className="space-y-5">
        {trilhas.map((t) => (
          <div key={t.id} className="space-y-2">
            {trilhas.length > 1 && <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.nome}</p>}
            <div className="hidden items-center gap-4 px-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
              <span className="w-10" /><span className="flex-1">Aula</span><span className="w-40">Acertos</span><span className="w-[92px] text-right">Ação</span>
            </div>
            {t.nodes.map((n) => <Linha key={n.id} n={n} simbolos={simbolos} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
