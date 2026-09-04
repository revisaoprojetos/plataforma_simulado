'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, Link2, ListChecks, Loader2, Package, Pencil, Plus, Search, Send, Trash2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SecaoHeader } from '@/components/admin/secao-header'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DisciplinaPicker } from '@/components/cronograma/disciplina-picker'
import { MontarSemana } from './montar-semana'
import { AdicionarDoBancoDialog } from '@/components/admin/adicionar-do-banco-dialog'
import { SimuladoPicker, type SimuladoOpcao } from '@/components/cronograma/simulado-picker'
import { alternarCronogramaNoPacote } from '../pacotes/actions'
import type { MetaFonte, TipoMeta, TipoMetaDef } from '@/lib/cronograma/tipos'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import {
  atualizarMeta,
  carregarDetalhe,
  comporDoBanco,
  criarDisciplina,
  criarMeta,
  excluirMeta,
  type PacotesDoCronograma,
  type CronogramaDetalhe,
  type Diagnostico,
  type EntradaMeta,
} from './metas-actions'
import {
  atualizarBancoConteudo,
  bancoAulasDaChave,
  contarPropagacao,
  propagarConteudoAula,
  type BancoAulaRef,
  type PropagacaoAlvo,
} from '../conteudos/actions'

const novaMeta = (semana: number, tipo: string): EntradaMeta => ({
  semana,
  dia: 0,
  tipo,
  disciplina: '',
  disciplina_id: null,
  aula: null,
  conteudo: null,
  duracao: null,
  ordem: 0,
  simulado_id: null,
  simulado_externo_nome: null,
  simulado_externo_url: null,
})

