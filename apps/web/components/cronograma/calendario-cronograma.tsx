'use client'

import { useMemo, useState } from 'react'
import { CalendarOff, Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CaixaCheck } from '@/components/cronograma/caixa-check'
import {
  addDias,
  domingoSeguinteOuIgual,
  dow,
  hojeISO,
  offsetDesdeSegunda,
  parseISO,
  segundaAnteriorOuIgual,
  type DataISO,
} from '@/lib/cronograma/datas'
import { fmtBr, fmtIntervalo } from '@/lib/cronograma/datas'
import { fmtFaixa, somarDuracoes } from '@/lib/cronograma/duracao'
import { acharPaleta } from '@/lib/cronograma/paletas'
import type { Grade, MetaDatada, SemanaGrade } from '@/lib/cronograma/tipos'

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
  /* A célula do mês não cabe o texto de uma meta: "PDFULL + Vid…" e "Direito Constitucion…"
     não dizem o que é. Clicar no dia abre o detalhe, onde o texto cabe inteiro — a grade fica
     para a visão geral, o diálogo para a leitura. */
  const [diaAberto, setDiaAberto] = useState<DataISO | null>(null)
  /* Mês x Semana. O mês responde "como setembro se compara com outubro"; a semana responde
     "o que eu faço esta semana", que é a pergunta do dia a dia — e é a unidade em que o
     cronograma é montado e impresso. Na semana o texto cabe inteiro, sem reticências. */
  const [modo, setModo] = useState<'mes' | 'semana'>('mes')

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

  // Mesma ideia na visão semanal: abre na semana que contém hoje, se houver.
  const [semanaAtual, setSemanaAtual] = useState(() => {
    const i = grade.semanas.findIndex((x) => parseISO(x.inicio) <= parseISO(hoje) && parseISO(hoje) <= parseISO(x.fim))
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
      {/* ── Barra de navegação: muda com o modo, porque a unidade muda junto */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => (modo === 'mes' ? setMesAtual((i) => Math.max(0, i - 1)) : setSemanaAtual((i) => Math.max(0, i - 1)))}
          disabled={modo === 'mes' ? mesAtual === 0 : semanaAtual === 0}
          aria-label={modo === 'mes' ? 'Mês anterior' : 'Semana anterior'}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <p className="min-w-52 text-sm font-semibold">
          {modo === 'mes' ? (
            <>
              {MESES[Number(ym.slice(5, 7)) - 1]} de {ym.slice(0, 4)}
            </>
          ) : (
            <>
              Semana {grade.semanas[semanaAtual]?.numero}
              <span className="ml-2 font-normal text-muted-foreground">
                {grade.semanas[semanaAtual] &&
                  fmtIntervalo(grade.semanas[semanaAtual].inicio, grade.semanas[semanaAtual].fim)}
              </span>
            </>
          )}
        </p>

        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            modo === 'mes'
              ? setMesAtual((i) => Math.min(meses.length - 1, i + 1))
              : setSemanaAtual((i) => Math.min(grade.semanas.length - 1, i + 1))
          }
          disabled={modo === 'mes' ? mesAtual === meses.length - 1 : semanaAtual === grade.semanas.length - 1}
          aria-label={modo === 'mes' ? 'Próximo mês' : 'Próxima semana'}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {temHoje && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (modo === 'mes') return setMesAtual(meses.indexOf(hoje.slice(0, 7)))
              const i = grade.semanas.findIndex(
                (x) => parseISO(x.inicio) <= parseISO(hoje) && parseISO(hoje) <= parseISO(x.fim),
              )
              if (i >= 0) setSemanaAtual(i)
            }}
          >
            Hoje
          </Button>
        )}

        <div className="ml-auto flex shrink-0 overflow-hidden rounded-lg border">
          {(
            [
              ['mes', 'Mês'],
              ['semana', 'Semana'],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setModo(chave)}
              className={`h-8 px-3 text-xs transition ${
                modo === chave ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <span className="text-xs text-muted-foreground">
          {modo === 'mes'
            ? `mês ${mesAtual + 1} de ${meses.length}`
            : `de ${grade.semanas.length}`}
        </span>
      </div>

      {modo === 'semana' ? (
        <VisaoSemanal
          semana={grade.semanas[semanaAtual]}
          paleta={paleta}
          hoje={hoje}
          checks={checks}
          aoAlternarCheck={aoAlternarCheck}
        />
      ) : (
      <>

      {/* ── Cabeçalho dos dias. A 1ª coluna é a das semanas do cronograma. */}
      <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <div className="px-2 py-1.5 text-center">Sem</div>
        {CABECALHO.map((d) => (
          <div key={d} className="px-2 py-1.5">
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
                const visiveis = dia.metas.slice(0, PILULAS_VISIVEIS)
                const ocultas = dia.metas.length - visiveis.length
                return (
                  <button
                    key={dia.data}
                    type="button"
                    onClick={() => dia.metas.length && setDiaAberto(dia.data)}
                    disabled={!dia.metas.length}
                    aria-label={`Ver as ${dia.metas.length} metas de ${fmtBr(dia.data)}`}
                    className={`min-h-24 border-r p-1.5 text-left transition last:border-r-0 ${
                      !dia.doMes ? 'bg-muted/30 opacity-55' : dia.marca === 'recesso' ? 'bg-muted/40' : ''
                    } ${dia.metas.length ? 'cursor-pointer hover:bg-primary/5' : 'cursor-default'}`}
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
                        const dica = `${m.tipoDef.nome} · ${m.titulo}${m.duracao ? ` · ${m.duracao}` : ''}${feita ? ' — concluída' : ''}`
                        return (
                          <div key={m.id} className={classe} style={estilo} title={dica}>
                            {conteudo}
                          </div>
                        )
                      })}

                      {ocultas > 0 && (
                        <span className="block px-1 text-[10px] font-medium text-muted-foreground">
                          +{ocultas} mais
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: paleta.revisao }} />
          semana de revisão
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarOff className="h-3 w-3" />
          recesso
        </span>
        <span>clique num dia para ver as metas por inteiro</span>
        <span className="ml-auto">as horas vêm da duração cadastrada em cada meta</span>
      </div>

      {/* ── Detalhe do dia: o texto que não cabe na célula cabe aqui, e a marcação acontece
             com uma caixa de verdade em vez de um clique na pílula truncada. */}
      <Dialog open={diaAberto !== null} onOpenChange={(v) => !v && setDiaAberto(null)}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
          {(() => {
            const dia = diaAberto ? porDia.get(diaAberto) : null
            if (!diaAberto || !dia) return null
            const total = somarDuracoes(dia.metas.map((m) => m.duracao))
            const feitasNoDia = dia.metas.filter((m) => checks?.[m.id]).length
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    {fmtBr(diaAberto)}
                    {dia.semana !== null && <Badge variant="outline">Semana {dia.semana}</Badge>}
                    {dia.marca === 'revisao' && <Badge variant="secondary">Revisão</Badge>}
                    {dia.marca === 'recesso' && <Badge variant="secondary">Recesso</Badge>}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {dia.metas.length} tarefa{dia.metas.length > 1 ? 's' : ''}
                    {total && ` · ${fmtFaixa(total)}`}
                    {aoAlternarCheck && ` · ${feitasNoDia} concluída${feitasNoDia === 1 ? '' : 's'}`}
                  </p>
                </DialogHeader>

                <div className="space-y-2">
                  {dia.metas.map((m) => {
                    const feita = !!checks?.[m.id]
                    const cor = m.tipoDef.cor || paleta.primaria
                    return (
                      <div
                        key={m.id}
                        className="flex gap-3 rounded-lg border border-l-[3px] p-3"
                        style={{ borderLeftColor: cor }}
                      >
                        {aoAlternarCheck && (
                          <CaixaCheck
                            marcada={feita}
                            aoTrocar={(marcar) => aoAlternarCheck(m, marcar)}
                            rotulo={`Marcar "${m.titulo}" como concluída`}
                            className="mt-0.5"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{m.tipoDef.nome}</Badge>
                            {m.duracao && <span className="text-xs text-muted-foreground">{m.duracao}</span>}
                            {feita && (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                <Check className="h-3 w-3" strokeWidth={3} />
                                concluída
                              </span>
                            )}
                          </div>
                          {/* Sem truncar: é para isto que o diálogo existe. */}
                          <p className={`mt-1 text-sm font-medium ${feita ? 'text-muted-foreground line-through' : ''}`}>
                            {m.titulo}
                          </p>
                          {m.complemento && <p className="text-sm text-muted-foreground">{m.complemento}</p>}

                          {m.links && (m.links.urls.length > 0 || m.links.ausente) && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {m.links.urls.map((u) => (
                                <a
                                  key={u.plataforma.id}
                                  href={u.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-primary hover:bg-muted"
                                >
                                  {u.plataforma.nome}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ))}
                              {m.links.ausente && (
                                <span className="text-xs italic text-muted-foreground">{m.links.ausente}</span>
                              )}
                            </div>
                          )}

                          {m.tipo === 'simulado' && m.simulado_externo_url && (
                            <a
                              href={m.simulado_externo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              {m.simulado_externo_nome ?? 'Abrir simulado'}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/**
 * A semana aberta: sete colunas, uma por dia, com o texto INTEIRO de cada meta.
 *
 * É a mesma leitura da folha impressa — dias como colunas — mas listando as metas do dia em vez
 * de cruzar tipo x dia: na tela a coluna é estreita, e uma matriz com uma linha por tipo criaria
 * muita célula vazia. O tipo vira etiqueta em cada meta, que dá a mesma informação sem o vazio.
 */
function VisaoSemanal({
  semana,
  paleta,
  hoje,
  checks,
  aoAlternarCheck,
}: {
  semana: SemanaGrade | undefined
  paleta: ReturnType<typeof acharPaleta>
  hoje: DataISO
  checks?: Record<string, string>
  aoAlternarCheck?: (meta: MetaDatada, marcar: boolean) => void
}) {
  if (!semana) return null

  if (semana.kind !== 'conteudo') {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-medium" style={{ color: paleta.revisao }}>
          {semana.kind === 'revisao' ? 'Semana de revisão' : 'Semana de recesso'}
        </p>
        {semana.kind === 'revisao' ? (
          <div className="mx-auto mt-3 max-w-2xl space-y-2 text-left">
            {semana.blocos.map((b) => (
              <p key={b.titulo} className="text-sm">
                {b.titulo && <strong>{b.titulo} </strong>}
                <span className="text-muted-foreground">{b.texto}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Sem metas programadas. O cronograma é retomado na próxima segunda-feira.
          </p>
        )}
      </div>
    )
  }

  const dias = Array.from({ length: 7 }, (_, i) => {
    const data = addDias(semana.inicio, i)
    return { data, metas: semana.metas.filter((m) => m.data === data) }
  })

  return (
    <div className="grid grid-cols-2 divide-x sm:grid-cols-4 lg:grid-cols-7">
      {dias.map((d) => {
        const total = somarDuracoes(d.metas.map((m) => m.duracao))
        return (
          <div key={d.data} className={`min-h-40 border-b p-2 ${d.data === hoje ? 'bg-primary/5' : ''}`}>
            <div className="mb-2 border-b pb-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {CABECALHO[offsetDesdeSegunda(dow(d.data))]}
              </p>
              <p className="flex items-baseline gap-1.5">
                <span
                  className={`text-lg font-bold leading-none ${d.data === hoje ? 'text-primary' : ''}`}
                >
                  {Number(d.data.slice(8))}
                </span>
                <span className="text-[10px] text-muted-foreground">{fmtBr(d.data).slice(3)}</span>
                {total && <span className="ml-auto text-[10px] text-muted-foreground">{fmtFaixa(total)}</span>}
              </p>
            </div>

            {d.metas.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground/60">sem metas</p>
            ) : (
              <div className="space-y-2">
                {d.metas.map((m) => {
                  const feita = !!checks?.[m.id]
                  return (
                    <div
                      key={m.id}
                      className="rounded-md border-l-[3px] bg-muted/30 p-2"
                      style={{ borderLeftColor: m.tipoDef.cor || paleta.primaria }}
                    >
                      <div className="flex items-start gap-2">
                        {aoAlternarCheck && (
                          <CaixaCheck
                            marcada={feita}
                            aoTrocar={(marcar) => aoAlternarCheck(m, marcar)}
                            rotulo={`Marcar "${m.titulo}" como concluída`}
                            className="mt-0.5"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {m.tipoDef.nome}
                            {m.duracao && <span className="font-normal"> · {m.duracao}</span>}
                          </p>
                          {/* Sem truncar: é a vantagem desta visão sobre a do mês. */}
                          <p className={`text-xs font-medium ${feita ? 'text-muted-foreground line-through' : ''}`}>
                            {m.titulo}
                          </p>
                          {m.complemento && (
                            <p className="text-[11px] text-muted-foreground">{m.complemento}</p>
                          )}
                          {m.links && m.links.urls.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {m.links.urls.map((u) => (
                                <a
                                  key={u.plataforma.id}
                                  href={u.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] text-primary hover:bg-muted"
                                >
                                  {u.plataforma.nome}
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
