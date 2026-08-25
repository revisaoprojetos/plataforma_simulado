'use client'

/**
 * A grade do cronograma na tela — usada tanto ao gerar quanto ao reabrir uma emissão
 * salva, para as duas mostrarem exatamente a mesma coisa.
 *
 * Os filtros de semana e tipo agem AO VIVO sobre a grade já calculada. No gerador legado
 * era preciso clicar em "Gerar" de novo para o filtro valer — aqui não.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { CaixaCheck } from '@/components/cronograma/caixa-check'
import { NotaMeta } from '@/components/cronograma/nota-meta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtBr, fmtIntervalo } from '@/lib/cronograma/datas'
import { acharPaleta } from '@/lib/cronograma/paletas'
import type { Grade, MetaDatada } from '@/lib/cronograma/tipos'

/**
 * Os quatro números do topo. Aceita `null` de propósito: na tela do aluno eles ficam visíveis
 * ANTES de gerar, com travessão no lugar do valor — assim o resultado preenche um formato que já
 * estava na tela, em vez de surgir do nada.
 */
/**
 * O carimbo do check é um INSTANTE (timestamptz), não uma data civil do cronograma — por isso
 * aqui vale o fuso do navegador, ao contrário das datas das metas, que usam UTC de propósito.
 */
function fmtDataHora(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export function ResumoGrade({
  grade,
  ocultos,
  aoAlternar,
}: {
  grade: Grade | null
  /** Chaves escondidas pelo aluno. Ausente = a tela não oferece esconder. */
  ocultos?: string[]
  aoAlternar?: (chave: string) => void
}) {
  const numeros: [string, string, string | number][] = [
    ['semanas', 'Semanas', grade?.resumo.totalSemanas ?? '—'],
    ['dias', 'Dias por semana', grade?.resumo.diasPorSemana ?? '—'],
    ['atividades', 'Atividades', grade?.resumo.atividades ?? '—'],
    ['conclusao', 'Conclusão', grade?.resumo.conclusao ? fmtBr(grade.resumo.conclusao) : '—'],
  ]
  const escondidos = new Set(ocultos ?? [])
  const visiveis = numeros.filter(([chave]) => !escondidos.has(chave))
  const podeEsconder = !!aoAlternar

  return (
    <div className="space-y-2">
      {visiveis.length > 0 && (
        <div
          className={`grid gap-3 ${
            visiveis.length === 1 ? '' : visiveis.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
          }`}
        >
          {visiveis.map(([chave, rotulo, valor]) => (
            /* `group` no cartão: o botão de esconder só aparece no hover. Um × permanente em
               cada número transformaria quatro cartões de leitura em quatro controles. */
            <Card key={chave} className="group/num relative p-4">
              {podeEsconder && (
                <button
                  onClick={() => aoAlternar(chave)}
                  title={`Esconder ${rotulo.toLowerCase()}`}
                  aria-label={`Esconder ${rotulo}`}
                  className="absolute right-2 top-2 rounded p-1 text-muted-foreground/40 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/num:opacity-100"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </button>
              )}
              <p className={`text-3xl font-bold tabular-nums ${grade ? '' : 'text-muted-foreground/40'}`}>{valor}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {rotulo}
              </p>
            </Card>
          ))}
        </div>
      )}

      {/* O que está escondido continua ao alcance: esconder sem caminho de volta vira perda. */}
      {podeEsconder && escondidos.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          <span>escondidos:</span>
          {numeros
            .filter(([chave]) => escondidos.has(chave))
            .map(([chave, rotulo]) => (
              <button
                key={chave}
                onClick={() => aoAlternar(chave)}
                className="rounded-full border px-2 py-0.5 transition hover:bg-muted hover:text-foreground"
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
  paletaSlug,
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
}: {
  grade: Grade
  paletaSlug: string
  titulo?: string
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
}) {
  const comCheck = !!aoAlternarCheck
  const paleta = acharPaleta(paletaSlug)
  /* Quantas semanas o navegador monta de uma vez.
     A grade de "12 Matérias (2 horas)" tem 634 metas em 77 semanas. Renderizar tudo de uma vez
     produzia 1.955 KB de HTML e 10,6 s de espera — MEDIDO, não estimado. O aluno lê a semana
     atual e talvez as próximas; as 70 seguintes ele rola até, se rolar. */
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
  // A ordem e o rótulo vêm da definição do tipo, que o motor já anexou a cada meta.
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
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        {titulo && <h2 className="mr-auto text-sm font-semibold">{titulo}</h2>}
        <Select value={filtroSemana} onValueChange={(v) => setFiltroSemana(v ?? 'todas')}>
          <SelectTrigger className="w-44">
            <SelectValue>{filtroSemana === 'todas' ? 'Todas as semanas' : `Semana ${filtroSemana}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as semanas</SelectItem>
            {grade.semanas.map((s) => (
              <SelectItem key={s.numero} value={String(s.numero)}>
                Semana {s.numero}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v ?? 'todos')}>
          <SelectTrigger className="w-52">
            <SelectValue>
              {filtroTipo === 'todos' ? 'Todos os tipos' : (tiposPresentes.find((t) => t.slug === filtroTipo)?.nome ?? 'Todos os tipos')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {tiposPresentes.map((t) => (
              <SelectItem key={t.slug} value={t.slug}>
                {t.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {aoAlternarContagem && (
          <Button
            size="sm"
            variant="ghost"
            onClick={aoAlternarContagem}
            title={ocultarContagem ? 'Mostrar a quantidade de metas' : 'Esconder a quantidade de metas'}
            className="h-8 px-2"
          >
            {ocultarContagem ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}

        {aoDefinirColapsadas && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => {
              /* Um setter só, e não N alternâncias em sequência: cada alternância dispara
                 uma gravação, e fechar 77 semanas viraria 77 idas ao servidor. */
              const todasFechadas = semanas.every((x) => fechadas.has(x.numero))
              aoDefinirColapsadas(todasFechadas ? [] : semanas.map((x) => x.numero))
            }}
          >
            {semanas.every((x) => fechadas.has(x.numero)) ? 'Abrir todas' : 'Fechar todas'}
          </Button>
        )}

        <span className={`text-xs text-muted-foreground ${titulo ? 'w-full sm:w-auto' : 'ml-auto'}`}>Os filtros valem na hora — não é preciso gerar de novo.</span>
      </div>

      <div className="divide-y">
        {paraMostrar.map((s) => (
          <div key={s.numero}>
            {/* A faixa inteira é o botão de fechar. Com 77 semanas, ter de mirar uma setinha
                para dobrar cada uma é pior do que não poder dobrar. */}
            <button
              type="button"
              onClick={() => aoAlternarColapso?.(s.numero)}
              disabled={!aoAlternarColapso}
              className="flex w-full flex-wrap items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-white disabled:cursor-default"
              style={{ background: s.kind === 'conteudo' ? paleta.primaria : paleta.revisao }}
            >
              {aoAlternarColapso && (
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${fechadas.has(s.numero) ? '-rotate-90' : ''}`}
                />
              )}
              <span>Semana {s.numero}</span>
              <span className="font-normal opacity-90">{fmtIntervalo(s.inicio, s.fim)}</span>
              {s.kind === 'revisao' && <Badge variant="secondary">Revisão</Badge>}
              {s.kind === 'recesso' && <Badge variant="secondary">Recesso</Badge>}
              {!ocultarContagem && s.kind === 'conteudo' && (
                <span className="ml-auto text-xs font-normal opacity-80">
                  {s.metas.length} meta{s.metas.length > 1 ? 's' : ''}
                </span>
              )}
            </button>

            {!fechadas.has(s.numero) && (
            <>

            {s.kind === 'recesso' && (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Não há metas programadas nesta semana; o cronograma será retomado na próxima segunda-feira.
              </p>
            )}

            {s.kind === 'revisao' &&
              s.blocos.map((b) => (
                <div key={b.titulo} className="px-4 py-2">
                  <p className="text-sm font-medium">{b.titulo}</p>
                  <p className="text-sm text-muted-foreground">{b.texto}</p>
                </div>
              ))}

            {s.kind === 'conteudo' &&
              s.metas.map((m) => (
                /* Colunas FIXAS. Em flex, a etiqueta do tipo mudava de largura com o texto
                   ("Legproc" vs "PDFULL + Videoaula"), então o título de cada meta começava num x
                   diferente a cada linha. As células dos links e da duração são sempre renderizadas
                   (vazias quando não há), senão a coluna seguinte escorrega. */
                <div
                  key={m.id}
                  className={`flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 sm:grid ${
                    comCheck
                      ? 'sm:grid-cols-[1.5rem_6rem_10.5rem_minmax(0,1fr)_auto_5.5rem]'
                      : 'sm:grid-cols-[6rem_10.5rem_minmax(0,1fr)_auto_5.5rem]'
                  }`}
                  style={{ background: paleta.celula }}
                >
                  {comCheck && (
                    <CaixaCheck
                      marcada={!!checks?.[m.id]}
                      aoTrocar={(marcar) => aoAlternarCheck?.(m, marcar)}
                      rotulo={`Marcar "${m.titulo}" como concluída`}
                      titulo={checks?.[m.id] ? `Concluída em ${fmtDataHora(checks[m.id])}` : 'Marcar como concluída'}
                      className="mt-0.5"
                    />
                  )}
                  <div className="w-24 shrink-0 text-xs">
                    <p className="font-medium">{fmtBr(m.data)}</p>
                    <p className="text-muted-foreground">{m.diaNome}</p>
                  </div>
                  <Badge variant="outline" className="max-w-full shrink-0 justify-self-start truncate">
                    {m.tipoDef.nome}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${checks?.[m.id] ? 'text-muted-foreground line-through' : ''}`}>{m.titulo}</p>
                    {m.complemento && <p className="text-xs text-muted-foreground">{m.complemento}</p>}
                    {checks?.[m.id] && (
                      <p className="text-xs text-emerald-600">Concluída em {fmtDataHora(checks[m.id])}</p>
                    )}
                    {m.tipo === 'simulado' && m.simulado_externo_url && (
                      <a href={m.simulado_externo_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        {m.simulado_externo_nome ?? 'Abrir simulado'} <ExternalLink className="inline h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {m.links?.urls.map((u) => (
                      <a
                        key={u.plataforma.id}
                        href={u.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border bg-background/70 px-2 py-0.5 text-xs text-primary hover:bg-background"
                      >
                        {u.plataforma.nome}
                      </a>
                    ))}
                    {m.links?.ausente && <span className="text-xs italic text-muted-foreground">{m.links.ausente}</span>}
                  </div>
                      {emissaoId && aoSalvarNota && (
                    <NotaMeta
                      meta={m}
                      emissaoId={emissaoId}
                      nota={notas?.[m.id]}
                      aoSalvar={aoSalvarNota}
                      compacto
                    />
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground sm:text-right">{m.duracao ?? ''}</span>
                </div>
              ))}
            </>
            )}
          </div>
        ))}
      </div>

      {restantes > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            mostrando {paraMostrar.length} de {semanas.length} semanas
          </span>
          <Button size="sm" variant="outline" onClick={() => setVisiveis((n) => n + PASSO_SEMANAS)}>
            Mostrar mais {Math.min(PASSO_SEMANAS, restantes)}
          </Button>
          {restantes > PASSO_SEMANAS && (
            <Button size="sm" variant="ghost" onClick={() => setVisiveis(semanas.length)}>
              Mostrar todas ({restantes} restantes)
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
