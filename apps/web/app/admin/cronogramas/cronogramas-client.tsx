'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListChecks, Loader2, Package, Pencil, Plus, Power, Search, Tags, Trash2, Upload, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import { CaixaCheck } from '@/components/cronograma/caixa-check'
import { SecaoHeader } from '@/components/admin/secao-header'
import { CronogramaTabs } from '@/components/admin/cronograma-tabs'
import { AlertBox } from '@/components/ui/alert-box'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  alternarLiberacao,
  alternarLiberacaoEmLote,
  atualizarCategoria,
  atualizarCronograma,
  criarCategoria,
  criarCronograma,
  excluirCategoria,
  excluirCronograma,
  type CategoriaRow,
  type CronogramaLista,
  type EntradaCronograma,
} from './actions'

/** Rótulo curto de cada dia da semana, indexado pelo número do dia (0=domingo). */
const DIAS = [
  { valor: 1, nome: 'Seg' },
  { valor: 2, nome: 'Ter' },
  { valor: 3, nome: 'Qua' },
  { valor: 4, nome: 'Qui' },
  { valor: 5, nome: 'Sex' },
  { valor: 6, nome: 'Sáb' },
  { valor: 0, nome: 'Dom' }, // por último: na semana de estudo o domingo fecha, não abre (R3)
]

const vazio = (): EntradaCronograma => ({
  nome: '',
  carga_horaria: 4,
  total_semanas: 34,
  dias_curso: [1, 2, 3, 4, 5, 6],
  dias_nome: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  semanas_revisao: [],
  categoria_id: null,
  subtitulo: null,
  ordem: 0,
})

// Cor do "Gerador rápido"/CTA do cronograma — EDITÁVEL via personalização (token `--crono-cor`),
// com o roxo vibrante como default. Não usa --brand-primary porque a marca do tenant pode ser um
// roxo mais escuro/opaco (o color-mix nela ficava feio); esta é uma cor DEDICADA e personalizável.
const MARCA = 'var(--crono-cor, #6a54e0)'
// Clareia SOBE a luminosidade e mantém o croma (relative color oklch) — vibrante como o roxo original,
// em vez de misturar com branco (que "lava"/deixa opaco). Continua 100% dirigido pelo token --crono-cor.
const GRAD_MARCA = `linear-gradient(115deg, ${MARCA} 0%, oklch(from ${MARCA} calc(l + 0.08) c h) 58%, oklch(from ${MARCA} calc(l + 0.17) calc(c * 0.94) h) 100%)`
const GLOW_BTN = `0 8px 18px -10px color-mix(in oklab, ${MARCA} 80%, transparent)`
const GLOW_CARD = `0 16px 36px -18px color-mix(in oklab, ${MARCA} 72%, transparent)`

// Sparkline "metas por semana" — visão geral DERIVADA (a lista não traz metas por semana; um número
// real exigiria um RPC por semana). Distribui de forma determinística por cronograma; semanas de
// revisão ficam mais baixas. Serve para dar o "peso" visual da grade, como no design de referência.
function sparkBars(c: CronogramaLista): number[] {
  const n = Math.max(8, Math.min(16, c.total_semanas || 12))
  if (c.metas === 0) return Array(n).fill(0)
  let seed = 0
  for (let i = 0; i < c.id.length; i++) seed = (seed * 31 + c.id.charCodeAt(i)) >>> 0
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed % 1000) / 1000 }
  const rev = new Set((c.semanas_revisao ?? []).map((s) => Math.round((s / (c.total_semanas || n)) * (n - 1))))
  return Array.from({ length: n }, (_, i) => (rev.has(i) ? 0.28 : 0.45 + rnd() * 0.55))
}

function Sparkline({ c }: { c: CronogramaLista }) {
  const bars = sparkBars(c)
  return (
    <div
      className="flex h-8 shrink-0 items-end gap-[2px]"
      aria-hidden
      title={c.metas > 0 ? `${c.metas.toLocaleString('pt-BR')} metas em ${c.total_semanas} semanas` : 'sem metas'}
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-1 rounded-sm"
          style={{
            height: `${Math.max(12, h * 100)}%`,
            // Mais alta = mais ESCURA (cor da marca cheia); mais baixa = mais CLARA (marca + branco).
            backgroundColor: `color-mix(in oklab, ${MARCA} ${Math.round(30 + h * 70)}%, #fff)`,
          }}
        />
      ))}
    </div>
  )
}

