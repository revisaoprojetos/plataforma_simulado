'use client'

/**
 * A grade do cronograma na tela — usada tanto ao gerar quanto ao reabrir uma emissão
 * salva, para as duas mostrarem exatamente a mesma coisa.
 *
 * Escrita no kit Revisão (nova/ui + tokens --brand/--surface/--line/--ink/--sub). Sem hex e sem
 * mapa de tokens shadcn: no PAINEL ADMIN (prévia) use variante="admin", que aponta os tokens Revisão
 * para os do admin dentro do próprio componente.
 *
 * Os filtros de semana e tipo agem AO VIVO sobre a grade já calculada.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, Eye, EyeOff, ExternalLink, FileText, ListChecks, PlayCircle } from 'lucide-react'
import { CaixaCheck } from '@/components/cronograma/caixa-check'
import { NotaMeta } from '@/components/cronograma/nota-meta'
import { ESCOPO_ADMIN, type VarianteCronograma } from '@/components/cronograma/escopo-admin'
import { Card, Tag } from '@/components/nova/ui'
import { fmtBr, fmtIntervalo } from '@/lib/cronograma/datas'
import type { Grade, MetaDatada } from '@/lib/cronograma/tipos'

/** Classes de controles (selects/botões) no padrão Revisão. */
const CTRL = 'h-9 rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] font-bold text-[var(--ink)] outline-none focus-visible:border-[var(--brand)]'
const CHIP_LINK = 'inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs font-bold text-[var(--brand)] hover:bg-[var(--chip)]'

/**
 * O carimbo do check é um INSTANTE (timestamptz), não uma data civil do cronograma — por isso
 * aqui vale o fuso do navegador, ao contrário das datas das metas, que usam UTC de propósito.
 */
