'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
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

type Aba = 'aula' | 'duracao' | 'buscar'

/**
 * Auditoria de metas.
 *
 * A primeira versão desta tela empilhava três listas longas e chamava tudo de "achado" — e a
 * maior delas, "metas em vários cronogramas", é o COMPORTAMENTO NORMAL do catálogo: a mesma
 * aula de Constitucional está em 18 cronogramas porque ela deve estar. Apresentar 1.543
 * dessas como problema alarmava sobre o que está certo e escondia o que não está.
 *
 * O desenho agora separa duas coisas que não são a mesma:
 *   - O que PRECISA de decisão: formato de aula divergente e durações que se contradizem.
 *     São poucos, têm consequência conhecida, e cada um traz a correção junto.
 *   - O que serve para CONSULTAR: onde uma meta aparece. É ferramenta de busca, e por isso
 *     começa vazia — esperando a pergunta, em vez de despejar o catálogo inteiro.
 */
export function MetasAuditoriaClient({
  variantesIniciais,
  duracoesIniciais,
  totalGrupos,
  tipos,
}: {
  variantesIniciais: VarianteAula[]
  duracoesIniciais: DuracaoDivergente[]
  totalGrupos: number
  tipos: { slug: string; nome: string }[]
}) {
  const [variantes, setVariantes] = useState(variantesIniciais)
  const [duracoes, setDuracoes] = useState(duracoesIniciais)
  const [aba, setAba] = useState<Aba>(variantesIniciais.length ? 'aula' : duracoesIniciais.length ? 'duracao' : 'buscar')
  const [ocupado, setOcupado] = useState<string | null>(null)

  const nadaAFazer = variantes.length === 0 && duracoes.length === 0

  return (
    <div className="space-y-6">
      {/* ── O que a tela quer dizer, em três números com CONSEQUÊNCIA declarada */}
      <div className="grid gap-3 md:grid-cols-3">
        <Cartao
          ativo={aba === 'aula'}
          aoClicar={() => setAba('aula')}
          n={variantes.length}
          rotulo="Aulas em dois formatos"
          nota={
            variantes.length
              ? 'Risco latente: uma meta de questões nova no formato errado perde o link em silêncio.'
              : 'Toda aula usa uma grafia só.'
          }
          grave={variantes.length > 0}
        />
        <Cartao
          ativo={aba === 'duracao'}
          aoClicar={() => setAba('duracao')}
          n={duracoes.length}
          rotulo="Durações que se contradizem"
          nota={
            duracoes.length
              ? 'Afeta o PDF hoje: só a primeira duração é impressa, as outras somem sem aviso.'
              : 'Cada semana usa uma duração por tipo.'
          }
          grave={duracoes.length > 0}
        />
        <Cartao
          ativo={aba === 'buscar'}
          aoClicar={() => setAba('buscar')}
          n={totalGrupos}
          rotulo="Metas em mais de um cronograma"
          nota="Isto é o normal — a mesma aula serve vários cronogramas. Use para consultar onde ela está."
          grave={false}
        />
      </div>

      {nadaAFazer && aba !== 'buscar' && (
        <Card className="flex flex-row items-center gap-3 p-4">
          <Check className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm">
            <strong>Nada a corrigir.</strong>{' '}
            <span className="text-muted-foreground">
              Nem formato de aula divergente, nem duração se contradizendo. Use a busca para consultar onde
              uma meta aparece.
            </span>
          </p>
        </Card>
      )}

      {aba === 'aula' && (
        <AbaFormatoAula
          variantes={variantes}
          ocupado={ocupado}
          setOcupado={setOcupado}
          aoResolver={(v) =>
            setVariantes((xs) => xs.filter((x) => !(x.disciplina === v.disciplina && x.aula_chave === v.aula_chave)))
          }
        />
      )}

      {aba === 'duracao' && (
        <AbaDuracao
          duracoes={duracoes}
          ocupado={ocupado}
          setOcupado={setOcupado}
          aoResolver={(d) => setDuracoes((xs) => xs.filter((x) => x !== d))}
        />
      )}

      {aba === 'buscar' && <AbaBuscar tipos={tipos} ocupado={ocupado} setOcupado={setOcupado} />}
    </div>
  )
}