export function CronogramasClient({
  inicial,
  categoriasIniciais,
}: {
  inicial: CronogramaLista[]
  categoriasIniciais: CategoriaRow[]
}) {
  const [alertaFechado, setAlertaFechado] = useState(false)
  const [itens, setItens] = useState(inicial)
  const [categorias, setCategorias] = useState(categoriasIniciais)
  const [categoriasAberto, setCategoriasAberto] = useState(false)
  const [novaCategoria, setNovaCategoria] = useState('')
  const [pendente, iniciar] = useTransition()
  // Ações de LINHA saem do `pendente` global: liberar um cronograma não deve desabilitar a lista
  // inteira. O diálogo de cadastro continua no useTransition, onde travar tudo é o certo.
  const [ocupados, setOcupados] = useState<Record<string, boolean>>({})
  const ocupado = (chave: string) => !!ocupados[chave]
  function executar(chave: string, fn: () => Promise<void>) {
    if (ocupados[chave]) return
    setOcupados((o) => ({ ...o, [chave]: true }))
    void (async () => {
      try {
        await fn()
      } finally {
        setOcupados((o) => {
          const n = { ...o }
          delete n[chave]
          return n
        })
      }
    })()
  }
  const [selecao, setSelecao] = useState<Set<string>>(new Set())
  const router = useRouter()
  const [escolhaAberta, setEscolhaAberta] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<EntradaCronograma>(vazio())
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'liberados' | 'rascunhos' | 'sem_pacote' | 'sem_metas'>('todos')
  /* Carga horária é o primeiro corte de quem usa o catálogo — é por ela que o aluno escolhe
     (spec §4, passo 2) e por ela que a equipe monta os pacotes. Estava só como agrupamento
     visual: para ver "os de 6 horas" era preciso rolar até o bloco certo. */
  const [carga, setCarga] = useState<number | 'todas'>('todas')
  const [ordem, setOrdem] = useState<'padrao' | 'metas' | 'semanas'>('padrao')
  const [categoria, setCategoria] = useState<string>('todas')
  const [porPagina, setPorPagina] = useState(25)

  // GERADOR RÁPIDO: cria um rascunho (grade de semanas) em segundos, sem abrir o diálogo.
  const [gerCarga, setGerCarga] = useState(6)
  const [gerSemanas, setGerSemanas] = useState(39)
  const [gerDias, setGerDias] = useState<'seg-sab' | 'seg-sex'>('seg-sab')
  const [gerando, setGerando] = useState(false)
  const gerDiasQtd = gerDias === 'seg-sab' ? 6 : 5
  // Estimativa (aprox.): dias de estudo × blocos/dia (≈ carga/1,5h por bloco). Só orienta o tamanho.
  const metasEstimadas = gerSemanas * gerDiasQtd * Math.max(1, Math.round(gerCarga / 1.5))
  async function gerarRascunho() {
    const dias_curso = gerDias === 'seg-sab' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]
    const dias_nome = gerDias === 'seg-sab' ? ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] : ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
    const entrada: EntradaCronograma = {
      nome: `Rascunho ${gerCarga}h — ${gerSemanas} semanas`,
      carga_horaria: gerCarga, total_semanas: gerSemanas, dias_curso, dias_nome,
      semanas_revisao: [], categoria_id: null, subtitulo: null, ordem: 0,
    }
    setGerando(true)
    try {
      const r = await criarCronograma(entrada)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível gerar o rascunho.'); return }
      toast.success('Rascunho gerado — cadastre as metas para liberar')
      setItens((xs) => [...xs, { ...(entrada as any), id: (r as any).id, slug: '', status: 'rascunho', metas: 0, pacotes: 0, faixa: faixaSemanal(dias_curso), categoria_nome: null }])
    } finally {
      setGerando(false)
    }
  }

  /**
   * "Invisível": liberado, mas fora de qualquer pacote. É o estado que mais engana — a
   * tela diz "Liberado" e mesmo assim ninguém recebe, porque quem entrega o cronograma
   * ao aluno é o pacote.
   */
  const ehInvisivel = (c: CronogramaLista) => c.status === 'liberado' && c.pacotes === 0

  const contagens = useMemo(
    () => ({
      liberados: itens.filter((c) => c.status === 'liberado').length,
      rascunhos: itens.filter((c) => c.status !== 'liberado').length,
      semPacote: itens.filter((c) => c.pacotes === 0).length,
      semMetas: itens.filter((c) => c.metas === 0).length,
      invisiveis: itens.filter(ehInvisivel).length,
    }),
    [itens],
  )

  const cargas = useMemo(
    () =>
      [...new Set(itens.map((c) => c.carga_horaria))]
        .sort((a, b) => a - b)
        .map((h) => ({ h, n: itens.filter((c) => c.carga_horaria === h).length })),
    [itens],
  )

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    let xs = itens
    if (filtro === 'liberados') xs = xs.filter((c) => c.status === 'liberado')
    else if (filtro === 'rascunhos') xs = xs.filter((c) => c.status !== 'liberado')
    else if (filtro === 'sem_pacote') xs = xs.filter((c) => c.pacotes === 0)
    else if (filtro === 'sem_metas') xs = xs.filter((c) => c.metas === 0)
    if (carga !== 'todas') xs = xs.filter((c) => c.carga_horaria === carga)
    if (categoria !== 'todas') {
      xs = xs.filter((c) => (categoria === 'sem' ? !c.categoria_id : c.categoria_id === categoria))
    }
    if (t) {
      /* Busca por TERMOS, não por frase: "12 6h" acha "12 Matérias (6 horas)". Procurar a
         frase inteira obrigava a lembrar a ordem exata das palavras no nome. */
      const termos = t.split(/\s+/).filter(Boolean)
      xs = xs.filter((c) => {
        const alvo = `${c.nome} ${c.categoria_nome ?? ''} ${c.faixa} ${c.carga_horaria}h`.toLowerCase()
        return termos.every((termo) => alvo.includes(termo))
      })
    }
    // A ordenação vale DENTRO de cada carga: reordenar por cima do agrupamento embaralharia
    // os blocos e tiraria justamente a leitura que o agrupamento dá.
    if (ordem !== 'padrao') {
      const chave = ordem === 'metas' ? (c: CronogramaLista) => c.metas : (c: CronogramaLista) => c.total_semanas
      xs = [...xs].sort((a, b) => a.carga_horaria - b.carga_horaria || chave(b) - chave(a))
    }
    return xs
  }, [itens, busca, filtro, carga, categoria, ordem])

  const filtrando =
    filtro !== 'todos' || carga !== 'todas' || categoria !== 'todas' || busca.trim().length > 0

  function limparFiltros() {
    setFiltro('todos')
    setCarga('todas')
    setCategoria('todas')
    setBusca('')
  }

  /* O que está filtrando AGORA, em palavras. Com quatro filtros em pílulas espalhadas, era
     fácil esquecer um ligado e concluir que o catálogo tinha menos cronogramas do que tem. */
  const ativos: { rotulo: string; limpar: () => void }[] = [
    ...(busca.trim() ? [{ rotulo: `"${busca.trim()}"`, limpar: () => setBusca('') }] : []),
    ...(filtro !== 'todos'
      ? [
          {
            rotulo: { liberados: 'Liberados', rascunhos: 'Rascunhos', sem_pacote: 'Sem pacote', sem_metas: 'Sem metas' }[
              filtro
            ] as string,
            limpar: () => setFiltro('todos'),
          },
        ]
      : []),
    ...(carga !== 'todas' ? [{ rotulo: `${carga}h por dia`, limpar: () => setCarga('todas') }] : []),
    ...(categoria !== 'todas'
      ? [
          {
            rotulo: categoria === 'sem' ? 'Sem categoria' : (categorias.find((k) => k.id === categoria)?.nome ?? 'Categoria'),
            limpar: () => setCategoria('todas'),
          },
        ]
      : []),
  ]

  /* Paginação da LISTA. O filtro e a busca continuam valendo sobre o catálogo inteiro — o que
     pagina é só o que se desenha. Com 25 cronogramas não faz diferença; com 300 o navegador
     deixa de montar 300 linhas para mostrar as 25 primeiras. */
  const [pagina, setPagina] = useState(0)
  useEffect(() => setPagina(0), [busca, filtro, carga, categoria, ordem, porPagina])
  const ultimaPagina = Math.max(0, Math.ceil(filtrados.length / porPagina) - 1)
  const daPagina = useMemo(
    () => filtrados.slice(pagina * porPagina, (pagina + 1) * porPagina),
    [filtrados, pagina, porPagina],
  )

  // Agrupa por CATEGORIA (como na referência: Pós-edital / Extensivo / Reta final).
  // "Sem categoria" vai por último; a carga vira etiqueta na linha + filtro em pílula.
  const porCategoria = useMemo(() => {
    const mapa = new Map<string, CronogramaLista[]>()
    for (const c of daPagina) {
      const k = c.categoria_nome ?? 'Sem categoria'
      const lista = mapa.get(k)
      if (lista) lista.push(c)
      else mapa.set(k, [c])
    }
    return [...mapa.entries()].sort((a, b) => {
      if (a[0] === 'Sem categoria') return 1
      if (b[0] === 'Sem categoria') return -1
      return a[0].localeCompare(b[0], 'pt-BR')
    })
  }, [daPagina])

  function abrirNovo() {
    setEditando(null)
    setForm(vazio())
    setAberto(true)
  }

  function abrirEdicao(c: CronogramaLista) {
    setEditando(c.id)
    setForm({
      nome: c.nome,
      carga_horaria: c.carga_horaria,
      total_semanas: c.total_semanas,
      dias_curso: c.dias_curso,
      dias_nome: c.dias_nome,
      semanas_revisao: c.semanas_revisao,
      categoria_id: c.categoria_id,
      subtitulo: null,
      ordem: c.ordem,
    })
    setAberto(true)
  }

  function alternarDia(valor: number, nome: string) {
    setForm((f) => {
      const tem = f.dias_curso.includes(valor)
      const dias = tem ? f.dias_curso.filter((d) => d !== valor) : [...f.dias_curso, valor]
      // Reordena pela ordem de estudo (segunda primeiro, domingo por último) e mantém
      // dias_nome alinhado — a invariante que o banco também cobra.
      const ordenados = DIAS.filter((d) => dias.includes(d.valor))
      return { ...f, dias_curso: ordenados.map((d) => d.valor), dias_nome: ordenados.map((d) => d.nome) }
    })
  }

  function salvar() {
    iniciar(async () => {
      const r = editando ? await atualizarCronograma(editando, form) : await criarCronograma(form)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível salvar.')
        return
      }
      toast.success(editando ? 'Cronograma atualizado' : 'Cronograma criado')
      setAberto(false)
      if (editando) {
        setItens((xs) =>
          xs.map((c) =>
            c.id === editando
              ? { ...c, ...form, faixa: c.faixa, categoria_nome: categorias.find((k) => k.id === form.categoria_id)?.nome ?? null }
              : c,
          ),
        )
      } else {
        setItens((xs) => [
          ...xs,
          {
            ...(form as any),
            id: (r as any).id,
            slug: '',
            status: 'rascunho',
            metas: 0,
            pacotes: 0,
            // `faixa` é derivação pura de dias_curso (R19) — dá para calcular aqui e a linha
            // nasce completa, em vez de aparecer sem a faixa até a próxima carga da página.
            faixa: faixaSemanal(form.dias_curso),
            categoria_nome: categorias.find((k) => k.id === form.categoria_id)?.nome ?? null,
          },
        ])
      }
    })
  }

  /* Lote: liberar 20 cronogramas um a um eram 20 idas, em FILA (o Next serializa as ações de um
     mesmo cliente). Aqui é uma ida só, e a recusa por falta de metas vale por cronograma — os que
     podem são liberados, e o toast diz quantos ficaram de fora. */
  function liberarSelecionados(alvo: boolean) {
    const ids = [...selecao]
    if (!ids.length) return
    executar('lote', async () => {
      const r = await alternarLiberacaoEmLote(ids, alvo)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível alterar.'); return }
      const set = new Set(ids)
      setItens((xs) =>
        xs.map((c) =>
          set.has(c.id) && (!alvo || c.metas > 0) ? { ...c, status: alvo ? 'liberado' : 'rascunho' } : c,
        ),
      )
      setSelecao(new Set())
      toast.success(
        r.semMetas
          ? `${r.alterados} alterado(s) — ${r.semMetas} sem metas ficaram de fora`
          : `${r.alterados} cronograma(s) ${alvo ? 'liberado(s)' : 'de volta a rascunho'}`,
      )
    })
  }

  function alternarSelecao(id: string) {
    setSelecao((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function liberar(c: CronogramaLista) {
    executar(`lib:${c.id}`, async () => {
      const alvo = c.status !== 'liberado'
      const r = await alternarLiberacao(c.id, alvo)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível alterar.')
        return
      }
      toast.success(alvo ? 'Liberado para os alunos' : 'Voltou a rascunho')
      setItens((xs) => xs.map((x) => (x.id === c.id ? { ...x, status: alvo ? 'liberado' : 'rascunho' } : x)))
    })
  }

  function excluir(c: CronogramaLista) {
    iniciar(async () => {
      const sim = await confirmar({
        titulo: 'Excluir cronograma',
        mensagem: `"${c.nome}" sai do catálogo${c.metas ? ` junto com as ${c.metas} metas` : ''}. Você pode restaurar pela Lixeira.`,
        destrutivo: true,
      })
      if (!sim) return
      const r = await excluirCronograma(c.id)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível excluir.')
        return
      }
      toast.success('Cronograma excluído')
      setItens((xs) => xs.filter((x) => x.id !== c.id))
    })
  }

  function adicionarCategoria() {
    const nome = novaCategoria.trim()
    if (!nome) return
    iniciar(async () => {
      const r = await criarCategoria(nome, null)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível criar.'); return }
      toast.success(`Categoria "${nome}" criada`)
      setCategorias((xs) => [...xs, { id: (r as any).id, nome, slug: (r as any).slug ?? '', cor: null, ordem: xs.length, usos: 0 }])
      setNovaCategoria('')
    })
  }

  function renomearCategoria(c: CategoriaRow, nome: string) {
    iniciar(async () => {
      const r = await atualizarCategoria(c.id, nome, c.cor)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível renomear.'); return }
      setCategorias((xs) => xs.map((x) => (x.id === c.id ? { ...x, nome } : x)))
      setItens((xs) => xs.map((x) => (x.categoria_id === c.id ? { ...x, categoria_nome: nome } : x)))
    })
  }

  function removerCategoria(c: CategoriaRow) {
    iniciar(async () => {
      const sim = await confirmar({
        titulo: 'Excluir categoria',
        mensagem:
          c.usos > 0
            ? `"${c.nome}" está em ${c.usos} cronograma(s). Eles não são excluídos — apenas ficam sem categoria.`
            : `Excluir a categoria "${c.nome}"?`,
        destrutivo: true,
      })
      if (!sim) return
      const r = await excluirCategoria(c.id)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível excluir.'); return }
      toast.success('Categoria excluída')
      setCategorias((xs) => xs.filter((x) => x.id !== c.id))
      setItens((xs) => xs.map((x) => (x.categoria_id === c.id ? { ...x, categoria_id: null, categoria_nome: null } : x)))
    })
  }

  return (
    <>
      <div className="space-y-5">
      {/* HEADER: breadcrumb + título + ações (Categorias / Novo) no topo-direito, como na referência. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Cronogramas de estudo</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            O catálogo que o aluno escolhe. Cada cronograma é uma grade fixa de semanas; o aluno informa a
            data de início e o sistema reprograma a grade para ele.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => setCategoriasAberto(true)}>
            <Tags className="mr-1 h-4 w-4" /> Categorias
          </Button>
          <Link href="/admin/cronogramas/importar" className={buttonVariants({ variant: 'outline' })}>
            <Upload className="mr-1 h-4 w-4" /> Importar modelo
          </Link>
          {/* Botão "Novo cronograma" com brilho: gradiente + glow (cor dedicada --crono-cor). */}
          <button
            type="button"
            onClick={() => setEscolhaAberta(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            style={{ background: GRAD_MARCA, boxShadow: GLOW_BTN }}
          >
            <Plus className="h-4 w-4" />
            <span className="whitespace-nowrap">Novo cronograma</span>
          </button>
        </div>
      </div>

      {/* ABAS da seção Cronograma (componente único, idêntico às subpáginas). */}
      <CronogramaTabs catalogoCount={itens.length} />

      {/* LAYOUT 2 COLUNAS: Gerador rápido (vertical, à esquerda) + lista (à direita), como na referência. */}
      <div className="grid items-start gap-5 lg:grid-cols-[300px_1fr]" style={{ marginTop: '1.25rem' }}>
        {/* GERADOR RÁPIDO — painel vertical fixo à esquerda. Mesma função de antes, reflow vertical. */}
        <aside
          className="space-y-4 rounded-2xl border border-white/10 p-4 text-white lg:sticky lg:top-4"
          style={{ background: GRAD_MARCA, boxShadow: GLOW_CARD }}
        >
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
              <Zap className="h-3.5 w-3.5" /> Gerador rápido
            </span>
            <h2 className="text-lg font-bold leading-tight">Cronograma em segundos</h2>
            <p className="text-xs text-white/80">Só o básico: carga, duração e dias. Você ajusta depois.</p>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">Carga diária</div>
            <div className="space-y-1.5">
              {[2, 3, 4, 6].map((h) => {
                const sel = gerCarga === h
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setGerCarga(h)}
                    className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition', sel ? 'bg-white shadow' : 'bg-white/10 text-white hover:bg-white/20')}
                    style={sel ? { color: MARCA } : undefined}
                  >
                    <span>{h}h / dia</span>
                    <span className={cn('text-xs font-medium', sel ? 'opacity-70' : 'text-white/70')}>≈ {h * gerDiasQtd}h/sem</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Duração (semanas)</span>
              <span className="text-sm font-bold tabular-nums">{gerSemanas}</span>
            </div>
            <input
              type="range"
              min={4}
              max={60}
              value={gerSemanas}
              onChange={(e) => setGerSemanas(Number(e.target.value))}
              className="w-full accent-white"
              aria-label="Total de semanas"
            />
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">Dias</div>
            <div className="flex gap-1.5">
              {([['seg-sab', 'Seg–Sáb'], ['seg-sex', 'Seg–Sex']] as const).map(([v, l]) => {
                const sel = gerDias === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGerDias(v)}
                    className={cn('flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition', sel ? 'bg-white shadow' : 'bg-white/10 text-white hover:bg-white/20')}
                    style={sel ? { color: MARCA } : undefined}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-center">
            <div>
              <div className="text-base font-extrabold leading-none">{metasEstimadas.toLocaleString('pt-BR')}</div>
              <div className="mt-0.5 text-[10px] text-white/70">metas ≈</div>
            </div>
            <div>
              <div className="text-base font-extrabold leading-none">{gerSemanas}</div>
              <div className="mt-0.5 text-[10px] text-white/70">semanas</div>
            </div>
            <div>
              <div className="text-base font-extrabold leading-none">{gerDiasQtd}</div>
              <div className="mt-0.5 text-[10px] text-white/70">dias/sem</div>
            </div>
          </div>

          <Button onClick={gerarRascunho} disabled={gerando} className="w-full bg-white hover:bg-white/90" style={{ color: MARCA }}>
            {gerando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Zap className="mr-1 h-4 w-4" />}
            Gerar cronograma
          </Button>
          <p className="text-center text-[11px] text-white/70">Nada é publicado sem a sua revisão.</p>
        </aside>

        {/* COLUNA DIREITA: filtros + lista + paginação. */}
        <div className="min-w-0 space-y-4">
      {/* TUDO que filtra mora aqui: busca, categoria, situação e carga. */}
      <div className="space-y-3">
      <div className="flex flex-row flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, categoria ou carga — ex.: 12 6h"
            className="h-9 pl-8 pr-8"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
              aria-label="Limpar a busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {categorias.length > 0 && (
          <Select value={categoria} onValueChange={(v) => setCategoria(v ?? 'todas')}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue>
                {categoria === 'todas'
                  ? 'Todas as categorias'
                  : categoria === 'sem'
                    ? 'Sem categoria'
                    : (categorias.find((k) => k.id === categoria)?.nome ?? 'Categoria')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              <SelectItem value="sem">Sem categoria</SelectItem>
              {categorias.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={ordem} onValueChange={(v) => setOrdem((v ?? 'padrao') as typeof ordem)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue>
              {ordem === 'padrao' ? 'Ordem do cadastro' : ordem === 'metas' ? 'Mais metas' : 'Mais semanas'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="padrao">Ordem do cadastro</SelectItem>
            <SelectItem value="metas">Mais metas</SelectItem>
            <SelectItem value="semanas">Mais semanas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ['todos', 'Todos', itens.length],
            ['liberados', 'Liberados', contagens.liberados],
            ['rascunhos', 'Rascunhos', contagens.rascunhos],
            ['sem_pacote', 'Sem pacote', contagens.semPacote],
            ['sem_metas', 'Sem metas', contagens.semMetas],
          ] as const
        ).map(([v, rotulo, n]) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition',
              filtro === v ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              n === 0 && v !== 'todos' && 'opacity-50',
            )}
          >
            {rotulo}
            <span className={cn('tabular-nums text-xs', filtro === v ? 'opacity-70' : 'text-muted-foreground')}>{n}</span>
          </button>
        ))}

        {cargas.length > 1 && (
          <>
            <span className="mx-1 hidden h-5 w-px self-center bg-border sm:block" />
            <button
              onClick={() => setCarga('todas')}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition',
                carga === 'todas' ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              )}
            >
              Todas
            </button>
            {cargas.map(({ h, n }) => (
              <button
                key={h}
                onClick={() => setCarga(h)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition',
                  carga === h ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                )}
              >
                {h}h
                <span className={cn('tabular-nums text-xs', carga === h ? 'opacity-70' : 'text-muted-foreground')}>{n}</span>
              </button>
            ))}
          </>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtrados.length.toLocaleString('pt-BR')} de {itens.length.toLocaleString('pt-BR')} cronogramas
        </span>
      </div>

      {ativos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Filtros:</span>
          {ativos.map((a) => (
            <button
              key={a.rotulo}
              onClick={a.limpar}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-primary transition hover:bg-primary/20"
              title="Remover este filtro"
            >
              {a.rotulo}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={limparFiltros} className="ml-auto text-muted-foreground underline hover:text-foreground">
            limpar tudo
          </button>
        </div>
      )}
      </div>

      {contagens.invisiveis > 0 && filtro !== 'sem_pacote' && !alertaFechado && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200" style={{ marginTop: '0.75rem' }}>
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-400 text-sm font-bold text-amber-950">i</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {contagens.invisiveis === 1
                ? '1 cronograma liberado que ninguém recebe'
                : `${contagens.invisiveis} cronogramas liberados que ninguém recebe`}
            </p>
            <p className="text-sm opacity-90">
              {contagens.invisiveis === 1 ? 'Está liberado' : 'Estão liberados'}, mas fora de qualquer pacote e sem
              acesso gratuito — não {contagens.invisiveis === 1 ? 'chega' : 'chegam'} a aluno nenhum.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 self-center">
            <button
              onClick={() => setFiltro('sem_pacote')}
              className="rounded-lg border border-amber-500/60 px-3 py-1.5 text-sm font-medium transition hover:bg-amber-400/20"
            >
              {contagens.invisiveis === 1 ? 'Ver qual é' : 'Ver quais são'}
            </button>
            <button
              onClick={() => setAlertaFechado(true)}
              aria-label="Fechar aviso"
              className="rounded-md p-1 transition hover:bg-amber-400/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {itens.length === 0 ? (
        <Card className="px-4 py-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Nenhum cronograma no catálogo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie um cronograma e depois importe as metas, ou use a importação para trazer o catálogo inteiro.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => setEscolhaAberta(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Criar o primeiro
            </Button>
            <Link href="/admin/cronogramas/importar" className={buttonVariants({ variant: 'outline' })}>
              Importar planilha
            </Link>
          </div>
        </Card>
      ) : filtrados.length === 0 ? (
        <Card className="px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum cronograma nesse filtro.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={limparFiltros}>
            <X className="mr-1 h-4 w-4" />
            Limpar filtros
          </Button>
        </Card>
      ) : (
          <div className="space-y-4">
            {selecao.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
                <span className="text-sm font-medium">
                  {selecao.size} selecionado{selecao.size > 1 ? 's' : ''}
                </span>
                <Button size="sm" onClick={() => liberarSelecionados(true)} disabled={ocupado('lote')}>
                  {ocupado('lote') ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                  Liberar
                </Button>
                <Button size="sm" variant="outline" onClick={() => liberarSelecionados(false)} disabled={ocupado('lote')}>
                  Voltar a rascunho
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setSelecao(new Set(filtrados.map((c) => c.id)))}
                >
                  Selecionar os {filtrados.length} do filtro
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelecao(new Set())}>
                  <X className="mr-1 h-4 w-4" />
                  Limpar
                </Button>
              </div>
            )}
            {porCategoria.map(([cat, lista]) => (
              <div key={cat}>
                {/* Cabeçalho do grupo: NOME da categoria + contagem + divisória (como na referência). */}
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-foreground">{cat}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{lista.length}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                {/* Cada grupo é um card próprio; as linhas dentro dele separadas por divisória leve. */}
                <div className="overflow-hidden rounded-2xl border bg-card shadow-sm divide-y divide-border/60">
                {lista.map((c) => {
                  const invisivel = ehInvisivel(c)
                  return (
                    /* `group` + borda à esquerda no hover: com 26 linhas de altura parecida,
                       o que faltava era saber QUAL linha o cursor está pegando antes de
                       clicar em Liberar ou na lixeira. */
                    <div
                      key={c.id}
                      className={`group/linha flex flex-wrap items-center gap-3 border-l-[3px] px-4 py-3 transition ${
                        selecao.has(c.id)
                          ? 'border-l-primary bg-primary/5'
                          : 'border-l-transparent hover:border-l-primary/40 hover:bg-muted/50'
                      }`}
                    >
                      <CaixaCheck
                        marcada={selecao.has(c.id)}
                        aoTrocar={() => alternarSelecao(c.id)}
                        rotulo={`Selecionar ${c.nome}`}
                        className="mt-0.5"
                      />
                      {/* Marca de status à esquerda: dá para varrer a coluna e achar o que falta. */}
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          c.status === 'liberado' ? (invisivel ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-muted-foreground/30'
                        }`}
                        title={c.status === 'liberado' ? (invisivel ? 'Liberado, mas ninguém recebe' : 'Liberado') : 'Rascunho'}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Link
                            href={`/admin/cronogramas/${c.id}`}
                            className="truncate font-medium decoration-primary/40 underline-offset-4 group-hover/linha:underline"
                          >
                            {c.nome}
                          </Link>
                          {c.categoria_nome && (
                            <span className="shrink-0 text-xs text-muted-foreground">{c.categoria_nome}</span>
                          )}
                        </div>

                        {/* Quatro dados encadeados por "·" viravam uma frase que não se lê.
                            Como etiquetas, o que está errado salta: âmbar é problema. */}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="rounded-full border px-2 py-0.5 font-medium text-muted-foreground">{c.carga_horaria}h/dia</span>
                          <span className="rounded-full border px-2 py-0.5 text-muted-foreground">{c.faixa}</span>
                          <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                            {c.total_semanas} semanas
                            {c.semanas_revisao.length > 0 && ` · ${c.semanas_revisao.length} rev.`}
                          </span>
                          {c.metas === 0 ? (
                            <span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200">
                              sem metas
                            </span>
                          ) : (
                            <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                              {c.metas.toLocaleString('pt-BR')} metas
                            </span>
                          )}
                          {c.pacotes === 0 ? (
                            <span
                              className={`rounded-full border px-2 py-0.5 ${
                                invisivel
                                  ? 'border-amber-400 bg-amber-100 font-medium text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200'
                                  : 'text-muted-foreground'
                              }`}
                              title={invisivel ? 'Liberado, mas fora de qualquer pacote — nenhum aluno recebe' : undefined}
                            >
                              em nenhum pacote
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground">
                              <Package className="h-3 w-3" />
                              {c.pacotes} pacote(s)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Sparkline "metas por semana" (visão geral) — como no design de referência. */}
                      <Sparkline c={c} />

                      {/* Métrica REAL à direita (metas) — ocupa o lugar do "acessos" da referência. */}
                      <div className="hidden w-16 shrink-0 text-right sm:block">
                        <div className="text-sm font-bold leading-none tabular-nums">
                          {c.metas > 0 ? c.metas.toLocaleString('pt-BR') : '—'}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">metas</div>
                      </div>

                      {/* Ações compactas em ícones (como na referência): liberar (power), metas, editar, excluir. */}
                      <div className="flex shrink-0 items-center gap-0.5 border-l pl-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => liberar(c)}
                          disabled={ocupado(`lib:${c.id}`) || (c.status !== 'liberado' && c.metas === 0)}
                          title={
                            c.status === 'liberado'
                              ? 'Liberado — clique para voltar a rascunho'
                              : c.metas === 0
                                ? 'Cadastre metas antes de liberar'
                                : 'Liberar para os alunos'
                          }
                        >
                          {ocupado(`lib:${c.id}`) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Power
                              className={cn(
                                'h-4 w-4',
                                c.status === 'liberado' ? (invisivel ? 'text-amber-500' : 'text-emerald-500') : 'text-muted-foreground',
                              )}
                            />
                          )}
                        </Button>
                        <Link
                          href={`/admin/cronogramas/${c.id}`}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                          title="Metas e pacotes"
                        >
                          <ListChecks className="h-4 w-4" />
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => abrirEdicao(c)} disabled={pendente} title="Editar metadados">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => excluir(c)} disabled={pendente} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            ))}
          </div>
        )}

        {filtrados.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              {(pagina * porPagina + 1).toLocaleString('pt-BR')}–
              {Math.min((pagina + 1) * porPagina, filtrados.length).toLocaleString('pt-BR')} de{' '}
              {filtrados.length.toLocaleString('pt-BR')}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">por página</span>
              <Select value={String(porPagina)} onValueChange={(v) => setPorPagina(Number(v ?? 25))}>
                <SelectTrigger className="h-7 w-16">
                  <SelectValue>{porPagina}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {ultimaPagina > 0 && (
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => setPagina(0)} disabled={pagina === 0} aria-label="Primeira página">
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} aria-label="Página anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-24 text-center text-xs tabular-nums text-muted-foreground">
                  página {pagina + 1} de {ultimaPagina + 1}
                </span>
                <Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))} disabled={pagina >= ultimaPagina} aria-label="Próxima página">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPagina(ultimaPagina)} disabled={pagina >= ultimaPagina} aria-label="Última página">
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
      </div>

      {/* Pop-up de escolha: assistente completo (wizard) × criação rápida (o diálogo abaixo). */}
      <Dialog open={escolhaAberta} onOpenChange={setEscolhaAberta}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo cronograma</DialogTitle>
            <DialogDescription>Como você quer criar?</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setEscolhaAberta(false)
                router.push('/admin/cronogramas/criar/personalizar')
              }}
              className="group flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ListChecks className="h-5 w-5" />
              </span>
              <span className="font-semibold">Assistente completo</span>
              <span className="text-xs text-muted-foreground">
                Etapas guiadas — personalização, estrutura, metas, links e acessos. Monta o cronograma inteiro e cria como rascunho.
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEscolhaAberta(false)
                abrirNovo()
              }}
              className="group flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                <Zap className="h-5 w-5" />
              </span>
              <span className="font-semibold">Rápido</span>
              <span className="text-xs text-muted-foreground">
                Só a casca — nome, carga, semanas e dias. Cria na hora; as metas você adiciona depois no editor.
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar cronograma' : 'Novo cronograma'}</DialogTitle>
            <DialogDescription>
              As metas são cadastradas depois, uma a uma ou por importação. O cronograma nasce como rascunho.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="9 Matérias Essenciais (4 horas)"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Carga (h/dia)</Label>
                <Input
                  type="number"
                  min={1}
                  step="0.5"
                  value={form.carga_horaria}
                  onChange={(e) => setForm((f) => ({ ...f, carga_horaria: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Semanas</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.total_semanas}
                  onChange={(e) => setForm((f) => ({ ...f, total_semanas: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.ordem}
                  onChange={(e) => setForm((f) => ({ ...f, ordem: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Dias de curso</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map((d) => {
                  const ativo = form.dias_curso.includes(d.valor)
                  return (
                    <button
                      key={d.valor}
                      type="button"
                      onClick={() => alternarDia(d.valor, d.nome)}
                      className={`rounded-md border px-3 py-1.5 text-sm transition ${
                        ativo ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                      }`}
                    >
                      {d.nome}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                A ordem é fixa: domingo, quando usado, é o último dia da semana de estudo.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Semanas de revisão originais</Label>
              <Input
                value={form.semanas_revisao.join(', ')}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    semanas_revisao: e.target.value
                      .split(',')
                      .map((s) => Number(s.trim()))
                      .filter((n) => Number.isFinite(n) && n > 0),
                  }))
                }
                placeholder="12, 24"
              />
              <p className="text-xs text-muted-foreground">
                Semanas da grade original que não têm metas. Elas são descartadas na geração e substituídas
                pela periodicidade que o aluno escolher.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Categoria</Label>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setCategoriasAberto(true)}>
                  Gerenciar categorias
                </button>
              </div>
              <Select
                value={form.categoria_id ?? 'nenhuma'}
                onValueChange={(v) => setForm((f) => ({ ...f, categoria_id: v === 'nenhuma' ? null : (v ?? null) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem categoria</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pendente}>
              {pendente ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoriasAberto} onOpenChange={setCategoriasAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Categorias</DialogTitle>
            <DialogDescription>
              Agrupam o catálogo. Renomear conserta em todos os cronogramas de uma vez; excluir não apaga
              cronograma nenhum, só os deixa sem categoria.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {categorias.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada ainda.</p>}

            {categorias.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Input
                  defaultValue={c.nome}
                  onBlur={(e) => {
                    const nome = e.target.value.trim()
                    if (nome && nome !== c.nome) renomearCategoria(c, nome)
                  }}
                />
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                  {c.usos === 0 ? 'sem uso' : `${c.usos} cronograma(s)`}
                </span>
                <Button size="sm" variant="ghost" onClick={() => removerCategoria(c)} disabled={pendente}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-2 border-t pt-3">
              <Input
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') adicionarCategoria()
                }}
                placeholder="Nome da categoria (ex.: Pré-Edital)"
              />
              <Button size="sm" onClick={adicionarCategoria} disabled={pendente || !novaCategoria.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Renomear é seguro: a chave usada pela importação não muda junto.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCategoriasAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
