'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Plus, X, Zap, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ParamsAdaptativo } from '@/lib/cronograma/adaptativo/params'
import { salvarPainelMetas, type PainelMetas } from '../actions'

type NumKey = { [K in keyof ParamsAdaptativo]: ParamsAdaptativo[K] extends number ? K : never }[keyof ParamsAdaptativo]
type SetFn = <K extends keyof ParamsAdaptativo>(k: K, v: ParamsAdaptativo[K]) => void
type Ctx = { p: ParamsAdaptativo; padrao: ParamsAdaptativo; set: SetFn }

function Bloco({ titulo, desc, children }: { titulo: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">{children}</div>
    </section>
  )
}

// Campo numérico compacto: rótulo pequeno + input com a unidade embutida. Fica no NÍVEL DO MÓDULO
// (definido dentro do componente remontaria a cada tecla e o input perderia o foco).
function Num({ p, padrao, set, k, label, hint, min, max, un }: Ctx & { k: NumKey; label: string; hint?: string; min: number; max: number; un?: string }) {
  const diferente = p[k] !== padrao[k]
  return (
    <label className="block min-w-0" title={hint}>
      <span className="flex items-center justify-between gap-1 text-xs font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        {diferente && (
          <button type="button" onClick={() => set(k, padrao[k] as never)} title={`Restaurar padrão (${padrao[k]})`} aria-label={`Restaurar padrão de ${label}`}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary hover:bg-primary/15">
            <RotateCcw className="h-2.5 w-2.5" />{String(padrao[k])}
          </button>
        )}
      </span>
      <span className={cn('mt-1 flex h-9 items-center rounded-lg border bg-background px-2.5 focus-within:ring-1 focus-within:ring-ring', diferente && 'border-primary/50')}>
        <input type="number" min={min} max={max} value={p[k]}
          onChange={(e) => { const n = Math.trunc(Number(e.target.value)); set(k, (Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao[k]) as never) }}
          className="w-full min-w-0 bg-transparent text-sm tabular-nums outline-none" />
        {un && <span className="ml-1 shrink-0 text-[11px] text-muted-foreground">{un}</span>}
      </span>
    </label>
  )
}

function Chave({ ligado, onChange, titulo, desc }: { ligado: boolean; onChange: (v: boolean) => void; titulo: string; desc: string }) {
  return (
    <div className="col-span-full flex items-start gap-3">
      <button type="button" role="switch" aria-checked={ligado} aria-label={titulo} onClick={() => onChange(!ligado)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition', ligado ? 'bg-primary' : 'bg-muted-foreground/30')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', ligado ? 'left-[18px]' : 'left-0.5')} />
      </button>
      <span><span className="block text-sm font-medium leading-5">{titulo}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
    </div>
  )
}

