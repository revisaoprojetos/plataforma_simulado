'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Loader2,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SecaoHeader } from '@/components/admin/secao-header'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  buscarGrupos,
  excluirMetaAvulsa,
  padronizarDuracao,
  padronizarFormatoAula,
  type DuracaoDivergente,
  type GrupoMeta,
  type VarianteAula,
} from './actions'

const POR_PAGINA = 25

export function MetasAuditoriaClient({
  variantesIniciais,
  duracoesIniciais,
  gruposIniciais,
  totalGrupos,
  tipos,
}: {
  variantesIniciais: VarianteAula[]
  duracoesIniciais: DuracaoDivergente[]
  gruposIniciais: GrupoMeta[]
  totalGrupos: number
  tipos: { slug: string; nome: string }[]
}) {
  const [variantes, setVariantes] = useState(variantesIniciais)
  const [duracoes, setDuracoes] = useState(duracoesIniciais)
  const [grupos, setGrupos] = useState(gruposIniciais)
  const [total, setTotal] = useState(totalGrupos)

  const [busca, setBusca] = useState('')
  const [minCron, setMinCron] = useState(2)
  const [tipo, setTipo] = useState<string>('todos')
  const [pagina, setPagina] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requisicao = useRef(0)
  const primeira = useRef(true)

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false
      return
    }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const id = ++requisicao.current
      setCarregando(true)
      const r = await buscarGrupos(busca, minCron, tipo === 'todos' ? null : tipo, pagina, POR_PAGINA)
      if (id !== requisicao.current) return
      setCarregando(false)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível carregar.')
      setGrupos(r.itens ?? [])
      setTotal(r.total ?? 0)
    }, 250)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [busca, minCron, tipo, pagina])

  const ultimaPagina = Math.max(0, Math.ceil(total / POR_PAGINA) - 1)

  async function padronizarAula(v: VarianteAula, alvo: string) {
    const chave = `aula:${v.disciplina}:${v.aula_chave}`
    if (ocupado) return
    const sim = await confirmar({
      titulo: 'Padronizar o formato da aula',
      mensagem: `Todas as metas de "${v.disciplina}" na aula ${v.aula_chave} passam a usar "${alvo}". São ${v.total} meta(s) em ${v.cronogramas.length} cronograma(s).`,
    })
    if (!sim) return
    setOcupado(chave)
    const r = await padronizarFormatoAula(v.disciplina, v.aula_chave, alvo)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível padronizar.')
    toast.success(`${r.alterados} meta(s) padronizada(s) para "${alvo}"`)
    setVariantes((xs) => xs.filter((x) => !(x.disciplina === v.disciplina && x.aula_chave === v.aula_chave)))
  }

  async function uniformizarDuracao(d: DuracaoDivergente, alvo: string) {
    const chave = `dur:${d.cronograma_id}:${d.semana}:${d.tipo}`
    if (ocupado) return
    const sim = await confirmar({
      titulo: 'Uniformizar a duração',
      mensagem: `As ${d.total} meta(s) de "${d.tipo}" na semana ${d.semana} de "${d.cronograma_nome}" passam a usar "${alvo}".`,
    })
    if (!sim) return
    setOcupado(chave)
    const r = await padronizarDuracao(d.cronograma_id, d.semana, d.tipo, alvo)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível uniformizar.')
    toast.success(`${r.alterados} meta(s) com duração "${alvo}"`)
    setDuracoes((xs) => xs.filter((x) => x !== d))
  }

  async function removerMeta(g: GrupoMeta, metaId: string, nomeCron: string) {
    if (ocupado) return
    const sim = await confirmar({
      titulo: 'Excluir esta meta',
      mensagem: `Remove a meta de "${g.disciplina}" do cronograma "${nomeCron}". As outras ocorrências não são tocadas.`,
      destrutivo: true,
    })
    if (!sim) return
    setOcupado(metaId)
    const r = await excluirMetaAvulsa(metaId)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível excluir.')
    toast.success('Meta excluída')
    setGrupos((xs) =>
      xs.map((x) =>
        x.chave === g.chave
          ? { ...x, cronogramas: x.cronogramas.filter((c) => c.meta_id !== metaId), n_metas: x.n_metas - 1 }
          : x,
      ),
    )
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Formato da aula: o que quebra o link em silêncio */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
        <SecaoHeader
          icon={AlertTriangle}
          titulo="Mesma aula, formatos diferentes"
          subtitulo={
            variantes.length
              ? `${variantes.length} combinação(ões) de disciplina + aula gravadas de mais de um jeito`
              : 'Nenhuma — o formato da aula está consistente'
          }
        />
        {variantes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Toda aula usa uma grafia só. É o que mantém o casamento com os links de aula funcionando.
          </p>
        ) : (
          <>
            <p className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              O link da aula casa por texto EXATO. Uma meta com <code>&quot;01&quot;</code> não acha o link
              cadastrado como <code>&quot;1&quot;</code> — e some sem erro nenhum. Hoje nenhuma meta de questões
              está perdendo link por isso, mas basta uma nova nascer no formato errado.
            </p>
            <div className="divide-y">
              {variantes.map((v) => {
                const chave = `aula:${v.disciplina}:${v.aula_chave}`
                const expandido = aberto === chave
                return (
                  <div key={chave}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <button
                        onClick={() => setAberto(expandido ? null : chave)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <ChevronDown className={`h-4 w-4 shrink-0 transition ${expandido ? '' : '-rotate-90'}`} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{v.disciplina}</span>
                          <span className="block text-xs text-muted-foreground">
                            aula {v.aula_chave} · {v.total} metas · {v.cronogramas.length} cronogramas
                          </span>
                        </span>
                      </button>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {v.formas.map((f) => (
                          <Badge key={f.aula} variant="outline" className="tabular-nums">
                            &quot;{f.aula}&quot; · {f.n}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {v.formas.map((f) => (
                          <Button
                            key={f.aula}
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={ocupado === chave}
                            onClick={() => padronizarAula(v, f.aula)}
                          >
                            {ocupado === chave ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="mr-1 h-3.5 w-3.5" />
                            )}
                            tudo &quot;{f.aula}&quot;
                          </Button>
                        ))}
                      </div>
                    </div>

                    {expandido && (
                      <div className="border-t bg-muted/20 px-4 py-2">
                        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                          {v.cronogramas.map((c, i) => (
                            <p key={`${c.id}-${c.aula}-${i}`} className="truncate text-xs">
                              <Link href={`/admin/cronogramas/${c.id}`} className="hover:underline">
                                {c.nome}
                              </Link>
                              <span className="text-muted-foreground">
                                {' '}
                                — &quot;{c.aula}&quot; ({c.n})
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      {/* ── 2. Metas por conteúdo, e em que cronogramas estão */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
        <SecaoHeader
          icon={Layers}
          titulo="Metas por conteúdo"
          subtitulo="A mesma meta costuma estar em vários cronogramas — aqui dá para ver em quais"
          acao={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value)
                    setPagina(0)
                  }}
                  placeholder="Disciplina, conteúdo ou aula"
                  className="h-8 w-56 pl-7"
                />
              </div>

              <Select
                value={tipo}
                onValueChange={(v) => {
                  setTipo(v ?? 'todos')
                  setPagina(0)
                }}
              >
                <SelectTrigger className="h-8 w-44">
                  <SelectValue>
                    {tipo === 'todos' ? 'Todos os tipos' : (tipos.find((t) => t.slug === tipo)?.nome ?? tipo)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {tipos.map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={String(minCron)}
                onValueChange={(v) => {
                  setMinCron(Number(v ?? 2))
                  setPagina(0)
                }}
              >
                <SelectTrigger className="h-8 w-52">
                  <SelectValue>
                    {minCron === 1 ? 'Todas as metas' : `Em ${minCron}+ cronogramas`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Todas as metas</SelectItem>
                  {[2, 3, 5, 10].map((k) => (
                    <SelectItem key={k} value={String(k)}>
                      Em {k}+ cronogramas
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        {carregando && grupos.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : grupos.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhuma meta com esse filtro.
          </p>
        ) : (
          <div className="divide-y">
            {grupos.map((g) => {
              const expandido = aberto === g.chave
              return (
                <div key={g.chave}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                    <button
                      onClick={() => setAberto(expandido ? null : g.chave)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <ChevronDown className={`h-4 w-4 shrink-0 transition ${expandido ? '' : '-rotate-90'}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {g.disciplina}
                          {g.aula_chave && <span className="text-muted-foreground"> · aula {g.aula_chave}</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {g.conteudo || <em>sem conteúdo</em>}
                        </span>
                      </span>
                    </button>

                    <Badge variant="secondary" className="shrink-0">
                      {g.tipo}
                    </Badge>
                    {g.n_formas_aula > 1 && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200"
                        title="Esta meta está gravada com mais de um formato de aula"
                      >
                        {g.n_formas_aula} formatos
                      </Badge>
                    )}
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {g.n_cronogramas} cronograma{g.n_cronogramas > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {g.n_metas} meta{g.n_metas > 1 ? 's' : ''}
                    </Badge>
                  </div>

                  {expandido && (
                    <div className="border-t bg-muted/20">
                      {g.cronogramas.map((c) => (
                        <div key={c.meta_id} className="flex flex-wrap items-center gap-x-3 px-4 py-1.5 text-xs">
                          <Link
                            href={`/admin/cronogramas/${c.id}`}
                            className="min-w-0 flex-1 truncate font-medium hover:underline"
                          >
                            {c.nome}
                          </Link>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            semana {c.semana} · dia {c.dia}
                          </span>
                          {c.aula && (
                            <Badge variant="outline" className="shrink-0">
                              aula &quot;{c.aula}&quot;
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 p-0"
                            title="Excluir esta ocorrência"
                            disabled={ocupado === c.meta_id}
                            onClick={() => removerMeta(g, c.meta_id, c.nome)}
                          >
                            {ocupado === c.meta_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {total > POR_PAGINA && (
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              {(pagina * POR_PAGINA + 1).toLocaleString('pt-BR')}–
              {Math.min((pagina + 1) * POR_PAGINA, total).toLocaleString('pt-BR')} de{' '}
              {total.toLocaleString('pt-BR')} grupo(s)
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0 || carregando}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-24 text-center text-xs tabular-nums text-muted-foreground">
                página {pagina + 1} de {ultimaPagina + 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))}
                disabled={pagina >= ultimaPagina || carregando}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── 3. Durações divergentes */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
        <SecaoHeader
          icon={Clock}
          titulo="Durações divergentes na mesma semana"
          subtitulo={
            duracoes.length
              ? `${duracoes.length} combinação(ões) de semana + tipo com mais de uma duração`
              : 'Nenhuma — cada semana usa uma duração por tipo'
          }
        />
        {duracoes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nada a corrigir aqui.
          </p>
        ) : (
          <>
            <p className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              No documento impresso a duração vai no rótulo do tipo, e só a PRIMEIRA é usada — as
              outras desaparecem da folha sem aviso.
            </p>
            <div className="divide-y">
              {duracoes.map((d) => {
                const chave = `dur:${d.cronograma_id}:${d.semana}:${d.tipo}`
                return (
                  <div key={chave} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/cronogramas/${d.cronograma_id}`} className="truncate text-sm font-medium hover:underline">
                        {d.cronograma_nome}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        semana {d.semana} · {d.tipo} · {d.total} metas
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {d.valores.map((v) => (
                        <Button
                          key={v.duracao}
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={ocupado === chave}
                          onClick={() => uniformizarDuracao(d, v.duracao)}
                          title={`Aplicar "${v.duracao}" às ${d.total} metas`}
                        >
                          {ocupado === chave ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          {v.duracao} ({v.n})
                        </Button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
