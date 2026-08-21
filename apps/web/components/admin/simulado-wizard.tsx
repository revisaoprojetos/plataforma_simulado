'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ListChecks, PenLine, Check, ChevronLeft, ChevronRight, Loader2, Search, Settings2, Users, Sparkles,
  FileText, CalendarClock, ShieldCheck, Info, Clock, ArrowUpDown, Trophy, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { BRT_LABEL } from '@/lib/brt'
import { useOcultarDiscursiva } from '@/components/auth/can-provider'
import { buscarEstudantesSimulado, listarEstudanteIdsSimulado, buscarQuestoesWizard, listarQuestoesDoBanco, type QuestaoWizardItem } from '@/app/admin/simulados/actions'
import { toast } from 'sonner'

interface Banco { id: string; nome: string; cor?: string | null; icone?: string | null; capa?: string | null; tipo?: string | null; nQuestoes?: number; nEstudantes?: number }
interface Estudante { id: string; nome: string; email: string | null }

// No modo "banco" o tipo já vem do banco → não há etapa "Tipo".
const PASSOS_BANCO = ['Banco', 'Informações', 'Regras']
const PASSOS_ZERO = ['Banco', 'Tipo', 'Informações', 'Questões', 'Estudantes', 'Regras']

const nf = (n: number) => n.toLocaleString('pt-BR')
const modoLabel: Record<string, string> = { janela_fixa: 'Agendado', prazo_relativo: 'Prazo relativo', aberto: 'Sempre disponível' }
const liberarLabel: Record<string, string> = { imediato: 'Imediato', apos_janela: 'Após janela', manual: 'Manual' }
const politicaLabel: Record<string, string> = { ultima: 'Última', melhor: 'Maior', media: 'Média' }
const LIB_OPTS = [{ v: 'imediato', label: 'Imediato' }, { v: 'apos_janela', label: 'Após janela' }, { v: 'manual', label: 'Manual' }]