function fmtDataHora(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * Os números do topo. Aceita `null` de propósito: na tela do aluno eles ficam visíveis
 * ANTES de gerar, com travessão no lugar do valor.
 */
export function ResumoGrade({
  grade,
  ocultos,
  aoAlternar,
  ocultarDatas,
  variante = 'aluno',
}: {
  grade: Grade | null
  /** Chaves escondidas pelo aluno. Ausente = a tela não oferece esconder. */
  ocultos?: string[]
  aoAlternar?: (chave: string) => void
  /** Plano "só semanas": esconde a data de conclusão (sem calendário). */
  ocultarDatas?: boolean
  variante?: VarianteCronograma
}) {
  const numeros: [string, string, string | number][] = [
    ['semanas', 'Semanas', grade?.resumo.totalSemanas ?? '—'],
    ['dias', 'Dias por semana', grade?.resumo.diasPorSemana ?? '—'],
    ['atividades', 'Atividades', grade?.resumo.atividades ?? '—'],
    ...(ocultarDatas ? [] : [['conclusao', 'Conclusão', grade?.resumo.conclusao ? fmtBr(grade.resumo.conclusao) : '—'] as [string, string, string | number]]),
  ]
  const escondidos = new Set(ocultos ?? [])
  const visiveis = numeros.filter(([chave]) => !escondidos.has(chave))
  const podeEsconder = !!aoAlternar

  return (
    <div className="space-y-2" style={variante === 'admin' ? ESCOPO_ADMIN : undefined}>
      {visiveis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {visiveis.map(([chave, rotulo, valor]) => (
            /* `group` no cartão: o botão de esconder só aparece no hover (e no foco). */
            <div key={chave} className="group/num relative">
              <Card pad={16} style={{ gap: 2 }}>
                {podeEsconder && (
                  <button
                    onClick={() => aoAlternar(chave)}
                    title={`Esconder ${rotulo.toLowerCase()}`}
                    aria-label={`Esconder ${rotulo}`}
                    className="absolute right-2 top-2 rounded p-1.5 text-[var(--sub)] opacity-60 transition hover:bg-[var(--surface2)] hover:text-[var(--ink)] focus-visible:opacity-100 sm:opacity-0 sm:group-hover/num:opacity-100"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                )}
                <p className="text-3xl font-extrabold tabular-nums" style={{ margin: 0, color: grade ? 'var(--ink)' : 'var(--sub)' }}>{valor}</p>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ margin: 0, color: 'var(--sub)' }}>{rotulo}</p>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* O que está escondido continua ao alcance: esconder sem caminho de volta vira perda. */}
      {podeEsconder && escondidos.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--sub)' }}>
          <Eye className="h-3.5 w-3.5" />
          <span>escondidos:</span>
          {numeros
            .filter(([chave]) => escondidos.has(chave))
            .map(([chave, rotulo]) => (
              <button
                key={chave}
                onClick={() => aoAlternar(chave)}
                className="rounded-full border border-[var(--line)] px-2.5 py-1 font-bold transition hover:bg-[var(--surface2)] hover:text-[var(--ink)]"
                title={`Mostrar ${rotulo.toLowerCase()} de novo`}
              >
                {rotulo}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

/** Semanas montadas por vez, e a cada "mostrar mais". */
const PASSO_SEMANAS = 6

export function GradeCronograma({
  grade,
  titulo,
  checks,
  aoAlternarCheck,
  emissaoId,
  notas,
  aoSalvarNota,
  colapsadas,
  aoAlternarColapso,
  aoDefinirColapsadas,
  ocultarContagem,
  aoAlternarContagem,
  ocultarDatas,
  resolverHref,
  variante = 'aluno',
}: {
  grade: Grade
  /** Mantido por compatibilidade com os chamadores; a cor vem dos tokens do tema, não da paleta. */
  paletaSlug?: string
  titulo?: string
  variante?: VarianteCronograma
  /** Plano "só semanas": esconde as datas (intervalo da semana e data de cada meta). */
  ocultarDatas?: boolean
  /** metaId → instante em que o aluno marcou. Ausente = a tela não tem marcação. */
  checks?: Record<string, string>
  aoAlternarCheck?: (meta: MetaDatada, marcar: boolean) => void
  /** Sem emissão salva não há onde gravar anotação. */
  emissaoId?: string | null
  notas?: Record<string, string>
  aoSalvarNota?: (metaId: string, texto: string) => void
  /** Semanas fechadas pelo aluno — vem do banco e volta para lá ao mudar. */
  colapsadas?: number[]
  aoAlternarColapso?: (semana: number) => void
  aoDefinirColapsadas?: (semanas: number[]) => void
  ocultarContagem?: boolean
  aoAlternarContagem?: () => void
  /** Quando presente, o chip "N questões" vira link "Resolver" para esta URL (área do aluno). */
  resolverHref?: (meta: MetaDatada) => string | null | undefined
}) {
  const comCheck = !!aoAlternarCheck
  /* Quantas semanas o navegador monta de uma vez. A grade de "12 Matérias (2 horas)" tem 634 metas
     em 77 semanas; renderizar tudo produzia 1.955 KB de HTML e 10,6 s de espera (MEDIDO). */
  const [visiveis, setVisiveis] = useState(PASSO_SEMANAS)
  const [filtroSemana, setFiltroSemana] = useState('todas')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  const semanas = useMemo(() => {
    let xs = grade.semanas
    if (filtroSemana !== 'todas') xs = xs.filter((s) => String(s.numero) === filtroSemana)
    if (filtroTipo === 'todos') return xs
    return xs
      .map((s) => (s.kind === 'conteudo' ? { ...s, metas: s.metas.filter((m) => m.tipo === filtroTipo) } : s))
      .filter((s) => s.kind !== 'conteudo' || s.metas.length > 0)
  }, [grade, filtroSemana, filtroTipo])

  // Só oferece tipos que existem nesta grade — um filtro que nunca acha nada é ruído.
  const tiposPresentes = useMemo(() => {
    const vistos = new Map<string, { slug: string; nome: string; ordem: number }>()
    for (const sem of grade.semanas) {
      if (sem.kind !== 'conteudo') continue
      for (const m of sem.metas) {
        if (!vistos.has(m.tipo)) vistos.set(m.tipo, { slug: m.tipo, nome: m.tipoDef.nome, ordem: m.tipoDef.ordem })
      }
    }
    return [...vistos.values()].sort((a, b) => a.ordem - b.ordem)
  }, [grade])

  // Filtrar uma semana específica ignora o teto: o aluno pediu aquela, não as primeiras N.
  const filtrando = filtroSemana !== 'todas' || filtroTipo !== 'todos'
  const paraMostrar = filtrando ? semanas : semanas.slice(0, visiveis)
  const fechadas = new Set(colapsadas ?? [])
  const restantes = filtrando ? 0 : semanas.length - paraMostrar.length

  if (!grade.semanas.length) return null

  return (
    <div style={variante === 'admin' ? ESCOPO_ADMIN : undefined}>
    <Card pad={0} style={{ gap: 0, overflow: 'hidden', width: '100%' }}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        {titulo && <h2 className="mr-auto text-sm font-extrabold" style={{ margin: 0, color: 'var(--ink)' }}>{titulo}</h2>}
        <select aria-label="Filtrar por semana" value={filtroSemana} onChange={(e) => setFiltroSemana(e.target.value)} className={`${CTRL} min-w-0 flex-1 sm:w-44 sm:flex-none`}>
          <option value="todas">Todas as semanas</option>
          {grade.semanas.map((s) => (
            <option key={s.numero} value={String(s.numero)}>Semana {s.numero}</option>
          ))}
        </select>

        <select aria-label="Filtrar por tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={`${CTRL} min-w-0 flex-1 sm:w-52 sm:flex-none`}>
          <option value="todos">Todos os tipos</option>
          {tiposPresentes.map((t) => (
            <option key={t.slug} value={t.slug}>{t.nome}</option>
          ))}
        </select>

        {aoAlternarContagem && (
          <button
            type="button"
            onClick={aoAlternarContagem}
            title={ocultarContagem ? 'Mostrar a quantidade de metas' : 'Esconder a quantidade de metas'}
            aria-label={ocultarContagem ? 'Mostrar a quantidade de metas' : 'Esconder a quantidade de metas'}
            className={`${CTRL} inline-flex w-9 items-center justify-center px-0`}
          >
            {ocultarContagem ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}

        {aoDefinirColapsadas && (
          <button
            type="button"
            className={`${CTRL} text-xs`}
            onClick={() => {
              /* Um setter só, e não N alternâncias: cada alternância dispara uma gravação, e fechar 77
                 semanas viraria 77 idas ao servidor. */
              const todasFechadas = semanas.every((x) => fechadas.has(x.numero))
              aoDefinirColapsadas(todasFechadas ? [] : semanas.map((x) => x.numero))
            }}
          >
            {semanas.every((x) => fechadas.has(x.numero)) ? 'Abrir todas' : 'Fechar todas'}
          </button>
        )}

        <span className={`text-xs ${titulo ? 'w-full sm:w-auto' : 'ml-auto'}`} style={{ color: 'var(--sub)' }}>Os filtros valem na hora — não é preciso gerar de novo.</span>
      </div>

      <div className="divide-y divide-[var(--line)]">
        {paraMostrar.map((s) => (
          <div key={s.numero}>
            {/* A faixa inteira é o botão de fechar. Com 77 semanas, mirar uma setinha é pior do que não dobrar. */}
            <button
              type="button"
              onClick={() => aoAlternarColapso?.(s.numero)}
              disabled={!aoAlternarColapso}
              aria-expanded={aoAlternarColapso ? !fechadas.has(s.numero) : undefined}
              className="flex min-h-11 w-full flex-wrap items-center gap-2 px-4 py-2 text-left text-sm font-extrabold disabled:cursor-default"
              style={
                s.kind === 'conteudo'
                  ? { background: 'var(--brand)', color: 'var(--btnText, var(--pn-ffffff,#FFFFFF))' }
                  : s.kind === 'revisao'
                    ? { background: 'var(--gold)', color: 'var(--goldInk)' }
                    : { background: 'var(--surface2)', color: 'var(--sub)' }
              }
            >
              {aoAlternarColapso && (
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${fechadas.has(s.numero) ? '-rotate-90' : ''}`} />
              )}
              <span>Semana {s.numero}</span>
              {!ocultarDatas && <span className="font-medium opacity-90">{fmtIntervalo(s.inicio, s.fim)}</span>}
              {s.kind === 'revisao' && <Tag kind="gray">Revisão</Tag>}
              {s.kind === 'recesso' && <Tag kind="gray">Recesso</Tag>}
              {!ocultarContagem && s.kind === 'conteudo' && (
                <span className="ml-auto text-xs font-medium opacity-85">
                  {s.metas.length} meta{s.metas.length > 1 ? 's' : ''}
                </span>
              )}
            </button>

            {!fechadas.has(s.numero) && (
              <>
                {s.kind === 'recesso' && (
                  <p className="px-4 py-3 text-sm" style={{ margin: 0, color: 'var(--sub)' }}>
                    Não há metas programadas nesta semana; o cronograma será retomado na próxima segunda-feira.
                  </p>
                )}

                {s.kind === 'revisao' &&
                  s.blocos.map((b) => (
                    <div key={b.titulo} className="px-4 py-2">
                      <p className="text-sm font-bold" style={{ margin: 0, color: 'var(--ink)' }}>{b.titulo}</p>
                      <p className="text-sm" style={{ margin: 0, color: 'var(--sub)' }}>{b.texto}</p>
                    </div>
                  ))}

                {s.kind === 'conteudo' &&
                  s.metas.map((m) => {
                    const feita = !!checks?.[m.id]
                    const externos = m.links?.urls ?? []
                    const temSistema = !!m.qtdQuestoes
                    const temExterno = externos.length > 0
                    // Só rotula "do sistema" / "externas" quando há os DOIS — com um só, o rótulo é ruído.
                    const rotular = temSistema && temExterno
                    const href = resolverHref?.(m)
                    return (
                      /* Mobile: empilha (check + data/tipo, título, links). sm+: colunas FIXAS, para o título de
                         cada meta começar no mesmo x (as células vazias continuam renderizadas). */
                      <div
                        key={m.id}
                        className={`flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 sm:grid ${
                          comCheck
                            ? 'sm:grid-cols-[1.5rem_6rem_10.5rem_minmax(0,1fr)_auto_5.5rem]'
                            : 'sm:grid-cols-[6rem_10.5rem_minmax(0,1fr)_auto_5.5rem]'
                        }`}
                        style={{ background: feita ? 'var(--surface2)' : 'var(--surface)' }}
                      >
                        {comCheck && (
                          <CaixaCheck
                            marcada={feita}
                            aoTrocar={(marcar) => aoAlternarCheck?.(m, marcar)}
                            rotulo={`Marcar "${m.titulo}" como concluída`}
                            titulo={feita ? `Concluída em ${fmtDataHora(checks![m.id])}` : 'Marcar como concluída'}
                            className="mt-0.5"
                          />
                        )}
                        <div className="w-24 shrink-0 text-xs">
                          {!ocultarDatas && <p className="font-bold" style={{ margin: 0, color: 'var(--ink)' }}>{fmtBr(m.data)}</p>}
                          <p style={{ margin: 0, fontWeight: ocultarDatas ? 700 : 500, color: ocultarDatas ? 'var(--ink)' : 'var(--sub)' }}>{m.diaNome}</p>
                        </div>
                        <span className="max-w-full shrink-0 justify-self-start truncate rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold" style={{ background: 'var(--chip)', color: 'var(--brand)' }}>
                          {m.tipoDef.nome}
                        </span>
                        <div className="min-w-0 basis-full sm:basis-auto">
                          <p className="text-sm" style={{ margin: 0, color: feita ? 'var(--sub)' : 'var(--ink)', textDecoration: feita ? 'line-through' : 'none' }}>{m.titulo}</p>
                          {m.complemento && <p className="text-xs" style={{ margin: 0, color: 'var(--sub)' }}>{m.complemento}</p>}
                          {feita && (
                            <p className="text-xs font-bold" style={{ margin: 0, color: 'var(--ok)' }}>Concluída em {fmtDataHora(checks![m.id])}</p>
                          )}
                          {m.tipo === 'simulado' && m.simulado_externo_url && (
                            <a href={m.simulado_externo_url} target="_blank" rel="noreferrer" className="text-xs font-bold hover:underline" style={{ color: 'var(--brand)' }}>
                              {m.simulado_externo_nome ?? 'Abrir simulado'} <ExternalLink className="inline h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          {(m.video || m.pdf) && (
                            <div className="flex flex-wrap gap-1.5">
                              {m.video && (
                                <a href={m.video} target="_blank" rel="noreferrer" className={CHIP_LINK} title="Assistir à videoaula">
                                  <PlayCircle className="h-3 w-3" /> Vídeo
                                </a>
                              )}
                              {m.pdf && (
                                <a href={m.pdf} target="_blank" rel="noreferrer" className={CHIP_LINK} title="Abrir o PDF da matéria">
                                  <FileText className="h-3 w-3" /> PDF
                                </a>
                              )}
                            </div>
                          )}

                          {temSistema && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {rotular && <span className="basis-full text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--sub)' }}>Questões do sistema</span>}
                              {href ? (
                                <a href={href} className="inline-flex items-center gap-1 rounded-lg border border-[var(--brand)] bg-[var(--chip)] px-2 py-1 text-xs font-extrabold text-[var(--brand)] transition hover:opacity-80" title="Resolver na plataforma">
                                  <ListChecks className="h-3 w-3" /> Resolver {m.qtdQuestoes} {m.qtdQuestoes === 1 ? 'questão' : 'questões'}
                                </a>
                              ) : (
                                <span className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs" style={{ color: 'var(--sub)' }} title="Questões desta aula (referência)">
                                  {m.qtdQuestoes} {m.qtdQuestoes === 1 ? 'questão' : 'questões'}
                                </span>
                              )}
                            </div>
                          )}

                          {temExterno && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {rotular && <span className="basis-full text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--sub)' }}>Questões externas</span>}
                              {externos.map((u) => (
                                <a key={u.plataforma.id} href={u.url} target="_blank" rel="noreferrer" className={CHIP_LINK}>
                                  {u.plataforma.nome}
                                </a>
                              ))}
                            </div>
                          )}

                          {!temSistema && !temExterno && m.links?.ausente && (
                            <span className="text-xs italic" style={{ color: 'var(--sub)' }}>{m.links.ausente}</span>
                          )}
                        </div>
                        {emissaoId && aoSalvarNota && (
                          <NotaMeta meta={m} emissaoId={emissaoId} nota={notas?.[m.id]} aoSalvar={aoSalvarNota} compacto />
                        )}
                        <span className="shrink-0 text-xs sm:text-right" style={{ color: 'var(--sub)' }}>{m.duracao ?? ''}</span>
                      </div>
                    )
                  })}
              </>
            )}
          </div>
        ))}
      </div>

      {restantes > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[var(--line)] px-4 py-3">
          <span className="text-xs" style={{ color: 'var(--sub)' }}>
            mostrando {paraMostrar.length} de {semanas.length} semanas
          </span>
          <button type="button" className={CTRL} onClick={() => setVisiveis((n) => n + PASSO_SEMANAS)}>
            Mostrar mais {Math.min(PASSO_SEMANAS, restantes)}
          </button>
          {restantes > PASSO_SEMANAS && (
            <button type="button" className={`${CTRL} border-transparent bg-transparent`} onClick={() => setVisiveis(semanas.length)}>
              Mostrar todas ({restantes} restantes)
            </button>
          )}
        </div>
      )}
    </Card>
    </div>
  )
}
