'use client'

import { useState, useTransition, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ListChecks, PenLine, Check, ChevronLeft, ChevronRight, Loader2, Search, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { toast } from 'sonner'

interface Questao { id: string; enunciado: string; tipo: string; nivel_dificuldade?: string | null; disciplina?: string | null; banca?: string | null; bancoIds: string[] }
interface Banco { id: string; nome: string }

const PASSOS = ['Tipo', 'Informações', 'Questões', 'Regras']

export function SimuladoWizard({
  bancos,
  questoes,
  onSubmit,
}: {
  bancos: Banco[]
  questoes: Questao[]
  onSubmit: (data: any) => Promise<{ error?: string } | void>
}) {
  const [step, setStep] = useState(0)
  const [pending, start] = useTransition()

  // Estado
  const [tipo, setTipo] = useState<'objetivo' | 'discursivo' | null>(null)
  const [info, setInfo] = useState({
    titulo: '', descricao: '', modo_aplicacao: 'janela_fixa', data_inicio: '', data_fim: '',
    tempo_limite_min: '', metodo_identificacao: 'email', embed_ativo: false,
  })
  const [regras, setRegras] = useState<Record<string, any>>({
    embaralhar_questoes: true, embaralhar_alternativas: true, revisao_antes_enviar: true,
    retentativas: 1, politica_nota: 'ultima', liberar_gabarito: 'apos_janela',
    iniciar_atrasado: false, tempo_por_questao_seg: '', exibir_nota: true, mostrar_comentario: true, peso_padrao: 1,
  })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [fBanco, setFBanco] = useState('all')
  const [fDisc, setFDisc] = useState('all')

  const tipoQuestao = tipo === 'discursivo' ? 'discursiva' : 'objetiva'
  const disponiveis = useMemo(() => questoes.filter((q) => q.tipo === tipoQuestao), [questoes, tipoQuestao])
  const disciplinas = useMemo(() => [...new Set(disponiveis.map((q) => q.disciplina).filter(Boolean))].sort() as string[], [disponiveis])

  const filtradas = useMemo(() => {
    const s = busca.toLowerCase().trim()
    return disponiveis.filter((q) => {
      if (fBanco !== 'all' && !q.bancoIds.includes(fBanco)) return false
      if (fDisc !== 'all' && q.disciplina !== fDisc) return false
      if (s && !(`${q.enunciado} ${q.disciplina ?? ''} ${q.banca ?? ''}`.toLowerCase().includes(s))) return false
      return true
    })
  }, [disponiveis, busca, fBanco, fDisc])

  const set = (k: string, v: any) => setInfo((p) => ({ ...p, [k]: v }))
  const setR = (k: string, v: any) => setRegras((p) => ({ ...p, [k]: v }))
  const toggleQ = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  function podeAvancar() {
    if (step === 0) return !!tipo
    if (step === 1) return info.titulo.trim().length > 2
    return true
  }

  function finalizar() {
    start(async () => {
      const data = {
        titulo: info.titulo.trim(),
        descricao: info.descricao.trim() || undefined,
        modo_aplicacao: info.modo_aplicacao,
        data_inicio: info.modo_aplicacao === 'janela_fixa' ? info.data_inicio || undefined : undefined,
        data_fim: info.modo_aplicacao === 'janela_fixa' ? info.data_fim || undefined : undefined,
        tempo_limite_min: info.tempo_limite_min ? Number(info.tempo_limite_min) : undefined,
        metodo_identificacao: info.metodo_identificacao,
        embed_ativo: info.embed_ativo,
        regras: { ...regras, tipo, retentativas: Number(regras.retentativas) || 1, peso_padrao: Number(regras.peso_padrao) || 1, tempo_por_questao_seg: regras.tempo_por_questao_seg ? Number(regras.tempo_por_questao_seg) : null },
        questaoIds: [...sel],
      }
      const r = await onSubmit(data)
      if (r?.error) toast.error(r.error)
    })
  }

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {PASSOS.map((p, i) => (
          <div key={p} className="flex items-center gap-2">
            <div className={cn('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
              i < step ? 'bg-primary text-primary-foreground' : i === step ? 'border-2 border-primary text-primary' : 'border text-muted-foreground')}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('text-sm', i === step ? 'font-semibold' : 'text-muted-foreground')}>{p}</span>
            {i < PASSOS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <div key={step} className="animate-rise">
          {/* STEP 0 — Tipo */}
          {step === 0 && (
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
            </div>
          )}

          {/* STEP 1 — Informações */}
          {step === 1 && (
            <div className="space-y-4" data-tour="wizard-info">
              <div className="space-y-2"><Label>Título *</Label><Input value={info.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ex.: Simulado PGE — 1ª fase" /></div>
              <div className="space-y-2"><Label>Descrição</Label><Textarea value={info.descricao} onChange={(e) => set('descricao', e.target.value)} rows={2} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2" data-tour="modo-aplicacao">
                  <Label>Modo de aplicação</Label>
                  <Select value={info.modo_aplicacao} onValueChange={(v) => set('modo_aplicacao', v)} items={{ janela_fixa: 'Janela fixa', prazo_relativo: 'Prazo relativo', aberto: 'Aberto' }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="janela_fixa">Janela fixa (agendado)</SelectItem>
                      <SelectItem value="prazo_relativo">Prazo relativo (avulso)</SelectItem>
                      <SelectItem value="aberto">Aberto (sempre disponível)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tempo limite (min)</Label>
                  <Input type="number" min={0} value={info.tempo_limite_min} onChange={(e) => set('tempo_limite_min', e.target.value)} placeholder="ex.: 180" />
                </div>
              </div>
              {info.modo_aplicacao === 'janela_fixa' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Início</Label><Input type="datetime-local" value={info.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Fim</Label><Input type="datetime-local" value={info.data_fim} onChange={(e) => set('data_fim', e.target.value)} /></div>
                </div>
              )}
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
                </div>
                <div className="flex items-center gap-2 pt-7">
                  <Switch checked={info.embed_ativo} onCheckedChange={(v) => set('embed_ativo', v)} id="embed" />
                  <Label htmlFor="embed">Habilitar área embedável (widget)</Label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 — Questões (dos bancos) */}
          {step === 2 && (
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

          {/* STEP 3 — Regras */}
          {step === 3 && (
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
                <div className="space-y-2">
                  <Label>Liberar gabarito</Label>
                  <Select value={regras.liberar_gabarito} onValueChange={(v) => setR('liberar_gabarito', v)} items={{ imediato: 'Imediato', apos_janela: 'Após janela', manual: 'Manual' }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="imediato">Imediato</SelectItem><SelectItem value="apos_janela">Após janela</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Tempo por questão (seg)</Label><Input type="number" min={0} value={regras.tempo_por_questao_seg} onChange={(e) => setR('tempo_por_questao_seg', e.target.value)} placeholder="opcional" /></div>
                <div className="space-y-2"><Label>Peso padrão das questões</Label><Input type="number" min={1} value={regras.peso_padrao} onChange={(e) => setR('peso_padrao', e.target.value)} /></div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                <Settings2 className="mr-1 inline h-4 w-4" /> Resumo: simulado <strong className="text-foreground">{tipo}</strong> · {sel.size} questão(ões) · modo {info.modo_aplicacao.replace('_', ' ')}
              </div>
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      {/* Navegação */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        {step < PASSOS.length - 1 ? (
          <Button onClick={() => podeAvancar() ? setStep((s) => s + 1) : toast.error(step === 1 ? 'Informe um título.' : 'Escolha o tipo.')} disabled={!podeAvancar()}>
            Próximo <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finalizar} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Criar simulado
          </Button>
        )}
      </div>
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