export function MetasClient({ inicial }: { inicial: PainelMetas }) {
  const router = useRouter()
  const [p, setP] = useState<ParamsAdaptativo>(inicial.params)
  const [novaDisc, setNovaDisc] = useState('')
  const [salvando, setSalvando] = useState(false)
  const padrao = inicial.padrao

  const mudou = JSON.stringify(p) !== JSON.stringify(inicial.params)
  const difPadrao = JSON.stringify(p) !== JSON.stringify(padrao)
  const set: SetFn = (k, v) => setP((c) => ({ ...c, [k]: v }))
  const c = { p, padrao, set }

  async function salvar() {
    setSalvando(true)
    const r = await salvarPainelMetas(p)
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar.'); return }
    toast.success('Configuração das metas salva. Vale para os próximos cronogramas gerados e recalculados.')
    router.refresh()
  }

  function addDisc() {
    const n = novaDisc.trim()
    if (!n || p.semFlash.includes(n)) { setNovaDisc(''); return }
    set('semFlash', [...p.semFlash, n]); setNovaDisc('')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border bg-card px-4 py-2.5 text-sm">
        <span className={cn('inline-flex items-center gap-2 font-medium', difPadrao ? 'text-primary' : 'text-muted-foreground')}>
          <span className={cn('h-2 w-2 rounded-full', difPadrao ? 'bg-primary' : 'bg-muted-foreground/40')} />
          {difPadrao ? 'Personalizado' : 'Padrão do sistema (comportamento atual)'}
        </span>
        <span className="text-xs text-muted-foreground">{inicial.alunosComPlano} alunos com cronograma — vale quando o plano for gerado ou recalculado.</span>
        {inicial.atualizadoEm && <span className="ml-auto text-xs text-muted-foreground">Salvo em {new Date(inicial.atualizadoEm).toLocaleString('pt-BR')}</span>}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Bloco titulo="Tempo e duração das metas" desc="PDFull = páginas ÷ ritmo × 2, em blocos de 30 min. Dia curto não começa PDFull.">
          <Num {...c} k="velPadrao" label="Ritmo padrão" min={5} max={60} un="pág/h" hint="Usado quando o aluno não fez o teste de leitura." />
          <Num {...c} k="diaCurtoMin" label="Dia curto" min={0} max={600} un="min" hint="Dias com menos que isso priorizam questões em vez de começar um PDFull." />
          <span className="hidden sm:block" />
          <Num {...c} k="durFl" label="Revisão" min={10} max={240} un="min" />
          <Num {...c} k="durQu" label="Questões" min={10} max={240} un="min" />
          <Num {...c} k="durLp" label="LegProc" min={10} max={240} un="min" />
          <Num {...c} k="durRf" label="Revisão (sem. especial)" min={10} max={240} un="min" />
          <Num {...c} k="durRq" label="Questões (sem. especial)" min={10} max={240} un="min" />
        </Bloco>

        <Bloco titulo="Revisões, PDFull e semana" desc="Quando a revisão e as questões voltam, quantos PDFulls novos por dia e como a semana se organiza.">
          <Num {...c} k="offsetRevisao" label="Revisão após PDFull" min={0} max={12} un="sem" hint="Mesmo dia da semana, N semanas de conteúdo depois (semanas especiais não contam)." />
          <Num {...c} k="offsetQuestoes" label="Questões após PDFull" min={0} max={12} un="sem" />
          <Num {...c} k="tetoPdfDia" label="PDFulls novos/dia" min={1} max={6} hint="Vale quando o aluno permite mais de um por dia (sem a permissão, é sempre 1). Continuações não contam." />
          <Num {...c} k="concentracaoAteH" label="Concentrar até" min={0} max={60} un="h/sem" hint="Semanas com até essas horas e mais de um dia concentram questões/LegProc no último dia. 0 desliga." />
          <Num {...c} k="maxSemanas" label="Limite de planejamento" min={20} max={520} un="sem" />
          <div className="col-span-full">
            <span className="text-xs font-medium text-muted-foreground">Disciplinas sem revisão regular</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {p.semFlash.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1.5 text-xs">
                  {d}
                  <button type="button" aria-label={`Remover ${d}`} onClick={() => set('semFlash', p.semFlash.filter((x) => x !== d))} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                </span>
              ))}
              {!p.semFlash.length && <span className="text-xs text-muted-foreground">Nenhuma — todas geram revisão.</span>}
              <span className="inline-flex h-7 items-center rounded-full border bg-background pl-2.5 pr-1 focus-within:ring-1 focus-within:ring-ring">
                <input value={novaDisc} onChange={(e) => setNovaDisc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDisc() } }}
                  placeholder="Nome exato da disciplina" aria-label="Adicionar disciplina sem revisão" className="w-40 bg-transparent text-xs outline-none" />
                <button type="button" onClick={addDisc} aria-label="Adicionar" className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><Plus className="h-3 w-3" /></button>
              </span>
            </div>
          </div>
        </Bloco>

        <Bloco titulo="LegProc" desc="Como as metas de lei seca são agrupadas no dia e alternadas entre disciplinas.">
          <Num {...c} k="lpMetasDia" label="Metas por dia" min={1} max={12} />
          <Num {...c} k="lpDiscDia" label="Disciplinas por dia" min={1} max={6} />
          <Num {...c} k="lpMesmaDisc" label="Metas por disciplina" min={1} max={6} hint="Quando mais de uma, precisam ser da mesma lei." />
          <Num {...c} k="lpJanelaRodizio" label="Janela do rodízio" min={1} max={20} un="disc" hint="Quantas disciplinas com pendência alternam ao mesmo tempo." />
          <Num {...c} k="charsMetaLp" label="Tamanho da meta" min={2000} max={40000} un="car" hint="Aplicado ao cortar as leis da Biblioteca em metas (próxima atualização do catálogo)." />
        </Bloco>

        <Bloco titulo="Regras da versão 2.18" desc="Comportamentos do gerador 2.18. Cada um vale só para planos gerados ou recalculados depois de ligar; desligado = comportamento atual.">
          <Chave ligado={p.pdfInteiro218} onChange={(v) => set('pdfInteiro218', v)}
            titulo="Segundo PDFull só se couber inteiro" desc="Não abre um segundo PDFull no dia se ele não couber inteiro na sobra de tempo. A continuação do PDFull em curso não é afetada." />
          <Chave ligado={p.revisaoPorResultado218} onChange={(v) => set('revisaoPorResultado218', v)}
            titulo="Revisão pelo resultado recente do tema" desc="Na semana de revisão entram os temas com acerto abaixo de 70% (os piores primeiro, depois 50–70%, depois sem resultado). Temas com 70% ou mais ficam de fora." />
        </Bloco>

        <Bloco titulo="Jurisprudência semanal (versão 2.19)" desc="Uma meta geral de Jurisprudência por semana de atividade, preferindo sexta ou sábado. Vale só para planos gerados ou recalculados depois de ligar; ela ocupa tempo do aluno, então os planos ficam um pouco mais longos.">
          <Chave ligado={p.jurisprudencia219} onChange={(v) => set('jurisprudencia219', v)}
            titulo="Meta semanal de Jurisprudência" desc="Reserva o tempo antes de distribuir o conteúdo da semana. Semana sem estudo não recebe; semana com estudo mas sem um dia que comporte a meta avisa o aluno para ajustar a rotina." />
          {p.jurisprudencia219 && <Num {...c} k="jurisprudenciaMin" label="Duração da meta" min={15} max={180} un="min" hint="Padrão 60 min (versão 2.19)." />}
        </Bloco>

        <Bloco titulo="Inteligência de desempenho" desc="Usa o grau de dificuldade e os acertos que o aluno anotou para priorizar temas fracos.">
          <Num {...c} k="acertoMin" label="Acerto mínimo" min={0} max={100} un="%" hint="Abaixo disso o tema vira prioritário nas semanas de revisão." />
          <Chave ligado={p.usarDesempenhoNoPlano} onChange={(v) => setP((x) => ({ ...x, usarDesempenhoNoPlano: v, pesoDesempenho: v ? (x.pesoDesempenho || 1) : 0 }))}
            titulo="Reforçar temas fracos em todo o plano" desc="Antecipa a revisão e as questões dos temas com grau alto ou acerto baixo, além das semanas de revisão. Desligado = comportamento atual." />
          {p.usarDesempenhoNoPlano && (
            <label className="col-span-full flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Zap className="h-3.5 w-3.5 text-primary" />Força do reforço: {p.pesoDesempenho.toLocaleString('pt-BR')}</span>
              <input type="range" min={0.5} max={3} step={0.5} value={p.pesoDesempenho} onChange={(e) => set('pesoDesempenho', Number(e.target.value))} className="w-48 accent-primary" />
              <span className="text-[11px] text-muted-foreground">1 = moderado · 3 = forte</span>
            </label>
          )}
        </Bloco>
      </div>

      {/* barra de salvar — sticky dentro da coluna de conteúdo (não cruza a sidebar) */}
      <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <span className="mr-auto text-xs text-muted-foreground">{mudou ? 'Há alterações não salvas.' : 'Tudo salvo.'}</span>
        <button type="button" disabled={!difPadrao || salvando} onClick={() => setP(padrao)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50"><RotateCcw className="h-4 w-4" />Restaurar padrão</button>
        <button type="button" disabled={!mudou || salvando} onClick={salvar}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
        </button>
      </div>
    </div>
  )
}
