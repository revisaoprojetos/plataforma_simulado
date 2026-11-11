'use client'

import { useCallback, useMemo, useState } from 'react'
import { CalendarOff, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, PlayCircle } from 'lucide-react'
import { Card, Tag } from '@/components/nova/ui'
import { NovaModal } from '@/components/nova/modal'
import { CaixaCheck } from '@/components/cronograma/caixa-check'
import { NotaMeta } from '@/components/cronograma/nota-meta'
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
import type { Grade, MetaDatada, SemanaGrade } from '@/lib/cronograma/tipos'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
/** Segunda primeiro — é como a semana do cronograma começa (R1). */
const CABECALHO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
/** Quantas metas cabem antes do "+N". Acima disso a linha do mês vira uma parede de texto. */
const PILULAS_VISIVEIS = 3

/** Botões de navegação/ação no padrão Revisão (tokens; alvo de toque >= 36px). */
const BTN = 'inline-flex h-9 items-center justify-center rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] font-bold text-[var(--ink)] transition hover:bg-[var(--chip)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-[var(--surface)]'
const LINK = 'inline-flex items-center gap-1 text-sm font-bold text-[var(--brand)] hover:underline'

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
 * O cronograma como calendário mensal (kit Revisão: tokens, sem hex, mobile-first).
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
  checks,
  aoAlternarCheck,
  emissaoId,
  notas,
  aoSalvarNota,
}: {
  grade: Grade
  /** Compatibilidade com os chamadores; a cor vem dos tokens do tema. */
  paletaSlug?: string
  checks?: Record<string, string>
  aoAlternarCheck?: (meta: MetaDatada, marcar: boolean) => void
  emissaoId?: string | null
  notas?: Record<string, string>
  aoSalvarNota?: (metaId: string, texto: string) => void
}) {
  const hoje = hojeISO()
  /* A célula do mês não cabe o texto de uma meta: "PDFULL + Vid…" e "Direito Constitucion…"
     não dizem o que é. Clicar no dia abre o detalhe, onde o texto cabe inteiro — a grade fica
     para a visão geral, o diálogo para a leitura. */
  const [diaAberto, setDiaAberto] = useState<DataISO | null>(null)
  /* Mês x Semana. O mês responde "como setembro se compara com outubro"; a semana responde
     "o que eu faço esta semana", que é a pergunta do dia a dia — e é a unidade em que o
     cronograma é montado e impresso. Na semana o texto cabe inteiro, sem reticências. */
  const [modo, setModo] = useState<'mes' | 'semana'>('mes')
  // onClose estável: o NovaModal refoca o painel quando a função muda.
  const fecharDia = useCallback(() => setDiaAberto(null), [])

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
    <Card pad={0} style={{ gap: 0, overflow: 'hidden', width: '100%' }}>
      {/* ── Barra de navegação: muda com o modo, porque a unidade muda junto */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <button
          type="button"
          className={BTN}
          onClick={() => (modo === 'mes' ? setMesAtual((i) => Math.max(0, i - 1)) : setSemanaAtual((i) => Math.max(0, i - 1)))}
          disabled={modo === 'mes' ? mesAtual === 0 : semanaAtual === 0}
          aria-label={modo === 'mes' ? 'Mês anterior' : 'Semana anterior'}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <p className="min-w-40 text-sm font-extrabold" style={{ margin: 0, color: 'var(--ink)' }}>
          {modo === 'mes' ? (
            <>
              {MESES[Number(ym.slice(5, 7)) - 1]} de {ym.slice(0, 4)}
            </>
          ) : (
            <>
              Semana {grade.semanas[semanaAtual]?.numero}
              <span className="ml-2 font-medium" style={{ color: 'var(--sub)' }}>
                {grade.semanas[semanaAtual] &&
                  fmtIntervalo(grade.semanas[semanaAtual].inicio, grade.semanas[semanaAtual].fim)}
              </span>
            </>
          )}
        </p>

        <button
          type="button"
          className={BTN}
          onClick={() =>
            modo === 'mes'
              ? setMesAtual((i) => Math.min(meses.length - 1, i + 1))
              : setSemanaAtual((i) => Math.min(grade.semanas.length - 1, i + 1))
          }
          disabled={modo === 'mes' ? mesAtual === meses.length - 1 : semanaAtual === grade.semanas.length - 1}
          aria-label={modo === 'mes' ? 'Próximo mês' : 'Próxima semana'}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {temHoje && (
          <button
            type="button"
            className={BTN}
            onClick={() => {
              if (modo === 'mes') return setMesAtual(meses.indexOf(hoje.slice(0, 7)))
              const i = grade.semanas.findIndex(
                (x) => parseISO(x.inicio) <= parseISO(hoje) && parseISO(hoje) <= parseISO(x.fim),
              )
              if (i >= 0) setSemanaAtual(i)
            }}
          >
            Hoje
          </button>
        )}

        <div className="ml-auto flex shrink-0 overflow-hidden rounded-[11px] border border-[var(--line)]">
          {(
            [
              ['mes', 'Mês'],
              ['semana', 'Semana'],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setModo(chave)}
              type="button"
              aria-pressed={modo === chave}
              className="h-9 px-3.5 text-xs font-bold transition hover:opacity-90"
              style={modo === chave ? { background: 'var(--brand)', color: 'var(--btnText, var(--pn-ffffff,#FFFFFF))' } : { background: 'var(--surface)', color: 'var(--ink)' }}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <span className="text-xs" style={{ color: 'var(--sub)' }}>
          {modo === 'mes'
            ? `mês ${mesAtual + 1} de ${meses.length}`
            : `de ${grade.semanas.length}`}
        </span>
      </div>

      {modo === 'semana' ? (
        <VisaoSemanal
          semana={grade.semanas[semanaAtual]}
          hoje={hoje}
          checks={checks}
          aoAlternarCheck={aoAlternarCheck}
          emissaoId={emissaoId}
          notas={notas}
          aoSalvarNota={aoSalvarNota}
          aoAbrirDia={setDiaAberto}
        />
      ) : (
      <>

      {/* ── Cabeçalho dos dias. A 1ª coluna é a das semanas do cronograma. */}
      <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-[var(--line)] bg-[var(--surface2)] text-[11px] font-bold uppercase tracking-wide text-[var(--sub)]">
        <div className="px-2 py-1.5 text-center">Sem</div>
        {CABECALHO.map((d) => (
          <div key={d} className="px-2 py-1.5">
            {d}
          </div>
        ))}
      </div>

      <div className="divide-y divide-[var(--line)]">
        {semanas.map((linha) => {
          // Horas e tarefas da SEMANA, contando só os dias do cronograma.
          const metasSemana = linha.dias.flatMap((d) => d.metas)
          const totalSemana = somarDuracoes(metasSemana.map((m) => m.duracao))
          return (
            <div key={linha.dias[0].data} className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]">
              {/* Coluna da semana */}
              <div
                className="flex flex-col items-center justify-center gap-0.5 border-r border-[var(--line)] px-1 py-2 text-center"
                style={linha.semana !== null ? { background: 'var(--surface2)' } : undefined}
              >
                {linha.semana !== null ? (
                  <>
                    <span className="text-sm font-extrabold leading-none" style={{ color: 'var(--brand)' }}>
                      {linha.semana}
                    </span>
                    <span className="text-[9px] uppercase leading-none text-[var(--sub)]">semana</span>
                    {metasSemana.length > 0 && (
                      <span className="mt-0.5 text-[9px] leading-tight text-[var(--sub)]">
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
                  <span className="text-[10px] text-[var(--sub)] opacity-40">—</span>
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
                    className={`min-h-24 border-r border-[var(--line)] p-1.5 text-left transition last:border-r-0 ${
                      !dia.doMes ? 'bg-[var(--surface2)] opacity-55' : dia.marca === 'recesso' ? 'bg-[var(--surface2)]' : ''
                    } ${dia.metas.length ? 'cursor-pointer hover:bg-[var(--chip)]' : 'cursor-default'}`}
                  >
                    {/* Cabeçalho do dia: número à esquerda, sinalização de carga à direita. */}
                    <div className="mb-1 flex items-center gap-1">
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold"
                        style={dia.data === hoje ? { background: 'var(--brand)', color: 'var(--btnText, var(--pn-ffffff,#FFFFFF))' } : { color: dia.doMes ? 'var(--ink)' : 'var(--sub)' }}
                      >
                        {Number(dia.data.slice(8))}
                      </span>

                      {dia.marca && dia.doMes && (
                        <span
                          className="rounded px-1 py-0.5 text-[9px] font-bold uppercase leading-none"
                          style={dia.marca === 'revisao' ? { background: 'var(--gold)', color: 'var(--goldInk)' } : { background: 'var(--track)', color: 'var(--sub)' }}
                        >
                          {dia.marca === 'revisao' ? 'revisão' : 'recesso'}
                        </span>
                      )}

                      {total && (
                        <span className="ml-auto shrink-0 text-[10px] font-medium text-[var(--sub)]">
                          {fmtFaixa(total)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {visiveis.map((m) => {
                        const feita = !!checks?.[m.id]
                        const cor = m.tipoDef.cor || 'var(--brand)'
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
                        const classe = `block w-full rounded-md border-l-[3px] bg-[var(--surface)] py-1 pl-1.5 pr-1 text-left text-[10px] leading-tight text-[var(--ink)] ${
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
                        <span className="block px-1 text-[10px] font-bold text-[var(--sub)]">
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] px-3 py-2 text-[11px] text-[var(--sub)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--gold)' }} />
          semana de revisão
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarOff className="h-3 w-3" />
          recesso
        </span>
        <span>
          {modo === 'mes'
            ? 'clique num dia para ver as metas por inteiro'
            : 'clique no cabeçalho do dia para ver tudo num só lugar'}
        </span>
        <span className="ml-auto">as horas vêm da duração cadastrada em cada meta</span>
      </div>

      {/* ── Detalhe do dia: o texto que não cabe na célula cabe aqui, e a marcação acontece
             com uma caixa de verdade em vez de um clique na pílula truncada. */}
      {diaAberto !== null && (() => {
        const dia = porDia.get(diaAberto)
        if (!dia) return null
        const total = somarDuracoes(dia.metas.map((m) => m.duracao))
        const feitasNoDia = dia.metas.filter((m) => checks?.[m.id]).length
        return (
          <NovaModal
            w={560}
            onClose={fecharDia}
            titulo={
              <span className="flex flex-wrap items-center gap-2">
                {fmtBr(diaAberto)}
                {dia.semana !== null && <Tag kind="brand">Semana {dia.semana}</Tag>}
                {dia.marca === 'revisao' && <Tag kind="gray">Revisão</Tag>}
                {dia.marca === 'recesso' && <Tag kind="gray">Recesso</Tag>}
              </span>
            }
            sub={
              <>
                {dia.metas.length} tarefa{dia.metas.length > 1 ? 's' : ''}
                {total && ` · ${fmtFaixa(total)}`}
                {aoAlternarCheck && ` · ${feitasNoDia} concluída${feitasNoDia === 1 ? '' : 's'}`}
              </>
            }
          >
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {dia.metas.map((m) => {
                const feita = !!checks?.[m.id]
                const cor = m.tipoDef.cor || 'var(--brand)'
                return (
                  <div key={m.id} className="flex gap-3 rounded-xl border border-l-[3px] border-[var(--line)] bg-[var(--surface)] p-3" style={{ borderLeftColor: cor }}>
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
                        <Tag kind="brand">{m.tipoDef.nome}</Tag>
                        {m.duracao && <span className="text-xs" style={{ color: 'var(--sub)' }}>{m.duracao}</span>}
                        {feita && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--ok)' }}>
                            <Check className="h-3 w-3" strokeWidth={3} />
                            concluída
                          </span>
                        )}
                      </div>
                      {/* Sem truncar: é para isto que o diálogo existe. */}
                      <p className="mt-1 text-sm font-bold" style={{ margin: 0, marginTop: 4, color: feita ? 'var(--sub)' : 'var(--ink)', textDecoration: feita ? 'line-through' : 'none' }}>
                        {m.titulo}
                      </p>
                      {m.complemento && <p className="text-sm" style={{ margin: 0, color: 'var(--sub)' }}>{m.complemento}</p>}

                      {m.video && (
                        <a href={m.video} target="_blank" rel="noreferrer" className={`mt-2 ${LINK}`}>
                          <PlayCircle className="h-3.5 w-3.5" /> Videoaula
                        </a>
                      )}
                      {m.pdf && (
                        <a href={m.pdf} target="_blank" rel="noreferrer" className={`mt-2 ml-3 ${LINK}`}>
                          <FileText className="h-3.5 w-3.5" /> PDF
                        </a>
                      )}

                      {m.links && (m.links.urls.length > 0 || m.links.ausente) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {m.links.urls.map((u) => (
                            <a key={u.plataforma.id} href={u.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-bold text-[var(--brand)] hover:bg-[var(--chip)]">
                              {u.plataforma.nome}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                          {m.links.ausente && <span className="text-xs italic" style={{ color: 'var(--sub)' }}>{m.links.ausente}</span>}
                        </div>
                      )}

                      {emissaoId && aoSalvarNota && (
                        <div className="mt-2">
                          <NotaMeta meta={m} emissaoId={emissaoId} nota={notas?.[m.id]} aoSalvar={aoSalvarNota} />
                          {/* O texto aparece aqui, não só no diálogo: anotação que só se vê clicando é anotação que se esquece. */}
                          {notas?.[m.id] && (
                            <p className="mt-1 whitespace-pre-wrap rounded-md border-l-2 border-[var(--brand)] bg-[var(--surface2)] px-2 py-1 text-xs" style={{ color: 'var(--sub)' }}>
                              {notas[m.id]}
                            </p>
                          )}
                        </div>
                      )}

                      {m.tipo === 'simulado' && m.simulado_externo_url && (
                        <a href={m.simulado_externo_url} target="_blank" rel="noreferrer" className={`mt-2 ${LINK}`}>
                          {m.simulado_externo_nome ?? 'Abrir simulado'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </NovaModal>
        )
      })()}
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
  hoje,
  checks,
  aoAlternarCheck,
  emissaoId,
  notas,
  aoSalvarNota,
  aoAbrirDia,
}: {
  semana: SemanaGrade | undefined
  hoje: DataISO
  checks?: Record<string, string>
  aoAlternarCheck?: (meta: MetaDatada, marcar: boolean) => void
  emissaoId?: string | null
  notas?: Record<string, string>
  aoSalvarNota?: (metaId: string, texto: string) => void
  aoAbrirDia: (data: DataISO) => void
}) {
  if (!semana) return null

  if (semana.kind !== 'conteudo') {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-extrabold" style={{ margin: 0, color: 'var(--ink)' }}>
          {semana.kind === 'revisao' ? 'Semana de revisão' : 'Semana de recesso'}
        </p>
        {semana.kind === 'revisao' ? (
          <div className="mx-auto mt-3 max-w-2xl space-y-2 text-left">
            {semana.blocos.map((b) => (
              <p key={b.titulo} className="text-sm">
                {b.titulo && <strong>{b.titulo} </strong>}
                <span style={{ color: 'var(--sub)' }}>{b.texto}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm" style={{ color: 'var(--sub)' }}>
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
    <div className="grid grid-cols-1 divide-x divide-[var(--line)] min-[480px]:grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
      {dias.map((d) => {
        const total = somarDuracoes(d.metas.map((m) => m.duracao))
        return (
          <div key={d.data} className={`min-h-40 border-b border-[var(--line)] p-2 ${d.data === hoje ? 'bg-[var(--chip)]' : ''}`}>
            {/* O cabeçalho do dia abre o mesmo detalhe do modo Mês. A legenda promete "clique
                num dia" e antes só o Mês cumpria — no modo Semana o clique não fazia nada. */}
            <button
              type="button"
              onClick={() => d.metas.length && aoAbrirDia(d.data)}
              disabled={!d.metas.length}
              className="mb-2 w-full border-b border-[var(--line)] pb-1.5 text-left transition disabled:cursor-default enabled:hover:bg-[var(--surface2)]"
              title={d.metas.length ? `Ver as ${d.metas.length} metas de ${fmtBr(d.data)}` : undefined}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--sub)]" style={{ margin: 0 }}>
                {CABECALHO[offsetDesdeSegunda(dow(d.data))]}
              </p>
              <p className="flex items-baseline gap-1.5" style={{ margin: 0 }}>
                <span
                  className="text-lg font-extrabold leading-none"
                  style={{ color: d.data === hoje ? 'var(--brand)' : 'var(--ink)' }}
                >
                  {Number(d.data.slice(8))}
                </span>
                <span className="text-[10px] text-[var(--sub)]">{fmtBr(d.data).slice(3)}</span>
                {total && <span className="ml-auto text-[10px] text-[var(--sub)]">{fmtFaixa(total)}</span>}
              </p>
            </button>

            {d.metas.length === 0 ? (
              <p className="text-[11px] italic text-[var(--sub)] opacity-70" style={{ margin: 0 }}>sem metas</p>
            ) : (
              <div className="space-y-2">
                {d.metas.map((m) => {
                  const feita = !!checks?.[m.id]
                  return (
                    <div
                      key={m.id}
                      className="rounded-md border-l-[3px] bg-[var(--surface2)] p-2"
                      style={{ borderLeftColor: m.tipoDef.cor || 'var(--brand)' }}
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
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--sub)]" style={{ margin: 0 }}>
                            {m.tipoDef.nome}
                            {m.duracao && <span className="font-normal"> · {m.duracao}</span>}
                          </p>
                          {/* Sem truncar: é a vantagem desta visão sobre a do mês. */}
                          <p className="text-xs font-bold" style={{ margin: 0, color: feita ? 'var(--sub)' : 'var(--ink)', textDecoration: feita ? 'line-through' : 'none' }}>
                            {m.titulo}
                          </p>
                          {m.complemento && (
                            <p className="text-[11px]" style={{ margin: 0, color: 'var(--sub)' }}>{m.complemento}</p>
                          )}
                          {emissaoId && aoSalvarNota && (
                            <div className="mt-1.5">
                              <NotaMeta
                                meta={m}
                                emissaoId={emissaoId}
                                nota={notas?.[m.id]}
                                aoSalvar={aoSalvarNota}
                                compacto
                              />
                              {notas?.[m.id] && (
                                <p className="mt-1 line-clamp-3 whitespace-pre-wrap rounded border-l-2 border-[var(--brand)] bg-[var(--surface)] px-1.5 py-1 text-[10px] text-[var(--sub)]">
                                  {notas[m.id]}
                                </p>
                              )}
                            </div>
                          )}

                          {m.links && m.links.urls.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {m.links.urls.map((u) => (
                                <a
                                  key={u.plataforma.id}
                                  href={u.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--brand)] hover:bg-[var(--chip)]"
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
