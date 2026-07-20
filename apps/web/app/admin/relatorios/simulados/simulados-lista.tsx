'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Users, CheckCircle2, Clock } from 'lucide-react'
import { BarraBusca, FiltroSelect, Vazio } from '@/components/admin/relatorios/lista-kit'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import { iconeBanco } from '@/lib/banco-visual'
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lista.map((s) => {
            const Icon = iconeBanco(s.icone)
            const cor = s.cor ?? '#6d28d9'
            return (
            <Link key={s.id} href={`/admin/relatorios/simulados?simulado=${s.id}`}
              className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:border-primary/50 hover:shadow-md">
              {/* Capa (banner) maior: imagem do banco/logo ou degradê da cor + ícone */}
              <div className="relative h-36 w-full overflow-hidden" style={s.capa ? undefined : { background: `linear-gradient(135deg, ${cor} 0%, color-mix(in oklab, ${cor} 55%, #0f172a) 130%)` }}>
                {s.capa
                  ? <img src={s.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  : <Icon className="absolute -right-4 -top-4 h-28 w-28 text-white/10" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <span className="absolute left-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/25 backdrop-blur"><Icon className="h-4 w-4" /></span>
                <span className="absolute right-2.5 top-2.5"><TipoSimuladoBadge tipo={s.tipo} /></span>
                {/* Título sobre a capa (economiza a área de texto abaixo) */}
                <h3 className="absolute inset-x-3 bottom-2 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
              </div>
              <div className="flex flex-1 flex-col p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric icon={<Users className="h-3.5 w-3.5" />} valor={s.participantes} rotulo="alunos" />
                <Metric icon={<CheckCircle2 className="h-3.5 w-3.5" />} valor={s.finalizadas} rotulo="feitos" />
                <div className="rounded-lg bg-muted/50 py-1.5">
                  <div className="text-base font-bold tabular-nums">{nota(s.notaMedia)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">nota méd.</div>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtData(s.ultimaAtividade)}</span>
                {s.emAndamento > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{s.emAndamento} em andamento</span>}
              </div>
              </div>
            </Link>
          )})}
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
