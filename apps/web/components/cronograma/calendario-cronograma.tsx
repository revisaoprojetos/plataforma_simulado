'use client'

import { useMemo, useState } from 'react'
import { CalendarOff, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  addDias,
  domingoSeguinteOuIgual,
  hojeISO,
  parseISO,
  segundaAnteriorOuIgual,
  type DataISO,
} from '@/lib/cronograma/datas'
import { fmtFaixa, somarDuracoes } from '@/lib/cronograma/duracao'
import { acharPaleta } from '@/lib/cronograma/paletas'
import type { Grade, MetaDatada } from '@/lib/cronograma/tipos'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
/** Segunda primeiro — é como a semana do cronograma começa (R1). */
const CABECALHO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
/** Quantas metas cabem antes do "+N". Acima disso a linha do mês vira uma parede de texto. */
const PILULAS_VISIVEIS = 3

type Dia = {
  data: DataISO
  metas: MetaDatada[]
  marca: 'revisao' | 'recesso' | null
  /** Número da semana DO CRONOGRAMA (não a semana do ano). */
  semana: number | null
}

function ultimoDiaDoMes(ym: string): DataISO {
  const [ano, mes] = ym.split('-').map(Number)
  // Dia 0 do mês seguinte é o último do atual — acerta fevereiro sem tabela de dias.
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${ym}-${String(total).padStart(2, '0')}`
}

/**
 * O cronograma como calendário mensal.
 *
 * A tabela semana a semana responde "o que estudo nesta semana"; o calendário responde
 * "o que cai no dia 12" e "quanto tempo esta semana me custa". Os dois leem a MESMA grade:
 * não há segundo cálculo, e portanto não há como divergirem.
 *
 * A coluna da esquerda traz a semana DO CRONOGRAMA, não a do ano — é por ela que o aluno se
 * localiza ("estou na semana 12"), e é ela que aparece na tabela e no documento.
 */
export function CalendarioCronograma({
  grade,
  paletaSlug,
  checks,
  aoAlternarCheck,
}: {
  grade: Grade
  paletaSlug: string
  checks?: Record<string, string>
  aoAlternarCheck?: (meta: MetaDatada, marcar: boolean) => void
}) {
  const paleta = acharPaleta(paletaSlug)
  const hoje = hojeISO()
  const [expandido, setExpandido] = useState<DataISO | null>(null)

  const { porDia, meses } = useMemo(() => {
    const mapa = new Map<DataISO, Dia>()
    const garantir = (d: DataISO): Dia => {
      let x = mapa.get(d)
      if (!x) {
        x = { data: d, metas: [], marca: null, semana: null }
        mapa.set(d, x)
      }
      return x
    }

    for (const s of grade.semanas) {
      // A semana marca TODOS os seus dias, inclusive os sem meta: é assim que a coluna da
      // esquerda consegue rotular a linha mesmo quando o aluno não estuda no fim de semana.
      for (let d = s.inicio; parseISO(d) <= parseISO(s.fim); d = addDias(d, 1)) {
        const dia = garantir(d)
        dia.semana = s.numero
        if (s.kind !== 'conteudo') dia.marca = s.kind
      }
      if (s.kind === 'conteudo') for (const m of s.metas) garantir(m.data).metas.push(m)
    }

    const chaves = [...new Set([...mapa.keys()].map((d) => d.slice(0, 7)))].sort()
    return { porDia: mapa, meses: chaves }
  }, [grade])

  // Abre no mês de hoje quando o cronograma está em andamento; senão, no primeiro.
  const [mesAtual, setMesAtual] = useState(() => {
    const i = meses.indexOf(hoje.slice(0, 7))
    return i >= 0 ? i : 0
  })

  const semanas = useMemo(() => {
    const ym = meses[mesAtual]
    if (!ym) return []
    const primeiro = segundaAnteriorOuIgual(`${ym}-01`)
    const ultimo = domingoSeguinteOuIgual(ultimoDiaDoMes(ym))
    const linhas: { semana: number | null; marca: 'revisao' | 'recesso' | null; dias: (Dia & { doMes: boolean })[] }[] = []

    for (let d = primeiro; parseISO(d) <= parseISO(ultimo); d = addDias(d, 7)) {
      const dias = Array.from({ length: 7 }, (_, i) => {
        const data = addDias(d, i)
        const base = porDia.get(data) ?? { data, metas: [], marca: null, semana: null }
        return { ...base, doMes: data.slice(0, 7) === ym }
      })
      // O rótulo da linha vem de qualquer dia dela que pertença ao cronograma.
      const comSemana = dias.find((x) => x.semana !== null)
      linhas.push({ semana: comSemana?.semana ?? null, marca: comSemana?.marca ?? null, dias })
    }
    return linhas
  }, [meses, mesAtual, porDia])

  if (!meses.length) return null

  const ym = meses[mesAtual]
  const temHoje = meses.includes(hoje.slice(0, 7))

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
      {/* ── Barra do mês */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMesAtual((i) => Math.max(0, i - 1))}
          disabled={mesAtual === 0}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="min-w-44 text-sm font-semibold">
          {MESES[Number(ym.slice(5, 7)) - 1]} de {ym.slice(0, 4)}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMesAtual((i) => Math.min(meses.length - 1, i + 1))}
          disabled={mesAtual === meses.length - 1}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {temHoje && (
          <Button size="sm" variant="outline" onClick={() => setMesAtual(meses.indexOf(hoje.slice(0, 7)))}>
            Hoje
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          mês {mesAtual + 1} de {meses.length}
        </span>
      </div>

      {/* ── Cabeçalho dos dias. A 1ª coluna é a das semanas do cronograma. */}
      <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <div className="px-2 py-1.5">Sem</div>
        {CABECALHO.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="divide-y">
        {semanas.map((linha) => {
          // Horas e tarefas da SEMANA, contando só os dias do cronograma.
          const metasSemana = linha.dias.flatMap((d) => d.metas)
          const totalSemana = somarDuracoes(metasSemana.map((m) => m.duracao))
          return (
            <div key={linha.dias[0].data} className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]">
              {/* Coluna da semana */}
              <div
                className="flex flex-col items-center justify-center gap-0.5 border-r px-1 py-2 text-center"
                style={linha.semana !== null ? { background: `${paleta.celula}` } : undefined}
              >
                {linha.semana !== null ? (
                  <>
                    <span className="text-sm font-bold leading-none" style={{ color: paleta.primaria }}>
                      {linha.semana}
                    </span>
                    <span className="text-[9px] uppercase leading-none text-muted-foreground">semana</span>
                    {metasSemana.length > 0 && (
                      <span className="mt-0.5 text-[9px] leading-tight text-muted-foreground">
                        {metasSemana.length} tarefa{metasSemana.length > 1 ? 's' : ''}
                        {totalSemana && (
                          <>
                            <br />
                            {fmtFaixa(totalSemana)}
                          </>
                        )}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground/40">—</span>
                )}
              </div>

              {linha.dias.map((dia) => {
                const total = somarDuracoes(dia.metas.map((m) => m.duracao))
                const aberto = expandido === dia.data
                const visiveis = aberto ? dia.metas : dia.metas.slice(0, PILULAS_VISIVEIS)
                const ocultas = dia.metas.length - visiveis.length
                return (
                  <div
                    key={dia.data}
                    className={`min-h-28 border-r p-1.5 last:border-r-0 ${
                      !dia.doMes ? 'bg-muted/30 opacity-55' : dia.marca === 'recesso' ? 'bg-muted/40' : ''
                    }`}
                  >
                    {/* Cabeçalho do dia: número à esquerda, sinalização de carga à direita. */}
                    <div className="mb-1 flex items-center gap-1">
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                          dia.data === hoje
                            ? 'bg-primary text-primary-foreground'
                            : dia.doMes
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {Number(dia.data.slice(8))}
                      </span>

                      {dia.marca && dia.doMes && (
                        <span
                          className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none text-white"
                          style={{ background: dia.marca === 'revisao' ? paleta.revisao : '#71717a' }}
                        >
                          {dia.marca === 'revisao' ? 'revisão' : 'recesso'}
                        </span>
                      )}

                      {total && (
                        <span className="ml-auto shrink-0 text-[10px] font-medium text-muted-foreground">
                          {fmtFaixa(total)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {visiveis.map((m) => {
                        const feita = !!checks?.[m.id]
                        const cor = m.tipoDef.cor || paleta.primaria
                        const conteudo = (
                          <>
                            <span className="flex items-center gap-1">
                              {feita && <Check className="h-3 w-3 shrink-0" strokeWidth={3} />}
                              <span className="truncate font-semibold">{m.tipoDef.nome}</span>
                              {m.duracao && (
                                <span className="ml-auto shrink-0 text-[9px] font-normal opacity-60">{m.duracao}</span>
                              )}
                            </span>
                            <span className="block truncate opacity-80">{m.titulo}</span>
                          </>
                        )
                        const classe = `block w-full rounded-md border-l-[3px] bg-background/85 py-1 pl-1.5 pr-1 text-left text-[10px] leading-tight ${
                          feita ? 'opacity-50 line-through' : ''
                        }`
                        const estilo = { borderLeftColor: cor }
                        const dica = `${m.tipoDef.nome} · ${m.titulo}${m.duracao ? ` · ${m.duracao}` : ''}${
                          feita ? ' — concluída, clique para desmarcar' : aoAlternarCheck ? ' — clique para marcar' : ''
                        }`
                        return aoAlternarCheck ? (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => aoAlternarCheck(m, !feita)}
                            title={dica}
                            style={estilo}
                            className={`${classe} transition hover:bg-background hover:shadow-sm`}
                          >
                            {conteudo}
                          </button>
                        ) : (
                          <div key={m.id} className={classe} style={estilo} title={dica}>
                            {conteudo}
                          </div>
                        )
                      })}

                      {ocultas > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandido(dia.data)}
                          className="w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-muted-foreground hover:bg-muted"
                        >
                          +{ocultas} mais
                        </button>
                      )}
                      {aberto && dia.metas.length > PILULAS_VISIVEIS && (
                        <button
                          type="button"
                          onClick={() => setExpandido(null)}
                          className="w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-muted-foreground hover:bg-muted"
                        >
                          mostrar menos
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: paleta.revisao }} />
          semana de revisão
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarOff className="h-3 w-3" />
          recesso
        </span>
        <span>as horas vêm da duração cadastrada em cada meta; dias sem duração não somam</span>
      </div>
    </Card>
  )
}
