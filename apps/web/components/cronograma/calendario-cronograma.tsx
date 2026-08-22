'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { addDias, dow, hojeISO, offsetDesdeSegunda, parseISO, type DataISO } from '@/lib/cronograma/datas'
import { acharPaleta } from '@/lib/cronograma/paletas'
import type { Grade, MetaDatada } from '@/lib/cronograma/tipos'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
/** Segunda primeiro — é como a semana do cronograma começa (R1). */
const CABECALHO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

type DiaDoMes = { data: DataISO; metas: MetaDatada[]; marca: 'revisao' | 'recesso' | null }

/** Todos os dias de 'YYYY-MM', em data civil. */
function diasDoMes(ym: string): DataISO[] {
  const [ano, mes] = ym.split('-').map(Number)
  // Dia 0 do mês SEGUINTE é o último do atual — evita a tabela de dias por mês e acerta fevereiro.
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return Array.from({ length: total }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)
}

/**
 * O cronograma visto como calendário.
 *
 * A tabela semana a semana responde "o que estudo nesta semana"; o calendário responde
 * "o que cai no dia 12" e "como setembro se compara com outubro" — que é a pergunta de
 * quem está organizando a vida em volta do plano. Os dois leem a MESMA grade: não há
 * segundo cálculo, e portanto não há como divergirem.
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

  const meses = useMemo(() => {
    const porDia = new Map<DataISO, DiaDoMes>()
    const garantir = (d: DataISO): DiaDoMes => {
      let x = porDia.get(d)
      if (!x) {
        x = { data: d, metas: [], marca: null }
        porDia.set(d, x)
      }
      return x
    }

    for (const s of grade.semanas) {
      if (s.kind === 'conteudo') {
        for (const m of s.metas) garantir(m.data).metas.push(m)
        continue
      }
      // Revisão e recesso não têm meta datada: marcam a SEMANA inteira, dia a dia.
      for (let d = s.inicio; parseISO(d) <= parseISO(s.fim); d = addDias(d, 1)) {
        garantir(d).marca = s.kind
      }
    }

    const chaves = [...new Set([...porDia.keys()].map((d) => d.slice(0, 7)))].sort()
    return chaves.map((ym) => ({
      ym,
      rotulo: `${MESES[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`,
      dias: diasDoMes(ym).map((d) => porDia.get(d) ?? { data: d, metas: [], marca: null }),
    }))
  }, [grade])

  if (!meses.length) return null

  return (
    <div className="space-y-4">
      {meses.map((mes) => {
        // Casas vazias antes do dia 1, para ele cair na coluna certa da semana.
        const vazias = offsetDesdeSegunda(dow(mes.dias[0].data))
        return (
          <Card key={mes.ym} className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
            <div
              className="px-4 py-2 text-sm font-semibold text-white"
              style={{ background: paleta.primaria }}
            >
              {mes.rotulo}
            </div>

            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {CABECALHO.map((d) => (
                <div key={d} className="py-1.5">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {Array.from({ length: vazias }, (_, i) => (
                <div key={`vazio-${i}`} className="min-h-24 border-b border-r bg-muted/20" />
              ))}

              {mes.dias.map((dia) => {
                const fundo =
                  dia.marca === 'revisao'
                    ? paleta.revisao
                    : dia.marca === 'recesso'
                      ? undefined
                      : dia.metas.length
                        ? paleta.celula
                        : undefined
                return (
                  <div
                    key={dia.data}
                    className={`min-h-24 border-b border-r p-1.5 ${dia.marca === 'recesso' ? 'bg-muted/40' : ''}`}
                    style={fundo && dia.marca !== 'revisao' ? { background: fundo } : undefined}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                          dia.data === hoje ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {Number(dia.data.slice(8))}
                      </span>
                      {dia.marca && (
                        <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                          {dia.marca === 'revisao' ? 'revisão' : 'recesso'}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {dia.metas.map((m) => {
                        const feita = !!checks?.[m.id]
                        const conteudo = (
                          <>
                            <span className="font-semibold">{m.tipoDef.nome}</span>
                            <span className="block truncate opacity-80">{m.titulo}</span>
                          </>
                        )
                        const classe = `block w-full rounded-md border bg-background/80 px-1.5 py-1 text-left text-[10px] leading-tight ${
                          feita ? 'opacity-55 line-through' : ''
                        }`
                        return aoAlternarCheck ? (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => aoAlternarCheck(m, !feita)}
                            title={`${m.tipoDef.nome} · ${m.titulo}${feita ? ' (concluída — clique para desmarcar)' : ' (clique para marcar como concluída)'}`}
                            className={`${classe} transition hover:bg-background`}
                          >
                            {conteudo}
                          </button>
                        ) : (
                          <div key={m.id} className={classe} title={`${m.tipoDef.nome} · ${m.titulo}`}>
                            {conteudo}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