/** Cartão-resumo que também é a navegação. O número é o gancho; a nota diz se importa. */
function Cartao({
  n,
  rotulo,
  nota,
  grave,
  ativo,
  aoClicar,
}: {
  n: number
  rotulo: string
  nota: string
  grave: boolean
  ativo: boolean
  aoClicar: () => void
}) {
  return (
    <button
      onClick={aoClicar}
      className={`rounded-xl border p-4 text-left transition ${
        ativo ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'bg-card hover:bg-muted/50'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${grave ? 'text-amber-600 dark:text-amber-500' : ''}`}>
          {n.toLocaleString('pt-BR')}
        </span>
        {grave ? (
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
        ) : (
          <Check className="h-4 w-4 text-emerald-600" />
        )}
      </div>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{rotulo}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/90">{nota}</p>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function AbaFormatoAula({
  variantes,
  ocupado,
  setOcupado,
  aoResolver,
}: {
  variantes: VarianteAula[]
  ocupado: string | null
  setOcupado: (v: string | null) => void
  aoResolver: (v: VarianteAula) => void
}) {
  const [aberto, setAberto] = useState<string | null>(null)

  async function padronizar(v: VarianteAula, alvo: string) {
    const chave = `aula:${v.disciplina}:${v.aula_chave}`
    if (ocupado) return
    const sim = await confirmar({
      titulo: `Padronizar para "${alvo}"`,
      mensagem: `As ${v.total} metas de "${v.disciplina}" na aula ${v.aula_chave} passam a usar "${alvo}", em ${v.cronogramas.length} cronograma(s).`,
    })
    if (!sim) return
    setOcupado(chave)
    const r = await padronizarFormatoAula(v.disciplina, v.aula_chave, alvo)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível padronizar.')
    toast.success(`${r.alterados} meta(s) agora usam "${alvo}"`)
    aoResolver(v)
  }

  if (!variantes.length) return null

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
      <div className="border-b bg-amber-50 px-4 py-3 text-sm dark:bg-amber-500/10">
        <p className="font-medium text-amber-900 dark:text-amber-200">Por que isto importa</p>
        <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
          O link da aula casa por texto <strong>exato</strong>. Uma meta com &quot;01&quot; não encontra o link
          cadastrado como &quot;1&quot;, e desaparece sem erro nenhum. Hoje nenhuma meta de questões está
          perdendo link — todas usam o formato sem zero, igual aos links. O risco é a próxima nascer errada.
        </p>
      </div>

      <div className="divide-y">
        {variantes.map((v) => {
          const chave = `aula:${v.disciplina}:${v.aula_chave}`
          const expandido = aberto === chave
          const trabalhando = ocupado === chave
          return (
            <div key={chave}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {v.disciplina}
                    <span className="text-muted-foreground"> · aula {v.aula_chave}</span>
                  </p>
                  <button
                    onClick={() => setAberto(expandido ? null : chave)}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition ${expandido ? '' : '-rotate-90'}`} />
                    {v.total} metas em {v.cronogramas.length} cronogramas
                  </button>
                </div>

                {/* A escolha É a ação: cada botão mostra o formato e quantas metas o usam hoje. */}
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">padronizar tudo para</span>
                  {v.formas.map((f) => (
                    <Button
                      key={f.aula}
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={trabalhando}
                      onClick={() => padronizar(v, f.aula)}
                    >
                      {trabalhando ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="mr-1 h-3.5 w-3.5" />
                      )}
                      <span className="font-mono">{f.aula}</span>
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">{f.n} hoje</span>
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
                          — <span className="font-mono">{c.aula}</span> ({c.n})
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
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function AbaDuracao({
  duracoes,
  ocupado,
  setOcupado,
  aoResolver,
}: {
  duracoes: DuracaoDivergente[]
  ocupado: string | null
  setOcupado: (v: string | null) => void
  aoResolver: (d: DuracaoDivergente) => void
}) {
  async function uniformizar(d: DuracaoDivergente, alvo: string) {
    const chave = `dur:${d.cronograma_id}:${d.semana}:${d.tipo}`
    if (ocupado) return
    const sim = await confirmar({
      titulo: `Uniformizar para "${alvo}"`,
      mensagem: `As ${d.total} metas de "${d.tipo}" na semana ${d.semana} de "${d.cronograma_nome}" passam a usar "${alvo}".`,
    })
    if (!sim) return
    setOcupado(chave)
    const r = await padronizarDuracao(d.cronograma_id, d.semana, d.tipo, alvo)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível uniformizar.')
    toast.success(`${r.alterados} meta(s) com duração "${alvo}"`)
    aoResolver(d)
  }

  if (!duracoes.length) return null

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
      <div className="border-b bg-amber-50 px-4 py-3 text-sm dark:bg-amber-500/10">
        <p className="font-medium text-amber-900 dark:text-amber-200">Por que isto importa</p>
        <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
          No documento impresso a duração vai no rótulo do tipo, e só a <strong>primeira</strong> é usada. As
          outras somem da folha sem aviso — o aluno planeja o dia por um número que não é o cadastrado.
        </p>
      </div>

      <div className="divide-y">
        {duracoes.map((d) => {
          const chave = `dur:${d.cronograma_id}:${d.semana}:${d.tipo}`
          const trabalhando = ocupado === chave
          return (
            <div key={chave} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/cronogramas/${d.cronograma_id}`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {d.cronograma_nome}
                </Link>
                <p className="text-xs text-muted-foreground">
                  semana {d.semana} · {d.tipo} · {d.total} metas
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">uniformizar para</span>
                {d.valores.map((v) => (
                  <Button
                    key={v.duracao}
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={trabalhando}
                    onClick={() => uniformizar(d, v.duracao)}
                  >
                    {trabalhando ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    <span className="font-mono">{v.duracao}</span>
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{v.n} hoje</span>
                  </Button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca: começa VAZIA, esperando a pergunta.
 *
 * Despejar 1.543 grupos na abertura fazia a tela parecer um relatório de problemas — quando é
 * ferramenta de consulta. Quem chega aqui quer saber onde UMA meta está, não folhear o catálogo.
 */
function AbaBuscar({
  tipos,
  ocupado,
  setOcupado,
}: {
  tipos: { slug: string; nome: string }[]
  ocupado: string | null
  setOcupado: (v: string | null) => void
}) {
  const [grupos, setGrupos] = useState<GrupoMeta[]>([])
  const [total, setTotal] = useState(0)
  const [busca, setBusca] = useState('')
  const [minCron, setMinCron] = useState(1)
  const [tipo, setTipo] = useState('todos')
  const [pagina, setPagina] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [buscou, setBuscou] = useState(false)

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requisicao = useRef(0)

  useEffect(() => {
    const termo = busca.trim()
    if (termo.length < 2 && minCron === 1 && tipo === 'todos') {
      setGrupos([])
      setTotal(0)
      setBuscou(false)
      return
    }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const id = ++requisicao.current
      setCarregando(true)
      const r = await buscarGrupos(termo, minCron, tipo === 'todos' ? null : tipo, pagina, POR_PAGINA)
      if (id !== requisicao.current) return
      setCarregando(false)
      setBuscou(true)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível buscar.')
      setGrupos(r.itens ?? [])
      setTotal(r.total ?? 0)
    }, 250)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [busca, minCron, tipo, pagina])

  const ultimaPagina = Math.max(0, Math.ceil(total / POR_PAGINA) - 1)

  async function remover(g: GrupoMeta, metaId: string, nomeCron: string) {
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
    <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
      <div className="flex flex-row flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(0)
            }}
            placeholder="Buscar por disciplina, conteúdo ou aula"
            className="h-9 pl-8"
            autoFocus
          />
        </div>

        <Select
          value={tipo}
          onValueChange={(v) => {
            setTipo(v ?? 'todos')
            setPagina(0)
          }}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue>{tipo === 'todos' ? 'Todos os tipos' : (tipos.find((t) => t.slug === tipo)?.nome ?? tipo)}</SelectValue>
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
            setMinCron(Number(v ?? 1))
            setPagina(0)
          }}
        >
          <SelectTrigger className="h-9 w-52">
            <SelectValue>{minCron === 1 ? 'Em qualquer cronograma' : `Em ${minCron}+ cronogramas`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Em qualquer cronograma</SelectItem>
            {[2, 3, 5, 10].map((k) => (
              <SelectItem key={k} value={String(k)}>
                Em {k}+ cronogramas
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!buscou ? (
        <div className="px-4 py-12 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">Procure uma meta</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Digite a disciplina, o conteúdo ou o número da aula para ver em quais cronogramas ela aparece,
            em que semana e em que dia.
          </p>
        </div>
      ) : carregando && !grupos.length ? (
        <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
        </p>
      ) : !grupos.length ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma meta encontrada.</p>
      ) : (
        <div className="divide-y">
          {grupos.map((g) => {
            const expandido = aberto === g.chave
            return (
              <div key={g.chave}>
                <button
                  onClick={() => setAberto(expandido ? null : g.chave)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition hover:bg-muted/40"
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 transition ${expandido ? '' : '-rotate-90'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {g.disciplina}
                      {g.aula_chave && <span className="text-muted-foreground"> · aula {g.aula_chave}</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{g.conteudo || <em>sem conteúdo</em>}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {g.tipo}
                  </Badge>
                  {g.n_formas_aula > 1 && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200"
                      title="Gravada com mais de um formato de aula"
                    >
                      {g.n_formas_aula} formatos
                    </Badge>
                  )}
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {g.n_cronogramas} cronograma{g.n_cronogramas > 1 ? 's' : ''}
                  </Badge>
                </button>

                {expandido && (
                  <div className="border-t bg-muted/20">
                    {g.cronogramas.map((c) => (
                      <div key={c.meta_id} className="flex flex-wrap items-center gap-x-3 px-4 py-1.5 pl-11 text-xs">
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
                          <Badge variant="outline" className="shrink-0 font-mono">
                            {c.aula}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 p-0"
                          title="Excluir esta ocorrência"
                          disabled={ocupado === c.meta_id}
                          onClick={() => remover(g, c.meta_id, c.nome)}
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
            {Math.min((pagina + 1) * POR_PAGINA, total).toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
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
  )
}
