'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Plus, X, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PARAMS_SEM_EFEITO, type ParamsAdaptativo } from '@/lib/cronograma/adaptativo/params'
import type { PainelMetas } from '../actions-tipos'
import {salvarPainelMetas} from '../actions'

type NumKey = { [K in keyof ParamsAdaptativo]-?: ParamsAdaptativo[K] extends number ? K : never }[keyof ParamsAdaptativo]
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

        <Bloco titulo="Revisões e planejamento" desc="Quando a revisão e as questões voltam e até quantas semanas o gerador planeja à frente.">
          <Num {...c} k="offsetRevisao" label="Revisão após PDFull" min={0} max={12} un="sem" hint="Mesmo dia da semana, N semanas de conteúdo depois (semanas especiais não contam)." />
          <Num {...c} k="offsetQuestoes" label="Questões após PDFull" min={0} max={12} un="sem" />
          <Num {...c} k="maxSemanas" label="Limite de planejamento" min={20} max={600} un="sem" />
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

        <Bloco titulo="LegProc" desc="Rodízio de disciplinas e tamanho da meta de lei seca. O limite diário de metas é fixo (2 por dia; 4 nas rotinas de mais horas).">
          <Num {...c} k="lpJanelaRodizio" label="Janela do rodízio" min={1} max={20} un="disc" hint="Quantas disciplinas com pendência alternam ao mesmo tempo." />
          <Num {...c} k="charsMetaLp" label="Tamanho da meta" min={2000} max={40000} un="car" hint="Aplicado ao cortar as leis da Biblioteca em metas (próxima atualização do catálogo)." />
        </Bloco>


        <Bloco titulo="Jurisprudência semanal" desc="Uma meta geral de Jurisprudência por semana de atividade, preferindo sexta ou sábado. Sempre ativa nos cronogramas gerados ou recalculados; aqui se ajusta a duração e a leitura do aluno.">
          <Chave ligado={p.jurisTagsImagem} onChange={(v) => set('jurisTagsImagem', v)}
            titulo="Converter <tags> em imagens de selo na leitura" desc="Na leitura do aluno, troca marcadores como <repercussão geral> ou <entendimento consolidado> pela imagem do selo cadastrado na Biblioteca de tags. Útil para documentos que não foram montados com o plugin Selos no editor. Desligado = o texto aparece como está. Vale na hora, sem recalcular planos." />
          <Chave ligado={p.jurisTitulosExpansivos} onChange={(v) => set('jurisTitulosExpansivos', v)}
            titulo="Seções dos títulos expansivas e recolhíveis" desc="Na leitura do aluno, cada título e tudo o que vem abaixo dele, até o próximo título, vira uma área expansiva e recolhível no estilo do JurisClub. O que fica antes do primeiro título (nome do julgado, tags e quadro do entendimento) não muda. Vale na hora, sem recalcular planos." />
          <Num {...c} k="jurisprudenciaMin" label="Duração da meta" min={15} max={180} un="min" hint="Padrão 60 min." />
        </Bloco>


        <Bloco titulo="Inteligência de desempenho" desc="Usa os acertos que o aluno anotou para escolher e ordenar os temas da semana de revisão adaptativa.">
          <Num {...c} k="acertoMin" label="Acerto mínimo" min={0} max={100} un="%" hint="Abaixo disso o tema vira prioritário nas semanas de revisão." />
        </Bloco>
        <Bloco titulo="Sem efeito no gerador atual" desc="Estes ajustes continuam guardados (nada foi apagado), mas o gerador atual não os usa mais: as regras correspondentes agora são fixas ou sempre ativas.">
          <ul className="col-span-full grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            {PARAMS_SEM_EFEITO.map((x) => (
              <li key={x.k.join('+')} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
                <span className="min-w-0 truncate" title={x.motivo}>{x.rotulo}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">sem efeito</span>
              </li>
            ))}
          </ul>
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