export function MetasClient({
  cronograma: c,
  metasIniciais,
  tipos,
  disciplinas: disciplinasIniciais,
  simulados,
  pacotes,
  diagnostico,
}: {
  cronograma: CronogramaDetalhe
  metasIniciais: MetaFonte[]
  tipos: TipoMetaDef[]
  disciplinas: { id: string; nome: string }[]
  simulados: SimuladoOpcao[]
  pacotes: PacotesDoCronograma
  diagnostico: Diagnostico
}) {
  // Rótulo e ordem vêm do cadastro de tipos, não de constantes no código.
  const porSlug = useMemo(() => new Map(tipos.map((t) => [t.slug, t])), [tipos])
  const rotulo = (slug: string) => porSlug.get(slug)?.nome ?? slug
  const corTipo = (slug: string) => porSlug.get(slug)?.cor || null
  const ordemDoTipo = (slug: string) => porSlug.get(slug)?.ordem ?? 999
  const [metas, setMetas] = useState(metasIniciais)
  // Disciplinas em estado: criar uma nova pelo picker precisa fazê-la aparecer na hora.
  const [disciplinas, setDisciplinas] = useState(disciplinasIniciais)
  const [pendente, iniciar] = useTransition()
  const searchParams = useSearchParams()

  /** Cria (ou reaproveita) uma disciplina e a deixa disponível nos pickers imediatamente. */
  async function criarDisciplinaLocal(nome: string) {
    const r = await criarDisciplina(nome)
    if (!r.ok || !r.id) {
      toast.error(r.error ?? 'Não foi possível criar a disciplina.')
      return null
    }
    const nova = { id: r.id, nome: r.nome ?? nome.trim() }
    setDisciplinas((xs) => (xs.some((d) => d.id === nova.id) ? xs : [...xs, nova].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
    toast.success(`Disciplina "${nova.nome}" pronta para uso`)
    return nova
  }

  /**
   * Recarrega as metas do servidor. A MontarSemana grava em lote / repete semanas, e o estado
   * local precisa refletir isso — sem depender de `router.refresh()`, que recarrega a rota (não
   * o estado `useState` desta tela) e nem existe quando o editor abre dentro da aba "Conteúdo".
   */
  function recarregarMetas() {
    iniciar(async () => {
      const r = await carregarDetalhe(c.id)
      if (r.ok && r.metas) setMetas(r.metas)
    })
  }
  const [semanaAtiva, setSemanaAtiva] = useState<number>(1)
  const [aberto, setAberto] = useState(false)
  // Conteúdo da meta começa como RESUMO read-only (a fonte é o banco); só abre pra editar
  // "só neste cronograma" sob demanda, ou já aberto ao criar uma meta nova.
  const [editarConteudo, setEditarConteudo] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<EntradaMeta>(novaMeta(1, tipos[0]?.slug ?? 'pdfull'))
  const [pac, setPac] = useState(pacotes)
  const [pacotesAberto, setPacotesAberto] = useState(false)
  const [propagarMeta, setPropagarMeta] = useState<MetaFonte | null>(null)
  // Vínculo com o banco da meta em edição: null = ainda carregando; [] = não está no banco.
  const [vinculo, setVinculo] = useState<BancoAulaRef[] | null>(null)

  const revisao = useMemo(() => new Set(c.semanas_revisao), [c.semanas_revisao])

  // Contagem por semana, para a régua de navegação mostrar onde há conteúdo.
  const porSemana = useMemo(() => {
    const mapa = new Map<number, MetaFonte[]>()
    for (const m of metas) {
      const l = mapa.get(m.semana)
      if (l) l.push(m)
      else mapa.set(m.semana, [m])
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => a.dia - b.dia || ordemDoTipo(a.tipo) - ordemDoTipo(b.tipo) || a.ordem - b.ordem)
    }
    return mapa
  }, [metas, porSlug])

  const daSemana = porSemana.get(semanaAtiva) ?? []

  /* Busca e filtro valem sobre o CRONOGRAMA INTEIRO, não sobre a semana aberta. A tela só
     tinha navegação semana a semana: achar "a aula 12 de Constitucional" num cronograma de 71
     semanas era abrir 71 abas de uma em uma. Quando há busca, a régua sai e a lista mostra de
     onde cada resultado veio. */
  /* Semanas sem meta e não marcadas como revisão. Vem das metas EM MEMÓRIA, não do
     diagnóstico do servidor: adicionar a primeira meta de uma semana tem de tirá-la da lista
     na hora, sem recarregar a página. */
  const semanasVazias = useMemo(
    () =>
      Array.from({ length: c.total_semanas }, (_, i) => i + 1).filter(
        (n) => !revisao.has(n) && !(porSemana.get(n)?.length ?? 0),
      ),
    [c.total_semanas, revisao, porSemana],
  )

  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const buscando = busca.trim().length > 0 || filtroTipo !== 'todos'

  const resultados = useMemo(() => {
    if (!buscando) return []
    const t = busca.trim().toLowerCase()
    return metas
      .filter((m) => filtroTipo === 'todos' || m.tipo === filtroTipo)
      .filter(
        (m) =>
          !t ||
          m.disciplina.toLowerCase().includes(t) ||
          (m.conteudo ?? '').toLowerCase().includes(t) ||
          (m.aula ?? '').toLowerCase().includes(t),
      )
      .sort((a, b) => a.semana - b.semana || a.dia - b.dia || a.ordem - b.ordem)
  }, [metas, busca, filtroTipo, buscando])

  /* Dentro da semana, as metas ficam agrupadas por DIA. Uma lista corrida de 12 metas com o
     dia repetido em cada linha esconde a estrutura que o cronograma tem. */
  const porDia = useMemo(() => {
    const mapa = new Map<number, MetaFonte[]>()
    for (const m of daSemana) {
      const l = mapa.get(m.dia)
      if (l) l.push(m)
      else mapa.set(m.dia, [m])
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0])
  }, [daSemana])

  const avisos = useMemo(() => {
    const xs: string[] = []
    const d = diagnostico
    if (d.semanasComMetasEmRevisao.length) {
      xs.push(
        `Semana(s) ${d.semanasComMetasEmRevisao.join(', ')} estão marcadas como revisão mas têm metas. Na geração as metas são ignoradas — corrija a marcação ou mova as metas.`,
      )
    }
    if (d.metasForaDosDias) xs.push(`${d.metasForaDosDias} meta(s) com dia fora dos ${c.dias_curso.length} dias de curso.`)
    if (d.metasForaDasSemanas) xs.push(`${d.metasForaDasSemanas} meta(s) fora do intervalo de ${c.total_semanas} semanas.`)
    if (d.questoesSemLink.length) {
      xs.push(
        `${d.questoesSemLink.length} par(es) disciplina/aula de questões sem link cadastrado — o aluno verá "Não há link do QC/TEC". Ex.: ${d.questoesSemLink
          .slice(0, 3)
          .map((q) => `${q.disciplina} · aula ${q.aula}`)
          .join('; ')}`,
      )
    }
    if (d.duracoesDivergentes.length) {
      xs.push(
        `${d.duracoesDivergentes.length} combinação(ões) de semana+tipo com durações diferentes. No DOCX só a primeira é impressa; as demais somem.`,
      )
    }
    if (d.semanasVazias.length) {
      xs.push(`Semana(s) sem metas e não marcadas como revisão: ${d.semanasVazias.join(', ')}. Elas somem da grade gerada.`)
    }
    return xs
  }, [diagnostico, c])

  /** Adiciona ou tira este cronograma de um pacote, sem sair da tela. */
  function alternarPacote(p: { id: string; nome: string; alcance: number }, dentro: boolean) {
    iniciar(async () => {
      const r = await alternarCronogramaNoPacote(p.id, c.id, dentro)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível alterar.'); return }
      toast.success(dentro ? `Adicionado ao pacote "${p.nome}"` : `Removido do pacote "${p.nome}"`)
      setPac((x) =>
        dentro
          ? { dentro: [...x.dentro, p], fora: x.fora.filter((y) => y.id !== p.id) }
          : { dentro: x.dentro.filter((y) => y.id !== p.id), fora: [...x.fora, p] },
      )
    })
  }

  function abrirNova() {
    setEditando(null)
    setEditarConteudo(true) // meta nova: precisa preencher o conteúdo.
    setForm(novaMeta(semanaAtiva, tipos[0]?.slug ?? 'pdfull'))
    setAberto(true)
  }

  function abrirEdicao(m: MetaFonte) {
    setEditando(m.id)
    setEditarConteudo(false) // edição: começa no resumo read-only.
    setForm({
      semana: m.semana,
      dia: m.dia,
      tipo: m.tipo,
      disciplina: m.disciplina,
      disciplina_id: m.disciplina_id ?? null,
      aula: m.aula,
      conteudo: m.conteudo,
      duracao: m.duracao,
      ordem: m.ordem,
      simulado_id: m.simulado_id,
      simulado_externo_nome: m.simulado_externo_nome,
      simulado_externo_url: m.simulado_externo_url,
    })
    setAberto(true)
  }

  function salvar() {
    iniciar(async () => {
      const r = editando ? await atualizarMeta(c.id, editando, form) : await criarMeta(c.id, form)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível salvar.')
        return
      }
      toast.success(editando ? 'Meta atualizada' : 'Meta adicionada')
      setAberto(false)
      if (editando) {
        setMetas((xs) => xs.map((m) => (m.id === editando ? ({ ...m, ...form } as MetaFonte) : m)))
      } else {
        setMetas((xs) => [...xs, { ...(form as any), id: (r as any).id }])
      }
      setSemanaAtiva(form.semana)
    })
  }

  // Atalho da Auditoria: ?meta=<id> abre a meta já no diálogo de edição; ?semana=<n> pula pra semana.
  useEffect(() => {
    const alvo = searchParams.get('meta')
    if (alvo) {
      const m = metas.find((x) => x.id === alvo)
      if (m) { setSemanaAtiva(m.semana); abrirEdicao(m); return }
    }
    const sem = Number(searchParams.get('semana'))
    if (sem >= 1 && sem <= c.total_semanas) setSemanaAtiva(sem)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Vínculo com o banco: mostra, no editor de meta, se este conteúdo também está no Banco de Conteúdos.
  useEffect(() => {
    if (!aberto) { setVinculo(null); return }
    let vivo = true
    setVinculo(null)
    bancoAulasDaChave({ disciplina: form.disciplina, aula: form.aula ?? '', tipo: form.tipo }).then((r) => {
      if (vivo) setVinculo(r.ok ? (r.aulas ?? []) : [])
    })
    return () => { vivo = false }
  }, [aberto, form.disciplina, form.aula, form.tipo])

  function abrirPropagar(m: MetaFonte) {
    setPropagarMeta(m)
  }

  function remover(m: MetaFonte) {
    iniciar(async () => {
      const sim = await confirmar({
        titulo: 'Excluir meta',
        mensagem: `Remover "${m.disciplina}${m.aula ? ` · aula ${m.aula}` : ''}" da semana ${m.semana}?`,
        destrutivo: true,
      })
      if (!sim) return
      const r = await excluirMeta(c.id, m.id)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível excluir.')
        return
      }
      toast.success('Meta excluída')
      setMetas((xs) => xs.filter((x) => x.id !== m.id))
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6 text-primary" />
            {c.nome}
          </h1>
          {/* Uma frase corrida com cinco dados encadeados por "·" não se lê — vira etiquetas. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {c.carga_horaria}h/dia
            </Badge>
            <Badge variant="outline">{faixaSemanal(c.dias_curso)}</Badge>
            <Badge variant="outline">{c.total_semanas} semanas</Badge>
            <Badge variant="outline">{metas.length.toLocaleString('pt-BR')} metas</Badge>
            {c.semanas_revisao.length > 0 && (
              <Badge variant="outline" className="border-dashed" title={`Semanas ${c.semanas_revisao.join(', ')}`}>
                {c.semanas_revisao.length} de revisão
              </Badge>
            )}
          </div>
        </div>
        <Badge variant={c.status === 'liberado' ? 'default' : 'secondary'}>
          {c.status === 'liberado' ? 'Liberado' : 'Rascunho'}
        </Badge>
      </div>

      {avisos.length > 0 && (
        <AlertBox variante="aviso" titulo="Pontos de atenção nos dados" icon={AlertTriangle}>
          <ul className="ml-4 list-disc space-y-1 text-sm">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </AlertBox>
      )}

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={ListChecks}
          titulo="Metas"
          subtitulo={
            buscando
              ? `${resultados.length.toLocaleString('pt-BR')} de ${metas.length.toLocaleString('pt-BR')} metas no filtro`
              : `Semana ${semanaAtiva} de ${c.total_semanas}${revisao.has(semanaAtiva) ? ' · marcada como revisão' : ''} · ${daSemana.length} meta(s)`
          }
          acao={
            <div className="flex flex-wrap items-center gap-2">
              <AdicionarDoBancoDialog
                diasNome={c.dias_nome}
                totalSemanas={c.total_semanas}
                onConfirmar={async (opts) => {
                  const r = await comporDoBanco(c.id, opts)
                  if (!r.ok) {
                    toast.error(r.error ?? 'Não foi possível compor do banco.')
                    return
                  }
                  toast.success(`${r.criadas ?? 0} meta(s) adicionada(s) do banco`)
                  if (r.avisos?.length) toast.message(r.avisos.join(' · '))
                  recarregarMetas()
                }}
              />
              <MontarSemana
                cronogramaId={c.id}
                semana={semanaAtiva}
                totalSemanas={c.total_semanas}
                diasNome={c.dias_nome}
                tipos={tipos}
                disciplinas={disciplinas}
                onCriarDisciplina={criarDisciplinaLocal}
                aoCriar={recarregarMetas}
              />
              <Button size="sm" variant="ghost" onClick={abrirNova} disabled={pendente} title="Diálogo completo — use para meta que aponta simulado">
                <Plus className="mr-1 h-4 w-4" />
                Nova meta
              </Button>
            </div>
          }
        />

        {/* Barra de ferramentas: buscar em todo o cronograma, filtrar por tipo, andar nas semanas. */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar disciplina, aula ou conteúdo"
              className="h-8 w-60 pl-7"
            />
          </div>

          <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v ?? 'todos')}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue>{filtroTipo === 'todos' ? 'Todos os tipos' : rotulo(filtroTipo)}</SelectValue>
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

          {buscando ? (
            <Button size="sm" variant="ghost" onClick={() => { setBusca(''); setFiltroTipo('todos') }}>
              <X className="mr-1 h-4 w-4" />
              Limpar filtro
            </Button>
          ) : (
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSemanaAtiva((n) => Math.max(1, n - 1))}
                disabled={semanaAtiva <= 1}
                aria-label="Semana anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-24 text-center text-sm font-medium tabular-nums">Semana {semanaAtiva}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSemanaAtiva((n) => Math.min(c.total_semanas, n + 1))}
                disabled={semanaAtiva >= c.total_semanas}
                aria-label="Próxima semana"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Régua de semanas: mostra de relance onde há conteúdo, revisão e buracos. Some durante a
            busca, que não é por semana. Uma faixa rolável em vez de um bloco embrulhado — com 71
            semanas o bloco tomava meia tela antes da primeira meta. */}
        {!buscando && (
        <>
        <div className="flex gap-1 overflow-x-auto border-b px-4 py-3">
          {Array.from({ length: c.total_semanas }, (_, i) => i + 1).map((s) => {
            const n = porSemana.get(s)?.length ?? 0
            const ehRevisao = revisao.has(s)
            const vazia = n === 0 && !ehRevisao
            return (
              <button
                key={s}
                onClick={() => setSemanaAtiva(s)}
                title={
                  ehRevisao
                    ? `Semana ${s} — revisão original, sem metas de propósito`
                    : vazia
                      ? `Semana ${s} — SEM METAS: ela some da grade que o aluno recebe`
                      : `Semana ${s} — ${n} meta(s)`
                }
                className={`relative h-8 min-w-8 shrink-0 rounded-md border px-1.5 text-xs transition ${
                  s === semanaAtiva
                    ? 'border-primary bg-primary font-semibold text-primary-foreground'
                    : ehRevisao
                      ? 'border-dashed text-muted-foreground/70'
                      : vazia
                        ? // Preenchida, não só contornada: com 71 semanas na régua, uma borda âmbar
                          // de 1px passa despercebida — e semana vazia é justamente o que a equipe
                          // precisa achar, porque ela desaparece da grade do aluno sem avisar.
                          'border-amber-400 bg-amber-100 font-semibold text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200'
                        : 'hover:bg-muted'
                }`}
              >
                {s}
                {vazia && (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-card"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Legenda com os MESMOS desenhos dos botões — swatch redondo ao lado de botão quadrado
            obrigava a traduzir. E o atalho para a próxima semana vazia, que numa régua de 71
            é o que resolve, em vez de caçar a olho. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-[3px] border" /> com metas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-[3px] border border-dashed" /> revisão original (sem metas, de propósito)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-[3px] border border-amber-400 bg-amber-100 dark:border-amber-500/60 dark:bg-amber-500/20" />
            vazia — some da grade do aluno
          </span>

          {semanasVazias.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const proxima = semanasVazias.find((x) => x > semanaAtiva) ?? semanasVazias[0]
                setSemanaAtiva(proxima)
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-amber-100 px-2 py-0.5 font-medium text-amber-900 transition hover:brightness-95 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200"
              title={`Semanas vazias: ${semanasVazias.join(', ')}`}
            >
              <AlertTriangle className="h-3 w-3" />
              {semanasVazias.length} vazia{semanasVazias.length > 1 ? 's' : ''} — ir para a próxima
            </button>
          )}
        </div>
        </>
        )}

        {/* Colunas FIXAS. Em flex, a largura das etiquetas variava com o texto ("Legproc" vs
            "PDFULL + Videoaula"), então disciplina e conteúdo começavam num x diferente em cada
            linha. No mobile continua embrulhando. */
         }
        {(() => {
          /**
           * Uma linha de meta.
           *
           * O dia é COLUNA, escrito só na primeira meta daquele dia. Com um cabeçalho por dia,
           * um cronograma de 1 meta por dia gastava DUAS linhas para mostrar uma — metade da
           * tela virava rótulo. A faixa de fundo alternada mantém o agrupamento visível sem
           * gastar altura.
           */
          const Linha = ({
            m,
            comOrigem,
            rotuloEsq,
            faixa,
          }: {
            m: MetaFonte
            comOrigem?: boolean
            rotuloEsq?: string | null
            faixa?: boolean
          }) => (
            <div
              className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 hover:bg-muted/40 sm:grid sm:grid-cols-[3.5rem_11rem_minmax(0,1fr)_4rem_auto] ${
                faixa ? 'bg-muted/20' : ''
              }`}
            >
              {comOrigem ? (
                <button
                  type="button"
                  onClick={() => { setBusca(''); setFiltroTipo('todos'); setSemanaAtiva(m.semana) }}
                  className="justify-self-start text-left leading-tight"
                  title={`Abrir a semana ${m.semana}`}
                >
                  <span className="block text-xs font-semibold text-primary hover:underline">S{m.semana}</span>
                  <span className="block text-[10px] uppercase text-muted-foreground">
                    {c.dias_nome[m.dia] ?? m.dia}
                  </span>
                </button>
              ) : (
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {rotuloEsq ?? ''}
                </span>
              )}

              <span className="flex min-w-0 items-center gap-1.5">
                {/* Ponto na cor do tipo: dá para varrer a coluna sem ler rótulo nenhum. */}
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: corTipo(m.tipo) ?? 'var(--muted-foreground)' }}
                />
                <span className="truncate text-xs text-muted-foreground">{rotulo(m.tipo)}</span>
              </span>

              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.disciplina}
                  {m.aula && <span className="font-normal text-muted-foreground"> · aula {m.aula}</span>}
                </p>
                {m.conteudo && <p className="truncate text-xs text-muted-foreground">{m.conteudo}</p>}
              </div>

              <span className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-right">
                {m.duracao ?? ''}
              </span>

              <div className="flex shrink-0 items-center">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirPropagar(m)} disabled={pendente} title="Propagar este conteúdo (outros cronogramas / banco)">
                  <Send className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirEdicao(m)} disabled={pendente} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remover(m)} disabled={pendente} title="Excluir">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          )

          if (buscando) {
            if (!resultados.length) {
              return (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhuma meta encontrada em todo o cronograma.
                </div>
              )
            }
            return (
              <div className="divide-y">
                {resultados.map((m) => (
                  <Linha key={m.id} m={m} comOrigem />
                ))}
              </div>
            )
          }

          if (!daSemana.length) {
            return (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {revisao.has(semanaAtiva)
                  ? 'Semana de revisão original — por definição não tem metas.'
                  : 'Nenhuma meta nesta semana. Semanas vazias somem da grade gerada.'}
              </div>
            )
          }

          /* Agrupado por DIA: uma lista corrida de 12 metas com o dia repetido em cada linha
             esconde a estrutura que o cronograma tem. */
          return (
            <div>
              {porDia.map(([dia, lista], iDia) => (
                <div key={dia} className="border-b last:border-b-0">
                  {lista.map((m, i) => (
                    <Linha
                      key={m.id}
                      m={m}
                      // O dia aparece uma vez por bloco; as metas seguintes alinham sob ele.
                      rotuloEsq={i === 0 ? (c.dias_nome[dia] ?? String(dia)) : null}
                      faixa={iDia % 2 === 1}
                    />
                  ))}
                </div>
              ))}
            </div>
          )
        })()}
      </Card>

      {/* Os pacotes vêm DEPOIS das metas: editar metas é o trabalho desta tela, e o cartão de
          pacotes empurrava a lista para baixo da dobra em todo carregamento. */}
      {/* ── Por onde o aluno recebe este cronograma */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={Package}
          titulo="Pacotes"
          subtitulo={
            pac.dentro.length === 0
              ? 'Este cronograma não está em nenhum pacote — nenhum aluno o recebe'
              : `Em ${pac.dentro.length} pacote(s) · ${pac.dentro.reduce((n, p) => n + p.alcance, 0).toLocaleString('pt-BR')} aluno(s) alcançado(s)`
          }
          acao={
            pac.fora.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setPacotesAberto(true)} disabled={pendente}>
                <Plus className="mr-1 h-4 w-4" />
                Adicionar a um pacote
              </Button>
            )
          }
        />

        {pac.dentro.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            O aluno recebe cronogramas pelos pacotes. Enquanto este não estiver em nenhum, só chega a quem
            tiver acesso gratuito ou vínculo individual.
          </p>
        ) : (
          <div className="divide-y">
            {pac.dentro.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <Link href={`/admin/cronogramas/pacotes/${p.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {p.nome}
                </Link>
                <Badge variant="outline" className="shrink-0 gap-1">
                  <Users className="h-3 w-3" />
                  {p.alcance.toLocaleString('pt-BR')}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => alternarPacote(p, false)} disabled={pendente} title="Remover deste pacote">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>


      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar meta' : 'Nova meta'}</DialogTitle>
            <DialogDescription>
              Correção avulsa, sem precisar reimportar o cronograma inteiro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* ── Onde a meta fica na grade (o que é REALMENTE próprio da meta) */}
            <Secao titulo="Posição na grade">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Semana</Label>
                  <Input
                    type="number"
                    min={1}
                    max={c.total_semanas}
                    value={form.semana}
                    onChange={(e) => setForm((f) => ({ ...f, semana: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dia</Label>
                  <Select value={String(form.dia)} onValueChange={(v) => setForm((f) => ({ ...f, dia: Number(v) }))}>
                    <SelectTrigger>
                      <SelectValue>{c.dias_nome[form.dia] ?? `dia ${form.dia}`}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {c.dias_nome.map((nome, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={form.ordem}
                    onChange={(e) => setForm((f) => ({ ...f, ordem: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground">Desempate dentro do dia.</p>
                </div>
              </div>
            </Secao>

            {/* ── O conteúdo é do BANCO: por padrão mostramos um resumo + atalhos. Só vira campo
                   editável sob "editar só aqui" (correção pontual neste cronograma). */}
            <Secao titulo="Conteúdo">
              {editarConteudo ? (
                <div className="space-y-3">
                  {editando && (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5">
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        Editando o conteúdo <strong>só neste cronograma</strong>. Para mudar em todo lugar, edite no banco.
                      </p>
                      <button type="button" onClick={() => setEditarConteudo(false)} className="shrink-0 text-[11px] font-medium text-primary hover:underline">
                        voltar ao resumo
                      </button>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Tipo</Label>
                      <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: (v ?? '') as TipoMeta }))}>
                        <SelectTrigger><SelectValue>{rotulo(form.tipo)}</SelectValue></SelectTrigger>
                        <SelectContent>
                          {tipos.map((t) => (
                            <SelectItem key={t.slug} value={t.slug}>{t.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Aula</Label>
                      <Input value={form.aula ?? ''} onChange={(e) => setForm((f) => ({ ...f, aula: e.target.value }))} placeholder="01" />
                      <p className="text-xs text-muted-foreground">Texto, não número: “01” e “1” são aulas diferentes.</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Disciplina</Label>
                    <DisciplinaPicker
                      disciplinas={disciplinas}
                      nome={form.disciplina}
                      disciplinaId={form.disciplina_id}
                      onChange={(v) => setForm((f) => ({ ...f, ...v }))}
                      onCriar={criarDisciplinaLocal}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Conteúdo</Label>
                    <Textarea rows={2} value={form.conteudo ?? ''} onChange={(e) => setForm((f) => ({ ...f, conteudo: e.target.value }))} placeholder="O que o aluno estuda nesta meta" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duração</Label>
                    <Input value={form.duracao ?? ''} onChange={(e) => setForm((f) => ({ ...f, duracao: e.target.value }))} placeholder="3 - 4h" className="sm:w-48" />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Resumo read-only do conteúdo */}
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge variant="secondary">{rotulo(form.tipo)}</Badge>
                      <span className="font-medium">{form.disciplina || <span className="text-muted-foreground">sem disciplina</span>}</span>
                      {form.aula && <span className="text-muted-foreground">· aula {form.aula}</span>}
                      {form.duracao && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{form.duracao}</span>}
                    </div>
                    {form.conteudo ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">{form.conteudo}</p>
                    ) : (
                      <p className="mt-1.5 text-xs italic text-muted-foreground">sem conteúdo</p>
                    )}
                  </div>

                  {/* Vínculo com o banco + atalhos */}
                  {vinculo == null ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> verificando o banco…</p>
                  ) : vinculo.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" /> No banco:{' '}
                        <span className="truncate font-medium text-foreground">{vinculo.map((v) => v.conjunto_nome).join(', ')}</span>
                      </span>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <Link href={`/admin/cronogramas/conteudos/${vinculo[0].conjunto_id}`} target="_blank" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                          <ExternalLink className="mr-1 h-4 w-4" /> Editar no banco
                        </Link>
                        {editando && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { const m = metas.find((x) => x.id === editando); if (m) { setAberto(false); setPropagarMeta(m) } }}
                          >
                            <Send className="mr-1 h-4 w-4" /> Propagar
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Este conteúdo ainda não está no banco de conteúdos.</p>
                  )}

                  <button type="button" onClick={() => setEditarConteudo(true)} className="text-xs text-primary hover:underline">
                    editar conteúdo só neste cronograma
                  </button>
                </div>
              )}
            </Secao>

            {/* ── Só aparece quando o tipo aponta simulado */}
            {form.tipo === 'simulado' && (
              <Secao titulo="Destino do simulado">
                <SimuladoPicker
                  simulados={simulados}
                  simuladoId={form.simulado_id}
                  externoNome={form.simulado_externo_nome}
                  externoUrl={form.simulado_externo_url}
                  onChange={(v) => setForm((f) => ({ ...f, ...v }))}
                />
              </Secao>
            )}
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

      <Dialog open={pacotesAberto} onOpenChange={setPacotesAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar a um pacote</DialogTitle>
            <DialogDescription>
              O pacote é o que liga o cronograma aos alunos. Quem estiver nele passa a receber este
              cronograma — desde que ele esteja liberado.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {pac.fora.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Já está em todos os pacotes.</p>
            ) : (
              pac.fora.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    alternarPacote(p, true)
                    setPacotesAberto(false)
                  }}
                  disabled={pendente}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                  <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                    <Users className="h-3 w-3" />
                    {p.alcance.toLocaleString('pt-BR')}
                  </Badge>
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPacotesAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PropagarMetaDialog meta={propagarMeta} aoFechar={() => setPropagarMeta(null)} aoAplicado={recarregarMetas} />
    </>
  )
}

// ── Propagar a partir de UMA meta: empurra o conteúdo para outros cronogramas e/ou o banco ──
function PropagarMetaDialog({
  meta,
  aoFechar,
  aoAplicado,
}: {
  meta: MetaFonte | null
  aoFechar: () => void
  aoAplicado: () => void
}) {
  const [carregando, setCarregando] = useState(false)
  const [alvos, setAlvos] = useState<PropagacaoAlvo[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [banco, setBanco] = useState<BancoAulaRef[]>([])
  const [incluirBanco, setIncluirBanco] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!meta) return
    let vivo = true
    setCarregando(true)
    setAlvos([])
    setSel(new Set())
    setBanco([])
    const chave = { disciplina: meta.disciplina, aula: meta.aula ?? '', tipo: meta.tipo }
    Promise.all([contarPropagacao(chave), bancoAulasDaChave(chave)]).then(([rc, rb]) => {
      if (!vivo) return
      setCarregando(false)
      if (rc.ok) { const xs = rc.alvos ?? []; setAlvos(xs); setSel(new Set(xs.map((a) => a.cronograma_id))) }
      else toast.error(rc.error ?? 'Não foi possível consultar.')
      if (rb.ok) { const bs = rb.aulas ?? []; setBanco(bs); setIncluirBanco(bs.length > 0) }
    })
    return () => { vivo = false }
  }, [meta])

  const metasSel = alvos.filter((a) => sel.has(a.cronograma_id)).reduce((n, a) => n + a.metas, 0)
  const todos = alvos.length > 0 && sel.size === alvos.length
  const nadaSelecionado = sel.size === 0 && !(incluirBanco && banco.length > 0)

  async function aplicar() {
    if (!meta || nadaSelecionado) return
    const chave = { disciplina: meta.disciplina, aula: meta.aula ?? '', tipo: meta.tipo, conteudo: meta.conteudo }
    setSalvando(true)
    const msgs: string[] = []
    if (sel.size) {
      const r = await propagarConteudoAula({ ...chave, cronogramaIds: [...sel] })
      if (!r.ok) { setSalvando(false); return toast.error(r.error ?? 'Falha ao propagar.') }
      msgs.push(`${(r.atualizadas ?? 0).toLocaleString('pt-BR')} meta(s)`)
    }
    if (incluirBanco && banco.length) {
      const r = await atualizarBancoConteudo(chave)
      if (!r.ok) { setSalvando(false); return toast.error(r.error ?? 'Falha ao atualizar o banco.') }
      msgs.push(`${r.atualizadas ?? 0} no banco`)
    }
    setSalvando(false)
    toast.success(`Propagado: ${msgs.join(' · ') || 'nada mudou'}`)
    aoAplicado()
    aoFechar()
  }

  return (
    <Dialog open={!!meta} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="w-full sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Propagar conteúdo</DialogTitle>
          <DialogDescription>{meta ? `${meta.disciplina} · aula ${meta.aula || '—'} · ${meta.tipo}` : ''}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conteúdo a aplicar (o desta meta)</p>
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-sm">
            {meta?.conteudo?.trim() || <span className="italic text-muted-foreground">vazio — vai limpar o conteúdo dos selecionados</span>}
          </p>
        </div>

        {carregando ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Procurando…</p>
        ) : (
          <>
            {/* Atualizar o molde no banco */}
            <label className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${banco.length ? 'cursor-pointer hover:bg-muted/40' : 'opacity-60'}`}>
              <input
                type="checkbox"
                disabled={!banco.length}
                checked={incluirBanco && banco.length > 0}
                onChange={(e) => setIncluirBanco(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Atualizar a aula no banco</span>
                <span className="block text-xs text-muted-foreground">
                  {banco.length ? `Conjunto: ${banco.map((b) => b.conjunto_nome).join(', ')}` : 'Esta aula ainda não está no banco.'}
                </span>
              </span>
            </label>

            {/* Outros cronogramas */}
            {alvos.length === 0 ? (
              <p className="rounded-xl border bg-muted/20 py-6 text-center text-sm text-muted-foreground">Nenhum cronograma usa esta aula.</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{alvos.length} cronograma(s) · {metasSel.toLocaleString('pt-BR')} meta(s)</p>
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSel(todos ? new Set() : new Set(alvos.map((a) => a.cronograma_id)))}>
                    {todos ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                <div className="max-h-[36vh] space-y-1 overflow-y-auto pr-1">
                  {alvos.map((a) => (
                    <label key={a.cronograma_id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={sel.has(a.cronograma_id)}
                        onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(a.cronograma_id) : n.delete(a.cronograma_id); return n })}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                      {a.status === 'liberado' && (
                        <Badge variant="outline" className="shrink-0 border-amber-400 text-[10px] text-amber-700 dark:text-amber-300">liberado</Badge>
                      )}
                      <Badge variant="secondary" className="shrink-0 text-[10px]">{a.metas} meta(s)</Badge>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Cronogramas <strong>liberados</strong> mudam o que o aluno já vê.</p>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={aplicar} disabled={salvando || carregando || nadaSelecionado}>
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Propagar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Bloco do formulário com título — evita a coluna única e longa de antes. */
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </div>
  )
}
