'use client'

/**
 * Aba "Conteúdo" — montar/editar as metas de um cronograma à mão, numa área própria.
 *
 * Antes, editar o conteúdo só acontecia entrando no card do catálogo (a rota `[id]`), o que
 * fazia a montagem manual parecer que não existia — "só dava por importação". Aqui a edição
 * vira um lugar: escolhe-se o cronograma e o MESMO editor de metas abre logo abaixo (reuso
 * literal do `MetasClient`, sem duplicar nada). Trocar de cronograma é um clique.
 */

import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Layers, Loader2, Pencil, Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SimuladoOpcao } from '@/components/cronograma/simulado-picker'
import type { MetaFonte, TipoMetaDef } from '@/lib/cronograma/tipos'
import { MetasClient } from '../[id]/metas-client'
import {
  carregarDetalhe,
  pacotesDoCronograma,
  type CronogramaDetalhe,
  type Diagnostico,
  type PacotesDoCronograma,
} from '../[id]/metas-actions'
import type { CronogramaLista } from '../actions'

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

type Detalhe = {
  cronograma: CronogramaDetalhe
  metas: MetaFonte[]
  tipos: TipoMetaDef[]
  disciplinas: { id: string; nome: string }[]
  simulados: SimuladoOpcao[]
  pacotes: PacotesDoCronograma
  diagnostico: Diagnostico
}

export function ConteudoClient({ cronogramas }: { cronogramas: CronogramaLista[] }) {
  const [busca, setBusca] = useState('')
  const [carregandoId, setCarregandoId] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)

  const filtrados = useMemo(() => {
    const t = normalizar(busca.trim())
    if (!t) return cronogramas
    return cronogramas.filter((c) => normalizar(c.nome).includes(t) || normalizar(c.categoria_nome ?? '').includes(t))
  }, [cronogramas, busca])

  async function abrir(c: CronogramaLista) {
    if (carregandoId) return
    setCarregandoId(c.id)
    const [r, p] = await Promise.all([carregarDetalhe(c.id), pacotesDoCronograma(c.id)])
    setCarregandoId(null)
    if (!r.ok || !r.cronograma) {
      toast.error(r.error ?? 'Não foi possível abrir o cronograma.')
      return
    }
    setDetalhe({
      cronograma: r.cronograma,
      metas: r.metas ?? [],
      tipos: r.tipos ?? [],
      disciplinas: r.disciplinas ?? [],
      simulados: (r.simulados ?? []) as SimuladoOpcao[],
      pacotes: p.dados ?? { dentro: [], fora: [] },
      diagnostico: r.diagnostico!,
    })
  }

  // Um cronograma escolhido → o editor de metas completo abre aqui mesmo.
  if (detalhe) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setDetalhe(null)} className="-ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Escolher outro cronograma
        </Button>
        <MetasClient
          key={detalhe.cronograma.id}
          cronograma={detalhe.cronograma}
          metasIniciais={detalhe.metas}
          tipos={detalhe.tipos}
          disciplinas={detalhe.disciplinas}
          simulados={detalhe.simulados}
          pacotes={detalhe.pacotes}
          diagnostico={detalhe.diagnostico}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cronograma pelo nome…"
          className="pl-8"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">
          {busca ? 'Nenhum cronograma com esse nome.' : 'Nenhum cronograma cadastrado ainda.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((c) => {
            const carregando = carregandoId === c.id
            const semMetas = c.metas === 0
            return (
              <button
                key={c.id}
                onClick={() => abrir(c)}
                disabled={!!carregandoId}
                className="group relative overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
              >
                <span className={cn('absolute inset-y-0 left-0 w-1', c.status === 'liberado' ? 'bg-emerald-500' : 'bg-primary')} />
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                  </span>
                  <Badge variant={c.status === 'liberado' ? 'default' : 'secondary'} className="shrink-0">
                    {c.status === 'liberado' ? 'Liberado' : 'Rascunho'}
                  </Badge>
                </div>
                <p className="mt-3 line-clamp-2 font-semibold leading-snug">{c.nome}</p>
                {c.categoria_nome && <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.categoria_nome}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Badge variant="outline" className="gap-1">
                    <Layers className="h-3 w-3" />
                    {c.total_semanas} sem
                  </Badge>
                  <Badge variant="outline" className={cn('gap-1', semMetas && 'border-amber-400 text-amber-700 dark:text-amber-300')}>
                    {c.metas.toLocaleString('pt-BR')} metas
                  </Badge>
                  {c.pacotes === 0 && (
                    <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                      sem pacote
                    </Badge>
                  )}
                </div>
                <p className="mt-3 flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition group-hover:opacity-100">
                  <Pencil className="h-3 w-3" /> Montar / editar
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
