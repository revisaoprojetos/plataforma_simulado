'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Users, CheckCircle2, Clock, ArrowRight, ClipboardList } from 'lucide-react'
import { BarraBusca, FiltroSelect, Vazio } from '@/components/admin/relatorios/lista-kit'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import type { ResumoSimulado } from '../_resumos'

const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

export function SimuladosLista({ itens }: { itens: ResumoSimulado[] }) {
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [ordem, setOrdem] = useState('recentes')

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    let r = itens.filter((s) => (!termo || s.titulo.toLowerCase().includes(termo)) && (tipo === 'todos' || s.tipo === tipo))
    r = [...r].sort((a, b) => {
      if (ordem === 'nota') return (b.notaMedia ?? -1) - (a.notaMedia ?? -1)
      if (ordem === 'participantes') return b.participantes - a.participantes
      return (b.criadoEm ?? '').localeCompare(a.criadoEm ?? '')
    })
    return r
  }, [itens, q, tipo, ordem])

  return (
    <div className="space-y-4">
      <BarraBusca valor={q} onValor={setQ} placeholder="Buscar simulado pelo título…">
        <FiltroSelect valor={tipo} onValor={setTipo} opcoes={[
          { valor: 'todos', rotulo: 'Todos os tipos' },
          { valor: 'objetiva', rotulo: 'Objetiva' },
          { valor: 'discursiva', rotulo: 'Discursiva' },
          { valor: 'mista', rotulo: 'Mista' },
        ]} />
        <FiltroSelect valor={ordem} onValor={setOrdem} opcoes={[
          { valor: 'recentes', rotulo: 'Mais recentes' },
          { valor: 'nota', rotulo: 'Maior nota média' },
          { valor: 'participantes', rotulo: 'Mais participantes' },
        ]} />
      </BarraBusca>

      {lista.length === 0 ? (
        <Vazio>Nenhum simulado encontrado.</Vazio>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((s) => (
            <Link key={s.id} href={`/admin/relatorios/simulados?simulado=${s.id}`}
              className="group relative overflow-hidden rounded-2xl border bg-card p-4 transition hover:border-primary/50 hover:shadow-md">
              {/* fita superior estilo folha de prova */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/70 to-primary/20" />
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-4.5 w-4.5" /></span>
                  <TipoSimuladoBadge tipo={s.tipo} />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </div>
              <h3 className="mb-3 line-clamp-2 min-h-[2.5rem] font-semibold leading-snug">{s.titulo}</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric icon={<Users className="h-3.5 w-3.5" />} valor={s.participantes} rotulo="alunos" />
                <Metric icon={<CheckCircle2 className="h-3.5 w-3.5" />} valor={s.finalizadas} rotulo="feitos" />
                <div className="rounded-lg bg-muted/50 py-1.5">
                  <div className="text-base font-bold tabular-nums">{nota(s.notaMedia)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">nota méd.</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtData(s.ultimaAtividade)}</span>
                {s.emAndamento > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{s.emAndamento} em andamento</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Metric({ icon, valor, rotulo }: { icon: React.ReactNode; valor: number; rotulo: string }) {
  return (
    <div className="rounded-lg bg-muted/50 py-1.5">
      <div className="flex items-center justify-center gap-1 text-base font-bold tabular-nums">{valor}</div>
      <div className="flex items-center justify-center gap-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{icon}{rotulo}</div>
    </div>
  )
}