export function SimuladoWizard({
  bancos,
  disciplinas,
  onSubmit,
}: {
  bancos: Banco[]
  /** Disciplinas do tenant (id + nome) para o filtro do picker. */
  disciplinas: { id: string; nome: string }[]
  onSubmit: (data: any) => Promise<{ error?: string } | void>
}) {
  const ocultarDiscursiva = useOcultarDiscursiva()
  const [step, setStep] = useState(0)
  const [pending, start] = useTransition()

  // Estado
  const [modo, setModo] = useState<'banco' | 'zero' | null>(null)
  const [bancoBase, setBancoBase] = useState<string | null>(null)
  const [tipo, setTipo] = useState<'objetivo' | 'discursivo' | null>(null)
  const [info, setInfo] = useState({
    titulo: '', descricao: '', instrucoes: '', modo_aplicacao: 'janela_fixa', data_inicio: '', data_fim: '',
    prazo_valor: '', prazo_unidade: 'dias', tempo_limite_min: '', metodo_identificacao: 'email', embed_ativo: false,
  })
  const [regras, setRegras] = useState<Record<string, any>>({
    embaralhar_questoes: false, embaralhar_alternativas: false, revisao_antes_enviar: true,
    retentativas: 1, retentativas_ilimitadas: false, politica_nota: 'ultima',
    liberar_nota: 'manual', liberar_gabarito: 'manual', liberar_caderno: 'manual', caderno_publico: 'todos',
    enunciado_liberado: true,
    iniciar_atrasado: false, tolerancia_atraso_min: '', tempo_por_questao_seg: '', exibir_nota: false, mostrar_comentario: false, peso_padrao: 1,
  })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [estSel, setEstSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [buscaEst, setBuscaEst] = useState('')
  // Estudantes: buscados SOB DEMANDA no servidor (não pré-carregados) — o passo é opcional e o tenant
  // pode ter ~10k alunos. `estTotal` = quantos casam a busca atual; usado no "Selecionar todos".
  const [estDisp, setEstDisp] = useState<Estudante[]>([])
  const [estBuscando, setEstBuscando] = useState(false)
  const [estTotal, setEstTotal] = useState(0)
  const [buscaBanco, setBuscaBanco] = useState('')
  const [ordemBanco, setOrdemBanco] = useState<'nome' | 'estudantes' | 'questoes'>('nome')
  const [filtroBanco, setFiltroBanco] = useState<'todos' | 'objetiva' | 'discursiva'>('todos')
  const [fDisc, setFDisc] = useState('all')
  // Questões buscadas SOB DEMANDA (não pré-carregadas). Modo "banco" herda os ids do banco escolhido;
  // modo "do zero" usa o picker paginado por busca/disciplina.
  const [bancoQids, setBancoQids] = useState<string[]>([])
  const [bancoQCarregando, setBancoQCarregando] = useState(false)
  const [qDisp, setQDisp] = useState<QuestaoWizardItem[]>([])
  const [qBuscando, setQBuscando] = useState(false)

  const bancosFiltrados = useMemo(() => {
    const s = buscaBanco.toLowerCase().trim()
    let arr = s ? bancos.filter((b) => b.nome.toLowerCase().includes(s)) : bancos.slice()
    if (filtroBanco === 'objetiva') arr = arr.filter((b) => (b.tipo ?? 'objetiva') !== 'discursiva')
    if (filtroBanco === 'discursiva') arr = arr.filter((b) => b.tipo === 'discursiva')
    arr.sort((a, b) =>
      ordemBanco === 'estudantes' ? (b.nEstudantes ?? 0) - (a.nEstudantes ?? 0)
        : ordemBanco === 'questoes' ? (b.nQuestoes ?? 0) - (a.nQuestoes ?? 0)
          : (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    return arr
  }, [bancos, buscaBanco, filtroBanco, ordemBanco])

  const passos = modo === 'banco' ? PASSOS_BANCO : PASSOS_ZERO
  // Stepper mostrado: null/"banco" → 3 passos (caminho comum); "do zero" → 6 passos.
  const passosView = modo === 'zero' ? PASSOS_ZERO : PASSOS_BANCO
  const atual = passos[step]

  const tipoQuestao = tipo === 'discursivo' ? 'discursiva' : 'objetiva'
  const qtdQuestoes = modo === 'banco' ? bancoQids.length : sel.size
  const bancoAtual = bancos.find((b) => b.id === bancoBase)

  // Modo "banco": herda os ids das questões do banco escolhido (na ordem do banco) — sob demanda.
  useEffect(() => {
    if (modo !== 'banco' || !bancoBase) { setBancoQids([]); return }
    let vivo = true
    setBancoQCarregando(true)
    ;(async () => {
      const r = await listarQuestoesDoBanco(bancoBase, tipo ?? 'objetivo')
      if (!vivo) return
      setBancoQids(r.ok ? (r.ids ?? []) : [])
      if (!r.ok) toast.error(r.error ?? 'Falha ao carregar as questões do banco.')
      setBancoQCarregando(false)
    })()
    return () => { vivo = false }
  }, [modo, bancoBase, tipo])

  // Modo "do zero": picker de questões sob demanda (debounce 300ms). Só busca no passo Questões.
  useEffect(() => {
    if (atual !== 'Questões') return
    let vivo = true
    setQBuscando(true)
    const t = setTimeout(async () => {
      const r = await buscarQuestoesWizard({ busca, tipo: tipo ?? 'objetivo', disciplinaId: fDisc })
      if (!vivo) return
      setQDisp(r.ok ? (r.itens ?? []) : [])
      setQBuscando(false)
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, fDisc, tipo, atual])

  // Busca de estudantes sob demanda (debounce 300ms). Só dispara quando o passo Estudantes está ativo.
  useEffect(() => {
    if (atual !== 'Estudantes') return
    let vivo = true
    setEstBuscando(true)
    const t = setTimeout(async () => {
      const r = await buscarEstudantesSimulado(buscaEst)
      if (!vivo) return
      setEstDisp(r.ok ? (r.itens ?? []) : [])
      setEstTotal(r.ok ? (r.total ?? 0) : 0)
      setEstBuscando(false)
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [buscaEst, atual])

  const set = (k: string, v: any) => setInfo((p) => ({ ...p, [k]: v }))
  const setR = (k: string, v: any) => setRegras((p) => ({ ...p, [k]: v }))
  const toggleQ = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleE = (id: string) => setEstSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todosSelecionados = estTotal > 0 && estSel.size >= estTotal
  async function selecionarTodos() {
    if (todosSelecionados) { setEstSel(new Set()); return } // já todos → limpa
    const r = await listarEstudanteIdsSimulado(buscaEst) // só ids que casam a busca atual
    if (r.ok) setEstSel(new Set(r.ids))
    else toast.error(r.error ?? 'Falha ao selecionar estudantes.')
  }

  function podeAvancar() {
    if (atual === 'Banco') return modo !== null
    if (atual === 'Tipo') return !!tipo
    if (atual === 'Informações') return info.titulo.trim().length > 2
    return true
  }

  const ultimo = step === passos.length - 1
  const criando = pending || (modo === 'banco' && bancoQCarregando)

  function avancar() {
    if (!podeAvancar()) {
      toast.error(atual === 'Banco' ? 'Escolha um banco ou "Criar do zero".' : atual === 'Informações' ? 'Informe um título.' : 'Escolha o tipo.')
      return
    }
    setStep((s) => Math.min(passos.length - 1, s + 1))
  }
  function voltar() { setStep((s) => Math.max(0, s - 1)) }

  function finalizar() {
    start(async () => {
      const questaoIds = modo === 'banco' ? bancoQids : [...sel]
      const data = {
        titulo: info.titulo.trim(),
        descricao: info.descricao.trim() || undefined,
        modo_aplicacao: info.modo_aplicacao,
        data_inicio: info.modo_aplicacao === 'janela_fixa' ? info.data_inicio || undefined : undefined,
        data_fim: info.modo_aplicacao === 'janela_fixa' ? info.data_fim || undefined : undefined,
        tempo_limite_min: info.tempo_limite_min ? Number(info.tempo_limite_min) : undefined,
        metodo_identificacao: info.metodo_identificacao,
        embed_ativo: info.embed_ativo,
        regras: {
          ...regras, tipo,
          // Ilimitadas = sem teto de tentativas: guardamos null (o motor trata <=0 como ilimitado).
          retentativas: regras.retentativas_ilimitadas ? null : (Number(regras.retentativas) || 1),
          retentativas_ilimitadas: !!regras.retentativas_ilimitadas,
          peso_padrao: Number(regras.peso_padrao) || 1,
          tempo_por_questao_seg: regras.tempo_por_questao_seg ? Number(regras.tempo_por_questao_seg) : null,
          // Tolerância de atraso só faz sentido quando "iniciar atrasado" está ligado.
          tolerancia_atraso_min: regras.iniciar_atrasado && regras.tolerancia_atraso_min ? Number(regras.tolerancia_atraso_min) : null,
          instrucoes: info.instrucoes.trim() || null,
          ...(info.modo_aplicacao === 'prazo_relativo' ? { prazo_valor: Number(info.prazo_valor) || null, prazo_unidade: info.prazo_unidade } : {}),
        },
        questaoIds,
        bancoBaseId: modo === 'banco' ? bancoBase ?? undefined : undefined,
        estudanteIds: modo === 'zero' ? [...estSel] : undefined,
      }
      const r = await onSubmit(data)
      if (r?.error) toast.error(r.error)
    })
  }

  // ── Resumo (barra lateral) ─────────────────────────────────────────
  const rulesAtivas = ['embaralhar_questoes', 'embaralhar_alternativas', 'revisao_antes_enviar', 'iniciar_atrasado', 'exibir_nota', 'mostrar_comentario'].filter((k) => regras[k]).length
  const estudantesResumo = modo === 'banco' ? (bancoAtual?.nEstudantes ?? 0) : estSel.size
  const pronto = podeAvancar()
  const resumoBanco = modo === 'zero' ? 'Criado do zero — sem herança' : bancoAtual ? bancoAtual.nome : 'Nenhum banco selecionado'
  const checklist = [
    { ok: modo !== null, text: modo === 'zero' ? 'Criando do zero (sem herança)' : bancoAtual ? 'Banco selecionado' : 'Escolha um banco ou crie do zero' },
    { ok: info.titulo.trim().length > 2, text: info.titulo.trim() ? 'Título definido' : 'Informe o título da prova' },
    { ok: true, text: `Modo de aplicação: ${modoLabel[info.modo_aplicacao]}` },
    { ok: regras.liberar_nota !== 'manual' || regras.liberar_gabarito !== 'manual', text: 'Liberações automáticas configuradas' },
  ]

  return (
    <div className="animate-page space-y-4">
      {/* Barra: stepper + navegação */}
      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {passosView.map((p, i) => {
            const done = i < step
            const active = i === step
            return (
              <div key={p} className="flex items-center gap-1.5">
                <button type="button" onClick={() => { if (i <= step) setStep(i) }} disabled={i > step}
                  className={cn('flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors',
                    active ? 'border-primary bg-primary/10' : done ? 'border-transparent hover:bg-muted' : 'border-transparent',
                    i > step && 'cursor-default')}>
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className={cn('text-[13px] font-semibold', active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground')}>{p}</span>
                </button>
                {i < passosView.length - 1 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={voltar} disabled={step === 0 || pending}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>
          {ultimo ? (
            <button type="button" onClick={finalizar} disabled={criando}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
              {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Criar simulado
            </button>
          ) : (
            <button type="button" onClick={avancar} disabled={!podeAvancar()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
              Próximo <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Conteúdo do passo */}
        <div key={step} className="animate-rise min-w-0 space-y-4">

          {/* STEP — Banco (ponto de partida) */}
          {atual === 'Banco' && (
            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="space-y-3 border-b bg-muted/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold">Comece a partir de um banco pronto</p>
                    <p className="text-sm text-muted-foreground">O simulado herda as <b>questões</b> e os <b>estudantes</b> vinculados — depois é só ajustar informações e regras.</p>
                  </div>
                  <button type="button" onClick={() => { setModo('zero'); setBancoBase(null); setStep((s) => s + 1) }}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/5 px-3.5 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/10">
                    <Sparkles className="h-4 w-4" /> Criar do zero
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={buscaBanco} onChange={(e) => setBuscaBanco(e.target.value)} placeholder="Buscar banco por nome…" className="pl-9" />
                  </div>
                  <label className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-xs font-semibold text-muted-foreground">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <select value={ordemBanco} onChange={(e) => setOrdemBanco(e.target.value as any)} className="cursor-pointer bg-transparent outline-none">
                      <option value="nome">Nome (A → Z)</option>
                      <option value="estudantes">Mais estudantes</option>
                      <option value="questoes">Mais questões</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {([['todos', 'Todos'], ['objetiva', 'Objetivas'], ...(ocultarDiscursiva ? [] : [['discursiva', 'Discursivas']])] as const).map(([v, label]) => {
                    const on = filtroBanco === v
                    return (
                      <button key={v} type="button" onClick={() => setFiltroBanco(v as any)}
                        className={cn('h-8 rounded-full border px-3 text-xs font-semibold transition-colors',
                          on ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
                        {label}
                      </button>
                    )
                  })}
                  <span className="ml-auto text-xs text-muted-foreground">{nf(bancosFiltrados.length)} de {nf(bancos.length)} bancos</span>
                </div>
              </div>

              <div className="scroll-claro max-h-[calc(100vh-360px)] overflow-y-auto p-4">
                {bancosFiltrados.length === 0 ? (
                  <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">{bancos.length === 0 ? 'Nenhum banco criado ainda. Use "Criar do zero".' : 'Nenhum banco encontrado.'}</p>
                ) : (
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {bancosFiltrados.map((b) => {
                      const on = modo === 'banco' && bancoBase === b.id
                      const Icon = iconeBanco(b.icone)
                      const c = b.cor ?? '#6d28d9'
                      const discursiva = b.tipo === 'discursiva'
                      return (
                        <button key={b.id} type="button" onClick={() => { setModo('banco'); setBancoBase(b.id); setTipo(discursiva ? 'discursivo' : 'objetivo') }}
                          className={cn('group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                            on ? 'border-primary ring-2 ring-primary/40' : 'border-border')}>
                          <div className="relative aspect-[16/10] overflow-hidden">
                            {b.capa
                              ? <img src={b.capa} alt="" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
                              : <div className="absolute inset-0" style={{ background: `linear-gradient(140deg, ${c} 0%, #0f172a 140%)` }} />}
                            {!b.capa && <Icon className="absolute -right-4 -top-4 h-28 w-28 text-white/10" />}
                            <span className="absolute left-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm ring-1 ring-white/20" style={{ background: c }}>
                              {discursiva ? <PenLine className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                            </span>
                            {on && <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow"><Check className="h-4 w-4" /></span>}
                          </div>
                          <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                            <p className="line-clamp-1 text-[13px] font-bold leading-snug" title={b.nome}>{b.nome}</p>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">{discursiva ? <PenLine className="h-3 w-3" /> : <ListChecks className="h-3 w-3" />} {discursiva ? 'Discursiva' : 'Objetiva'}</span>
                              <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> {nf(b.nQuestoes ?? 0)}</span>
                              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {nf(b.nEstudantes ?? 0)}</span>
                            </div>
                            <span className={cn('mt-0.5 rounded-lg border px-3 py-1.5 text-center text-xs font-bold transition-colors',
                              on ? 'border-transparent bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-muted/50 text-muted-foreground group-hover:border-primary/40 group-hover:text-primary')}>
                              {on ? 'Selecionado' : 'Usar este banco'}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* STEP — Tipo */}
          {atual === 'Tipo' && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <Secao icon={ListChecks} titulo="Tipo de prova" desc="Que tipo de prova será este simulado?" />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {([['objetivo', ListChecks, 'Objetivo', 'Questões de múltipla escolha (A–E), correção automática.'],
                   ['discursivo', PenLine, 'Discursivo', 'Questões dissertativas, correção manual por competências.']] as const)
                  .filter(([val]) => !ocultarDiscursiva || val !== 'discursivo').map(([val, Icon, titulo, desc]) => (
                  <button key={val} type="button" onClick={() => setTipo(val as any)}
                    className={cn('flex flex-col items-start gap-2 rounded-xl border-2 p-5 text-left transition-colors',
                      tipo === val ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
                    <Icon className={cn('h-8 w-8', tipo === val ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="text-lg font-semibold">{titulo}</span>
                    <span className="text-sm text-muted-foreground">{desc}</span>
                  </button>
                ))}
              </div>
              {modo === 'banco' && (
                <p className="mt-4 text-xs text-muted-foreground">Serão herdadas as questões <b>{tipoQuestao}s</b> do banco {bancoAtual?.nome} ({bancoQCarregando ? '…' : bancoQids.length}).</p>
              )}
            </section>
          )}

          {/* STEP — Informações */}
          {atual === 'Informações' && (
            <div className="space-y-4" data-tour="wizard-info">
              {/* Identificação */}
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <Secao icon={FileText} titulo="Identificação da prova" desc="Como o simulado aparece para o aluno." />
                <div className="mt-4 space-y-4">
                  <Campo label="Título" obrigatorio hint={info.titulo.trim().length > 2 ? 'Visível no card e no caderno.' : 'Mínimo de 3 caracteres.'}>
                    <Input value={info.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ex.: Simulado PGE — 1ª fase" />
                  </Campo>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo label="Descrição"><Textarea value={info.descricao} onChange={(e) => set('descricao', e.target.value)} rows={3} placeholder="Breve resumo da prova (opcional)" /></Campo>
                    <Campo label="Instruções ao aluno" hint="Exibidas antes de iniciar a prova.">
                      <Textarea value={info.instrucoes} onChange={(e) => set('instrucoes', e.target.value)} rows={3} placeholder="Ex.: Leia com atenção. Sem consulta." />
                    </Campo>
                  </div>
                </div>
              </section>

              {/* Aplicação e prazos */}
              <section className="rounded-2xl border bg-card p-5 shadow-sm" data-tour="modo-aplicacao">
                <Secao icon={CalendarClock} titulo="Aplicação e prazos" desc="Horário de Brasília (UTC−3)." tone="info" />
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Rotulo>Modo de aplicação</Rotulo>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      {([['janela_fixa', 'Agendado', 'Abre e fecha em datas definidas.'],
                         ['prazo_relativo', 'Prazo relativo', 'Conta a partir da liberação.'],
                         ['aberto', 'Sempre disponível', 'Aluno faz quando quiser.']] as const).map(([v, label, desc]) => {
                        const on = info.modo_aplicacao === v
                        return (
                          <button key={v} type="button" onClick={() => set('modo_aplicacao', v)}
                            className={cn('flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors', on ? 'border-primary bg-primary/5' : 'bg-muted/30 hover:border-primary/40')}>
                            <span className={cn('mt-0.5 h-4 w-4 shrink-0 rounded-full border-[5px] bg-card', on ? 'border-primary' : 'border-border')} />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-bold">{label}</span>
                              <span className="block text-[11px] text-muted-foreground">{desc}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo label="Tempo de prova" hint="Duração (horas:minutos). Em branco = sem limite individual.">
                      <Input type="time" value={info.tempo_limite_min ? `${String(Math.floor(Number(info.tempo_limite_min) / 60)).padStart(2, '0')}:${String(Number(info.tempo_limite_min) % 60).padStart(2, '0')}` : ''} onChange={(e) => { const [h, m] = (e.target.value || '').split(':'); const tot = (Number(h) || 0) * 60 + (Number(m) || 0); set('tempo_limite_min', tot ? String(tot) : '') }} className="w-40" />
                    </Campo>
                  </div>
                  {info.modo_aplicacao === 'janela_fixa' && (
                    <div className="space-y-1.5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Campo label="Início"><Input type="datetime-local" value={info.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></Campo>
                        <Campo label="Fim" hint="Fecha o acesso automaticamente."><Input type="datetime-local" value={info.data_fim} onChange={(e) => set('data_fim', e.target.value)} /></Campo>
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {BRT_LABEL} — informe e confira sempre no horário de Brasília.</p>
                    </div>
                  )}
                  {info.modo_aplicacao === 'prazo_relativo' && (
                    <Campo label="Prazo para concluir" hint="Contado a partir da liberação do acesso de cada aluno.">
                      <div className="flex flex-wrap gap-2">
                        <Input type="number" min={1} value={info.prazo_valor} onChange={(e) => set('prazo_valor', e.target.value)} placeholder="ex.: 7" className="w-28" />
                        <Select value={info.prazo_unidade} onValueChange={(v) => set('prazo_unidade', v)} items={{ horas: 'Horas', dias: 'Dias', meses: 'Meses' }}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="horas">Horas</SelectItem><SelectItem value="dias">Dias</SelectItem><SelectItem value="meses">Meses</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </Campo>
                  )}
                  {info.modo_aplicacao === 'aberto' && (
                    <p className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><Info className="h-4 w-4 shrink-0" /> Aberto: sempre disponível, sem data ou prazo — o aluno faz a qualquer momento.</p>
                  )}
                </div>
              </section>

              {/* Acesso do aluno */}
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <Secao icon={ShieldCheck} titulo="Acesso do aluno" desc="Como o aluno entra e onde a prova roda." tone="ok" />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Campo label="Identificação do aluno" hint="Como o aluno se identifica para entrar.">
                    <Select value={info.metodo_identificacao} onValueChange={(v) => set('metodo_identificacao', v)} items={{ email: 'Somente e-mail', email_cpf: 'E-mail + CPF', email_telefone: 'E-mail + telefone' }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Somente e-mail</SelectItem>
                        <SelectItem value="email_cpf">E-mail + CPF</SelectItem>
                        <SelectItem value="email_telefone">E-mail + telefone</SelectItem>
                      </SelectContent>
                    </Select>
                  </Campo>
                  <ToggleRow label="Área embedável (widget)" desc="Incorpora a prova em outra página via iframe." v={info.embed_ativo} on={(v) => set('embed_ativo', v)} />
                </div>
              </section>
            </div>
          )}

          {/* STEP — Questões (só no modo "do zero") */}
          {atual === 'Questões' && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <Secao icon={FileText} titulo="Questões da prova" desc="Selecione as questões que vão compor o simulado." />
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-48 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar questão…" className="pl-9" />
                  </div>
                  <Select value={fDisc} onValueChange={(v) => setFDisc(v ?? '')} items={{ all: 'Todas matérias', ...Object.fromEntries(disciplinas.map((d) => [d.id, d.nome])) }}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas matérias</SelectItem>
                      {disciplinas.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">{qBuscando ? 'Buscando…' : `${qDisp.length} questão(ões) ${tipo === 'discursivo' ? 'discursivas' : 'objetivas'}${qDisp.length >= 40 ? '+' : ''}`} · {sel.size} selecionada(s)</p>
                <div className="max-h-[45vh] overflow-auto rounded-lg border">
                  {qBuscando ? (
                    <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</p>
                  ) : qDisp.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma questão {tipo === 'discursivo' ? 'discursiva' : 'objetiva'} encontrada.</p>
                  ) : qDisp.map((q) => {
                    const on = sel.has(q.id)
                    const enun = q.enunciado.length > 110 ? q.enunciado.slice(0, 110) + '…' : q.enunciado
                    return (
                      <button key={q.id} type="button" onClick={() => toggleQ(q.id)}
                        className={cn('flex w-full items-start gap-3 border-b p-3 text-left last:border-0 hover:bg-muted', on && 'bg-primary/5')}>
                        <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="mb-0.5 flex flex-wrap gap-1.5 text-xs">
                            {q.disciplina && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase text-primary">{q.disciplina}</span>}
                            {q.banca && <span className="text-muted-foreground">{q.banca}</span>}
                          </span>
                          <span className="block text-sm">{enun}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

          {/* STEP — Estudantes (só no modo "do zero") */}
          {atual === 'Estudantes' && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <Secao icon={Users} titulo="Estudantes" desc="Quem será matriculado no simulado ao criar. (Opcional.)" tone="ok" />
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="relative min-w-48 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={buscaEst} onChange={(e) => setBuscaEst(e.target.value)} placeholder="Buscar estudante…" className="pl-9" />
                  </div>
                  <button type="button" onClick={selecionarTodos} disabled={estBuscando}
                    className="rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
                    {todosSelecionados ? 'Limpar seleção' : 'Selecionar todos'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{estTotal} estudante(s){buscaEst.trim() && ' encontrados'} · {estSel.size} selecionado(s) para matricular</p>
                <div className="max-h-[45vh] overflow-auto rounded-lg border">
                  {estBuscando ? (
                    <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</p>
                  ) : estDisp.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Nenhum estudante encontrado.</p>
                  ) : estDisp.map((e) => {
                    const on = estSel.has(e.id)
                    return (
                      <button key={e.id} type="button" onClick={() => toggleE(e.id)}
                        className={cn('flex w-full items-center gap-3 border-b p-3 text-left last:border-0 hover:bg-muted', on && 'bg-primary/5')}>
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{e.nome}</span>
                          {e.email && <span className="block truncate text-xs text-muted-foreground">{e.email}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

          {/* STEP — Regras */}
          {atual === 'Regras' && (
            <div className="space-y-4">
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <Secao icon={Settings2} titulo="Comportamento da prova" desc="Regras aplicadas durante a execução." />
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  <ToggleRow label="Embaralhar questões" desc="Cada aluno recebe uma ordem diferente." v={regras.embaralhar_questoes} on={(v) => setR('embaralhar_questoes', v)} />
                  <ToggleRow label="Embaralhar alternativas" desc="Reduz cópia entre alunos." v={regras.embaralhar_alternativas} on={(v) => setR('embaralhar_alternativas', v)} dim={tipo === 'discursivo'} />
                  <ToggleRow label="Revisão antes de enviar" desc="Mostra o resumo das respostas." v={regras.revisao_antes_enviar} on={(v) => setR('revisao_antes_enviar', v)} />
                  <ToggleRow label="Exibir nota ao aluno" desc="Nota aparece assim que envia." v={regras.exibir_nota} on={(v) => setR('exibir_nota', v)} />
                  <ToggleRow label="Mostrar comentário do professor" desc="Exibe o comentário junto do gabarito." v={regras.mostrar_comentario} on={(v) => setR('mostrar_comentario', v)} />
                  <div className="space-y-2">
                    <ToggleRow label="Permitir iniciar atrasado" desc="Aluno entra após o início da janela." v={regras.iniciar_atrasado} on={(v) => setR('iniciar_atrasado', v)} />
                    {regras.iniciar_atrasado && (
                      <div className="flex items-center gap-1.5 pl-1">
                        <Label className="whitespace-nowrap text-xs text-muted-foreground">até</Label>
                        <Input type="number" min={1} value={regras.tolerancia_atraso_min} onChange={(e) => setR('tolerancia_atraso_min', e.target.value)} placeholder="30" className="h-8 w-20" />
                        <span className="text-xs text-muted-foreground">min de atraso</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <Secao icon={Trophy} titulo="Tentativas e pontuação" desc="Define como a nota é calculada." tone="info" />
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo label="Tentativas permitidas">
                    <Input type="number" min={1} value={regras.retentativas_ilimitadas ? '' : regras.retentativas} onChange={(e) => setR('retentativas', e.target.value)} disabled={regras.retentativas_ilimitadas} placeholder={regras.retentativas_ilimitadas ? 'Ilimitadas' : '1'} />
                    <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={!!regras.retentativas_ilimitadas} onChange={(e) => setR('retentativas_ilimitadas', e.target.checked)} className="h-3.5 w-3.5 rounded border accent-[var(--primary)]" />
                      Ilimitadas
                    </label>
                  </Campo>
                  <Campo label="Política de nota" hint={regras.retentativas_ilimitadas ? 'Considera todas as tentativas.' : 'Com 1 tentativa, é indiferente.'}>
                    <Select value={regras.politica_nota} onValueChange={(v) => setR('politica_nota', v)} items={{ ultima: 'Última', melhor: 'Maior', media: 'Média' }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="ultima">Última tentativa</SelectItem><SelectItem value="melhor">Maior nota</SelectItem><SelectItem value="media">Média</SelectItem></SelectContent>
                    </Select>
                  </Campo>
                  <Campo label="Tempo por questão (seg)"><Input type="number" min={0} value={regras.tempo_por_questao_seg} onChange={(e) => setR('tempo_por_questao_seg', e.target.value)} placeholder="opcional" /></Campo>
                  <Campo label="Peso padrão das questões"><Input type="number" min={1} value={regras.peso_padrao} onChange={(e) => setR('peso_padrao', e.target.value)} /></Campo>
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <Secao icon={ShieldCheck} titulo="Liberações para o aluno" desc="Quando cada item fica visível após o envio." tone="warn" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SegCard label="Liberar nota" hint="Quando o aluno vê a pontuação." value={regras.liberar_nota} onChange={(v) => setR('liberar_nota', v)} options={LIB_OPTS} />
                  <SegCard label="Liberar gabarito" hint="Respostas corretas e justificativas." value={regras.liberar_gabarito} onChange={(v) => setR('liberar_gabarito', v)} options={LIB_OPTS} />
                  <SegCard label="Liberar caderno (PDF)" hint="Download da prova completa." value={regras.liberar_caderno} onChange={(v) => setR('liberar_caderno', v)} options={LIB_OPTS} />
                  <SegCard label="Público do caderno" hint="Quem consegue baixar o caderno." value={regras.caderno_publico} onChange={(v) => setR('caderno_publico', v)} options={[{ v: 'todos', label: 'Todos' }, { v: 'passaporte', label: 'Passaporte' }]} />
                </div>
                <div className="mt-3">
                  <ToggleRow label="Caderno de questões (sem respostas)" desc="Deixa o aluno baixar a prova sem gabarito antes de iniciar (aparece ao lado do botão de iniciar)." v={regras.enunciado_liberado} on={(v) => setR('enunciado_liberado', v)} />
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Barra lateral: Resumo + Checklist */}
        <aside className="space-y-3 lg:sticky lg:top-4">
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">Resumo</span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                pronto ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-500')}>
                {pronto ? 'Pronto' : 'Pendente'}
              </span>
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Banco de origem</p>
              <p className="text-[13px] font-bold leading-snug">{resumoBanco}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label="Questões" valor={qtdQuestoes ? nf(qtdQuestoes) : '—'} />
              <MiniStat label="Estudantes" valor={nf(estudantesResumo)} />
              <MiniStat label="Tentativas" valor={regras.retentativas_ilimitadas ? '∞' : String(regras.retentativas || 1)} />
              <MiniStat label="Regras ativas" valor={String(rulesAtivas)} />
            </div>
            <div className="mt-3 space-y-1.5 border-t pt-3">
              <ResumoLinha label="Tipo" valor={tipo ? (tipo === 'discursivo' ? 'Discursiva' : 'Objetiva') : 'Objetiva'} />
              <ResumoLinha label="Aplicação" valor={modoLabel[info.modo_aplicacao]} />
              <ResumoLinha label="Política de nota" valor={politicaLabel[regras.politica_nota]} />
              <ResumoLinha label="Nota" valor={liberarLabel[regras.liberar_nota]} />
              <ResumoLinha label="Gabarito" valor={liberarLabel[regras.liberar_gabarito]} />
              <ResumoLinha label="Caderno" valor={liberarLabel[regras.liberar_caderno]} />
            </div>
            <button type="button" onClick={ultimo ? finalizar : avancar} disabled={ultimo ? criando : !podeAvancar()}
              className={cn('mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50',
                ultimo ? 'bg-emerald-600' : 'bg-primary')}>
              {ultimo && criando && <Loader2 className="h-4 w-4 animate-spin" />}
              {ultimo ? 'Criar simulado' : 'Próximo'}
            </button>
          </section>

          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <span className="text-sm font-bold">Checklist</span>
            <div className="mt-3 space-y-2.5">
              {checklist.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full',
                    c.ok ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-500')}>
                    {c.ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  </span>
                  <span className={cn('text-[12.5px]', c.ok ? 'text-muted-foreground' : 'text-foreground')}>{c.text}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Secao({ icon: Icon, titulo, desc, tone = 'accent' }: { icon: React.ComponentType<{ className?: string }>; titulo: string; desc?: string; tone?: 'accent' | 'info' | 'ok' | 'warn' }) {
  const tones = {
    accent: 'bg-primary/10 text-primary',
    info: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
    ok: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-500',
  }
  return (
    <div className="flex items-center gap-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tones[tone])}><Icon className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-tight">{titulo}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
    </div>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{children}</span>
}

function Campo({ label, obrigatorio, hint, children }: { label: string; obrigatorio?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <Rotulo>{label} {obrigatorio && <span className="text-destructive">*</span>}</Rotulo>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

function ToggleRow({ label, desc, v, on, dim }: { label: string; desc?: string; v: boolean; on: (v: boolean) => void; dim?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3 transition-colors', v ? 'border-primary/50 bg-primary/5' : 'bg-muted/30', dim && 'opacity-50')}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold">{label}</p>
        {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={!!v} onCheckedChange={on} />
    </div>
  )
}

function SegCard({ label, hint, value, onChange, options }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: { v: string; label: string }[] }) {
  return (
    <div className="grid gap-2 rounded-xl border bg-muted/20 p-3">
      <span className="text-[12.5px] font-bold">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o.v
          return (
            <button key={o.v} type="button" onClick={() => onChange(o.v)}
              className={cn('h-7 rounded-lg border px-2.5 text-xs font-bold transition-colors',
                on ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
              {o.label}
            </button>
          )
        })}
      </div>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

function MiniStat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl border border-border/60 bg-muted/30 p-2.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono text-[15px] font-extrabold">{valor}</span>
    </div>
  )
}

function ResumoLinha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-[12.5px] font-bold">{valor}</span>
    </div>
  )
}
