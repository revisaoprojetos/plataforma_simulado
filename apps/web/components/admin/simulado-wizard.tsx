'use client'

import { useState, useTransition, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ListChecks, PenLine, Check, ChevronLeft, ChevronRight, Loader2, Search, Settings2, Users, Sparkles, FileText, CalendarClock, ShieldCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { toast } from 'sonner'

interface Questao { id: string; enunciado: string; tipo: string; nivel_dificuldade?: string | null; disciplina?: string | null; banca?: string | null; bancoIds: string[] }
interface Banco { id: string; nome: string; cor?: string | null; icone?: string | null; capa?: string | null; tipo?: string | null; nQuestoes?: number; nEstudantes?: number }
interface Estudante { id: string; nome: string; email?: string | null }

// No modo "banco" o tipo já vem do banco → não há etapa "Tipo".
const PASSOS_BANCO = ['Banco', 'Informações', 'Regras']
const PASSOS_ZERO = ['Banco', 'Tipo', 'Informações', 'Questões', 'Estudantes', 'Regras']

export function SimuladoWizard({
  bancos,
  questoes,
  ordemPorBanco = {},
  estudantes,
  onSubmit,
}: {
  bancos: Banco[]
  questoes: Questao[]
  /** Ordem manual das questões por banco (id do banco → lista de questao_id na ordem exibida). */
  ordemPorBanco?: Record<string, string[]>
  estudantes: Estudante[]
  onSubmit: (data: any) => Promise<{ error?: string } | void>
}) {
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
    embaralhar_questoes: true, embaralhar_alternativas: true, revisao_antes_enviar: true,
    retentativas: 1, politica_nota: 'ultima',
    liberar_nota: 'manual', liberar_gabarito: 'manual', liberar_caderno: 'manual', caderno_publico: 'todos',
    iniciar_atrasado: false, tempo_por_questao_seg: '', exibir_nota: true, mostrar_comentario: true, peso_padrao: 1,
  })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [estSel, setEstSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [buscaEst, setBuscaEst] = useState('')
  const [buscaBanco, setBuscaBanco] = useState('')
  const [fBanco, setFBanco] = useState('all')
  const [fDisc, setFDisc] = useState('all')

  const bancosFiltrados = useMemo(() => {
    const s = buscaBanco.toLowerCase().trim()
    return s ? bancos.filter((b) => b.nome.toLowerCase().includes(s)) : bancos
  }, [bancos, buscaBanco])

  const passos = modo === 'banco' ? PASSOS_BANCO : PASSOS_ZERO
  const atual = passos[step]

  const tipoQuestao = tipo === 'discursivo' ? 'discursiva' : 'objetiva'
  const disponiveis = useMemo(() => questoes.filter((q) => q.tipo === tipoQuestao), [questoes, tipoQuestao])
  const disciplinas = useMemo(() => [...new Set(disponiveis.map((q) => q.disciplina).filter(Boolean))].sort() as string[], [disponiveis])

  // Questões do banco base (do tipo escolhido) — usadas no modo "banco".
  // Respeita a ordem manual do banco (arrastar); o restante segue a ordem de leitura
  // (created_at ASC, já vinda do servidor). Assim a prova herda a mesma ordem do banco.
  const questoesDoBanco = useMemo(() => {
    if (!bancoBase) return []
    const doBanco = disponiveis.filter((q) => q.bancoIds.includes(bancoBase))
    const ordem = ordemPorBanco[bancoBase]
    if (ordem?.length) {
      const pos = new Map(ordem.map((qid, i) => [qid, i]))
      const FIM = Number.MAX_SAFE_INTEGER
      return [...doBanco].sort((a, b) => (pos.get(a.id) ?? FIM) - (pos.get(b.id) ?? FIM))
    }
    return doBanco
  }, [disponiveis, bancoBase, ordemPorBanco])
  const qtdQuestoes = modo === 'banco' ? questoesDoBanco.length : sel.size
  const bancoAtual = bancos.find((b) => b.id === bancoBase)

  const filtradas = useMemo(() => {
    const s = busca.toLowerCase().trim()
    return disponiveis.filter((q) => {
      if (fBanco !== 'all' && !q.bancoIds.includes(fBanco)) return false
      if (fDisc !== 'all' && q.disciplina !== fDisc) return false
      if (s && !(`${q.enunciado} ${q.disciplina ?? ''} ${q.banca ?? ''}`.toLowerCase().includes(s))) return false
      return true
    })
  }, [disponiveis, busca, fBanco, fDisc])

  const estFiltrados = useMemo(() => {
    const s = buscaEst.toLowerCase().trim()
    return s ? estudantes.filter((e) => `${e.nome} ${e.email ?? ''}`.toLowerCase().includes(s)) : estudantes
  }, [estudantes, buscaEst])

  const set = (k: string, v: any) => setInfo((p) => ({ ...p, [k]: v }))
  const setR = (k: string, v: any) => setRegras((p) => ({ ...p, [k]: v }))
  const toggleQ = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleE = (id: string) => setEstSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  function podeAvancar() {
    if (atual === 'Banco') return modo !== null
    if (atual === 'Tipo') return !!tipo
    if (atual === 'Informações') return info.titulo.trim().length > 2
    return true
  }

  function finalizar() {
    start(async () => {
      const questaoIds = modo === 'banco' ? questoesDoBanco.map((q) => q.id) : [...sel]
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
          retentativas: Number(regras.retentativas) || 1,
          peso_padrao: Number(regras.peso_padrao) || 1,
          tempo_por_questao_seg: regras.tempo_por_questao_seg ? Number(regras.tempo_por_questao_seg) : null,
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

  return (
    <div className="space-y-5">
      {/* Stepper — só aparece depois de sair do passo inicial (Banco) */}
      {atual !== 'Banco' && (
        <div className="flex flex-wrap items-center gap-2">
          {passos.map((p, i) => (
            <div key={p} className="flex items-center gap-2">
              <div className={cn('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                i < step ? 'bg-primary text-primary-foreground' : i === step ? 'border-2 border-primary text-primary' : 'border text-muted-foreground')}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn('text-sm', i === step ? 'font-semibold' : 'text-muted-foreground')}>{p}</span>
              {i < passos.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardContent className={cn('p-6', atual === 'Banco' && 'pt-0 pb-5')}>
          {/* Navegação no topo (o passo Banco usa o "Próximo" do cabeçalho) */}
          {atual !== 'Banco' && (
            <div className="mb-5 flex items-center justify-between border-b pb-4">
              <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              {step < passos.length - 1 ? (
                <Button onClick={() => podeAvancar() ? setStep((s) => s + 1) : toast.error(atual === 'Informações' ? 'Informe um título.' : 'Escolha o tipo.')} disabled={!podeAvancar()}>
                  Próximo <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={finalizar} disabled={pending}>
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Criar simulado
                </Button>
              )}
            </div>
          )}
          <div key={step} className="animate-rise">

          {/* STEP — Banco (ponto de partida) */}
          {atual === 'Banco' && (
            <div className="space-y-3">
              {/* Cabeçalho: título à esquerda, "Criar do zero" + Próximo no canto direito */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Comece a partir de um banco pronto</p>
                  <p className="text-sm text-muted-foreground">Ao escolher um banco, o simulado já herda as <b>questões</b> e os <b>estudantes</b> vinculados — é só ajustar as informações e regras.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => { setModo('zero'); setBancoBase(null) }}
                    className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border-2 px-3 text-sm font-semibold transition-all', modo === 'zero' ? 'border-primary bg-primary/5 text-primary' : 'hover:border-primary/40')}>
                    <Sparkles className="h-4 w-4" /> Criar do zero
                    {modo === 'zero' && <Check className="h-4 w-4" />}
                  </button>
                  <Button onClick={() => podeAvancar() ? setStep((s) => s + 1) : toast.error('Escolha um banco ou "Criar do zero".')} disabled={!podeAvancar()}>
                    Próximo <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={buscaBanco} onChange={(e) => setBuscaBanco(e.target.value)} placeholder="Buscar banco…" className="pl-8" />
              </div>

              {/* Cards pôster roláveis — o cabeçalho e a busca ficam fixos acima */}
              <div className="scroll-claro max-h-[calc(100vh-280px)] overflow-y-auto p-1.5">
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {bancosFiltrados.length === 0 ? (
                  <p className="col-span-full rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">{bancos.length === 0 ? 'Nenhum banco criado ainda. Use "Criar do zero".' : 'Nenhum banco encontrado.'}</p>
                ) : bancosFiltrados.map((b) => {
                  const on = modo === 'banco' && bancoBase === b.id
                  const Icon = iconeBanco(b.icone)
                  const c = b.cor ?? '#6d28d9'
                  const discursiva = b.tipo === 'discursiva'
                  return (
                    <button key={b.id} type="button" onClick={() => { setModo('banco'); setBancoBase(b.id); setTipo(discursiva ? 'discursivo' : 'objetivo') }}
                      className={cn('group relative aspect-square overflow-hidden rounded-2xl border text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg',
                        on ? 'border-primary ring-2 ring-primary' : 'border-border')}>
                      {/* Fundo: capa preenchendo o card (ou degradê da cor) */}
                      {b.capa ? (
                        <img src={b.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
                      )}
                      {!b.capa && <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
                      {/* Degradê para legibilidade do texto */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

                      {/* Chip do ícone (topo esquerdo) */}
                      <span className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: c }}><Icon className="h-4 w-4" /></span>
                      {on && <span className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"><Check className="h-4 w-4" /></span>}

                      {/* Título + chips (rodapé) */}
                      <div className="absolute inset-x-0 bottom-0 z-10 p-3">
                        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{b.nome}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                            {discursiva ? <PenLine className="h-3 w-3" /> : <ListChecks className="h-3 w-3" />}{discursiva ? 'Discursiva' : 'Objetiva'}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur" title={`${b.nQuestoes ?? 0} questão(ões)`}><FileText className="h-3 w-3" />{b.nQuestoes ?? 0}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur" title={`${b.nEstudantes ?? 0} estudante(s)`}><Users className="h-3 w-3" />{b.nEstudantes ?? 0}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
                </div>
              </div>
            </div>
          )}

          {/* STEP — Tipo */}
          {atual === 'Tipo' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Que tipo de prova será este simulado?</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {([['objetivo', ListChecks, 'Objetivo', 'Questões de múltipla escolha (A–E), correção automática.'],
                   ['discursivo', PenLine, 'Discursivo', 'Questões dissertativas, correção manual por competências.']] as const)
                  .filter(([val]) => !OCULTAR_DISCURSIVA || val !== 'discursivo').map(([val, Icon, titulo, desc]) => (
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
                <p className="text-xs text-muted-foreground">Serão herdadas as questões <b>{tipoQuestao}s</b> do banco {bancoAtual?.nome} ({questoesDoBanco.length}).</p>
              )}
            </div>
          )}

          {/* STEP — Informações */}
          {atual === 'Informações' && (
            <div className="space-y-6" data-tour="wizard-info">
              {/* Identificação da prova */}
              <div className="space-y-4">
                <SecaoTitulo icon={FileText} titulo="Identificação da prova" />
                <div className="space-y-2"><Label>Título *</Label><Input value={info.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ex.: Simulado PGE — 1ª fase" /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Descrição</Label><Textarea value={info.descricao} onChange={(e) => set('descricao', e.target.value)} rows={3} placeholder="Breve resumo da prova (opcional)" /></div>
                  <div className="space-y-2">
                    <Label>Instruções ao aluno</Label>
                    <Textarea value={info.instrucoes} onChange={(e) => set('instrucoes', e.target.value)} rows={3} placeholder="Ex.: Leia com atenção. Sem consulta." />
                    <p className="text-xs text-muted-foreground">Exibidas antes de iniciar a prova.</p>
                  </div>
                </div>
              </div>

              {/* Aplicação e prazos */}
              <div className="space-y-4 border-t pt-5">
                <SecaoTitulo icon={CalendarClock} titulo="Aplicação e prazos" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2" data-tour="modo-aplicacao">
                    <Label>Modo de aplicação</Label>
                    <Select value={info.modo_aplicacao} onValueChange={(v) => set('modo_aplicacao', v)} items={{ janela_fixa: 'Agendado', prazo_relativo: 'Prazo (data de entrega)', aberto: 'Aberto' }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="min-w-[16rem]">
                        <SelectItem value="janela_fixa">Agendado (data e hora)</SelectItem>
                        <SelectItem value="prazo_relativo">Prazo (data de entrega)</SelectItem>
                        <SelectItem value="aberto">Aberto (sempre disponível)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tempo limite (min)</Label>
                    <Input type="number" min={0} value={info.tempo_limite_min} onChange={(e) => set('tempo_limite_min', e.target.value)} placeholder="ex.: 180" />
                    <p className="text-xs text-muted-foreground">Em branco = sem limite individual.</p>
                  </div>
                </div>
                {info.modo_aplicacao === 'janela_fixa' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Início</Label><Input type="datetime-local" value={info.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></div>
                    <div className="space-y-2"><Label>Fim</Label><Input type="datetime-local" value={info.data_fim} onChange={(e) => set('data_fim', e.target.value)} /></div>
                  </div>
                )}
                {info.modo_aplicacao === 'prazo_relativo' && (
                  <div className="space-y-2">
                    <Label>Prazo para concluir</Label>
                    <div className="flex flex-wrap gap-2">
                      <Input type="number" min={1} value={info.prazo_valor} onChange={(e) => set('prazo_valor', e.target.value)} placeholder="ex.: 7" className="w-28" />
                      <Select value={info.prazo_unidade} onValueChange={(v) => set('prazo_unidade', v)} items={{ horas: 'Horas', dias: 'Dias', meses: 'Meses' }}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="horas">Horas</SelectItem><SelectItem value="dias">Dias</SelectItem><SelectItem value="meses">Meses</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">Contado a partir da liberação do acesso de cada aluno.</p>
                  </div>
                )}
                {info.modo_aplicacao === 'aberto' && (
                  <p className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><Info className="h-4 w-4 shrink-0" /> Aberto: sempre disponível, sem data ou prazo — o aluno faz a qualquer momento.</p>
                )}
              </div>

              {/* Acesso do aluno */}
              <div className="space-y-4 border-t pt-5">
                <SecaoTitulo icon={ShieldCheck} titulo="Acesso do aluno" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Identificação do aluno</Label>
                    <Select value={info.metodo_identificacao} onValueChange={(v) => set('metodo_identificacao', v)} items={{ email: 'Somente e-mail', email_cpf: 'E-mail + CPF', email_telefone: 'E-mail + telefone' }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Somente e-mail</SelectItem>
                        <SelectItem value="email_cpf">E-mail + CPF</SelectItem>
                        <SelectItem value="email_telefone">E-mail + telefone</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Como o aluno se identifica para entrar.</p>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-lg border p-3">
                    <Switch checked={info.embed_ativo} onCheckedChange={(v) => set('embed_ativo', v)} id="embed" className="mt-0.5" />
                    <Label htmlFor="embed" className="cursor-pointer">
                      <span className="block font-medium">Área embedável (widget)</span>
                      <span className="block text-xs font-normal text-muted-foreground">Incorpora a prova em outra página via iframe.</span>
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP — Questões (só no modo "do zero") */}
          {atual === 'Questões' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-48 flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar questão…" className="pl-8" />
                </div>
                <Select value={fBanco} onValueChange={(v) => setFBanco(v ?? '')} items={{ all: 'Todos bancos', ...Object.fromEntries(bancos.map((b) => [b.id, b.nome])) }}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos bancos</SelectItem>
                    {bancos.map((b) => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fDisc} onValueChange={(v) => setFDisc(v ?? '')} items={{ all: 'Todas matérias', ...Object.fromEntries(disciplinas.map((d) => [d, d])) }}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas matérias</SelectItem>
                    {disciplinas.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">{filtradas.length} questão(ões) {tipo === 'discursivo' ? 'discursivas' : 'objetivas'} disponíveis · {sel.size} selecionada(s)</p>
              <div className="max-h-[45vh] overflow-auto rounded-lg border">
                {filtradas.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma questão {tipo === 'discursivo' ? 'discursiva' : 'objetiva'} encontrada nos bancos.</p>
                ) : filtradas.map((q) => {
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
          )}

          {/* STEP — Estudantes (só no modo "do zero") */}
          {atual === 'Estudantes' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative min-w-48 flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={buscaEst} onChange={(e) => setBuscaEst(e.target.value)} placeholder="Buscar estudante…" className="pl-8" />
                </div>
                <Button type="button" variant="outline" size="sm"
                  onClick={() => setEstSel((p) => p.size === estudantes.length ? new Set() : new Set(estudantes.map((e) => e.id)))}>
                  {estSel.size === estudantes.length && estudantes.length > 0 ? 'Limpar seleção' : 'Selecionar todos'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{estFiltrados.length} estudante(s) · {estSel.size} selecionado(s) para matricular</p>
              <div className="max-h-[45vh] overflow-auto rounded-lg border">
                {estFiltrados.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Nenhum estudante encontrado.</p>
                ) : estFiltrados.map((e) => {
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
              <p className="text-xs text-muted-foreground">Os selecionados serão matriculados no simulado ao criar. (Opcional — dá para matricular depois.)</p>
            </div>
          )}

          {/* STEP — Regras */}
          {atual === 'Regras' && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Toggle label="Embaralhar questões" v={regras.embaralhar_questoes} on={(v) => setR('embaralhar_questoes', v)} />
                <Toggle label="Embaralhar alternativas" v={regras.embaralhar_alternativas} on={(v) => setR('embaralhar_alternativas', v)} dim={tipo === 'discursivo'} />
                <Toggle label="Revisão antes de enviar" v={regras.revisao_antes_enviar} on={(v) => setR('revisao_antes_enviar', v)} />
                <Toggle label="Permitir iniciar atrasado" v={regras.iniciar_atrasado} on={(v) => setR('iniciar_atrasado', v)} />
                <Toggle label="Exibir nota ao aluno" v={regras.exibir_nota} on={(v) => setR('exibir_nota', v)} />
                <Toggle label="Mostrar comentário do professor" v={regras.mostrar_comentario} on={(v) => setR('mostrar_comentario', v)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2"><Label>Tentativas permitidas</Label><Input type="number" min={1} value={regras.retentativas} onChange={(e) => setR('retentativas', e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Política de nota</Label>
                  <Select value={regras.politica_nota} onValueChange={(v) => setR('politica_nota', v)} items={{ ultima: 'Última', melhor: 'Melhor', media: 'Média' }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ultima">Última tentativa</SelectItem><SelectItem value="melhor">Melhor nota</SelectItem><SelectItem value="media">Média</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Tempo por questão (seg)</Label><Input type="number" min={0} value={regras.tempo_por_questao_seg} onChange={(e) => setR('tempo_por_questao_seg', e.target.value)} placeholder="opcional" /></div>
                <div className="space-y-2"><Label>Peso padrão das questões</Label><Input type="number" min={1} value={regras.peso_padrao} onChange={(e) => setR('peso_padrao', e.target.value)} /></div>
              </div>

              {/* Liberações independentes: nota, gabarito e caderno */}
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Liberações para o aluno</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Liberar nota</Label>
                    <Select value={regras.liberar_nota} onValueChange={(v) => setR('liberar_nota', v)} items={{ imediato: 'Imediato', apos_janela: 'Após janela', manual: 'Manual' }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="imediato">Imediato</SelectItem><SelectItem value="apos_janela">Após janela</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Liberar gabarito</Label>
                    <Select value={regras.liberar_gabarito} onValueChange={(v) => setR('liberar_gabarito', v)} items={{ imediato: 'Imediato', apos_janela: 'Após janela', manual: 'Manual' }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="imediato">Imediato</SelectItem><SelectItem value="apos_janela">Após janela</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Liberar caderno (PDF)</Label>
                    <Select value={regras.liberar_caderno} onValueChange={(v) => setR('liberar_caderno', v)} items={{ imediato: 'Imediato', apos_janela: 'Após janela', manual: 'Manual' }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="imediato">Imediato</SelectItem><SelectItem value="apos_janela">Após janela</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Público do caderno</Label>
                    <Select value={regras.caderno_publico} onValueChange={(v) => setR('caderno_publico', v)} items={{ todos: 'Todos os alunos', passaporte: 'Só passaporte' }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="todos">Todos os alunos</SelectItem><SelectItem value="passaporte">Só passaporte</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                <Settings2 className="mr-1 inline h-4 w-4" /> Resumo: simulado <strong className="text-foreground">{tipo}</strong> · {qtdQuestoes} questão(ões) · modo {info.modo_aplicacao.replace('_', ' ')}
                {modo === 'banco' && bancoAtual ? <> · herda <strong className="text-foreground">{bancoAtual.nEstudantes ?? 0} estudante(s)</strong> do banco {bancoAtual.nome}</> : ''}
                {modo === 'zero' && estSel.size > 0 ? <> · matricula <strong className="text-foreground">{estSel.size} estudante(s)</strong></> : ''}
              </div>
            </div>
          )}
          </div>
        </CardContent>
      </Card>

    </div>
  )
}

function SecaoTitulo({ icon: Icon, titulo }: { icon: React.ComponentType<{ className?: string }>; titulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      <h3 className="text-sm font-semibold">{titulo}</h3>
    </div>
  )
}

function Toggle({ label, v, on, dim }: { label: string; v: boolean; on: (v: boolean) => void; dim?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', dim && 'opacity-50')}>
      <Switch checked={!!v} onCheckedChange={on} />
      <Label className="cursor-pointer" onClick={() => on(!v)}>{label}</Label>
    </div>
  )
}
