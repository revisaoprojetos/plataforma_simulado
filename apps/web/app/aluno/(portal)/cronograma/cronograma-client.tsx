'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Check, ChevronLeft, ChevronRight, Eye, Info, Loader2, Save, CalendarPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BotaoPdfCronograma } from '@/components/cronograma/botao-pdf'
import { GradeCronograma, ResumoGrade } from '@/components/cronograma/grade-cronograma'
import { VisaoCronograma } from '@/components/cronograma/visao-cronograma'
import { fmtBr, hojeISO, proximaSegunda } from '@/lib/cronograma/datas'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import { CHAVE_PALETA_LOCAL, PALETAS } from '@/lib/cronograma/paletas'
import type { Grade, ModoRecesso, OpcoesGeracao, PeriodicidadeRevisao } from '@/lib/cronograma/tipos'
import type { CronogramaDoAluno } from '@/lib/cronograma/acesso'
import { gerarCronograma } from './actions'

const CARGAS_ROTULO = (h: number) => `${h}h`

/** Passos do assistente (o último é a prévia + gerar). */
const PASSOS = ['Plano', 'Início', 'Blocos', 'Cores', 'Prévia'] as const
const ULTIMA = PASSOS.length - 1

export function CronogramaClient({ catalogo }: { catalogo: CronogramaDoAluno[] }) {
  // ── Passo a passo ──
  const [etapa, setEtapa] = useState(0)

  // ── Nome (vira o título da emissão salva). O nome do documento é o do aluno, lido no servidor.
  const [titulo, setTitulo] = useState('')

  // ── Carga horária
  const cargas = useMemo(() => [...new Set(catalogo.map((c) => c.carga_horaria))].sort((a, b) => a - b), [catalogo])
  const [carga, setCarga] = useState<number | null>(cargas[0] ?? null)

  // ── Cronograma (filtrado pela carga)
  const daCarga = useMemo(() => catalogo.filter((c) => c.carga_horaria === carga), [catalogo, carga])
  const [cronogramaId, setCronogramaId] = useState<string>(daCarga[0]?.id ?? '')
  const escolhido = useMemo(() => catalogo.find((c) => c.id === cronogramaId) ?? null, [catalogo, cronogramaId])

  // ── Data de início (R1 — sempre uma segunda)
  const [inicio, setInicio] = useState(() => proximaSegunda(hojeISO()))
  const segunda = useMemo(() => proximaSegunda(inicio), [inicio])
  const dataAjustada = segunda !== inicio

  // ── Revisão e recesso
  const [revisaoAtiva, setRevisaoAtiva] = useState(true)
  const [revisaoCada, setRevisaoCada] = useState<PeriodicidadeRevisao>(12)
  const [recessoAtivo, setRecessoAtivo] = useState(false)
  const [recessoModo, setRecessoModo] = useState<Exclude<ModoRecesso, 'nenhum'>>('natal')
  const [recessoDe, setRecessoDe] = useState('')
  const [recessoAte, setRecessoAte] = useState('')
  // Plano "só semanas": ignora datas de calendário (Semana 1, 2, 3…).
  const [semDatas, setSemDatas] = useState(false)

  // ── Paleta (lembrada no navegador)
  const [paletaSlug, setPaletaSlug] = useState(PALETAS[0].slug)
  useEffect(() => {
    const salva = localStorage.getItem(CHAVE_PALETA_LOCAL)
    if (salva) setPaletaSlug(salva)
  }, [])

  const [grade, setGrade] = useState<Grade | null>(null)
  const [emissaoId, setEmissaoId] = useState<string | null>(null)
  const [naoSalvou, setNaoSalvou] = useState(false)
  const [desatualizada, setDesatualizada] = useState(false)
  const [gerando, iniciar] = useTransition()
  const [previaGrade, setPreviaGrade] = useState<Grade | null>(null)
  const [previaAberta, setPreviaAberta] = useState(false)
  const [gerandoPrevia, iniciarPrevia] = useTransition()
  const [wizardAberto, setWizardAberto] = useState(false)

  // Trocar um parâmetro não apaga o resultado — marca como desatualizado.
  function aoMudar<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      if (grade) setDesatualizada(true)
    }
  }

  useEffect(() => {
    if (!daCarga.some((c) => c.id === cronogramaId)) setCronogramaId(daCarga[0]?.id ?? '')
  }, [daCarga, cronogramaId])

  function montarOpcoes(): OpcoesGeracao {
    return {
      inicio: segunda,
      revisao: { ativo: revisaoAtiva, cada: revisaoCada },
      recesso: recessoAtivo && !semDatas
        ? { modo: recessoModo, de: recessoDe || undefined, ate: recessoAte || undefined }
        : { modo: 'nenhum' },
    }
  }

  // Prévia = monta a grade SEM salvar (salvar=false) e abre no pop-up.
  function verPrevia() {
    if (!cronogramaId) { toast.error('Escolha um cronograma.'); return }
    iniciarPrevia(async () => {
      const r = await gerarCronograma(cronogramaId, montarOpcoes(), { nome: titulo, paleta: paletaSlug, semDatas }, false)
      if (!r.ok) { toast.error(r.error); return }
      setPreviaGrade(r.grade)
      setPreviaAberta(true)
    })
  }

  function gerar() {
    if (!cronogramaId) { toast.error('Escolha um cronograma.'); return }
    iniciar(async () => {
      const r = await gerarCronograma(cronogramaId, montarOpcoes(), { nome: titulo, paleta: paletaSlug, semDatas })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setGrade(r.grade)
      setEmissaoId(r.emissaoId)
      setNaoSalvou(!!r.erroAoSalvar)
      setDesatualizada(false)
      setPreviaAberta(false)
      setWizardAberto(false)
      localStorage.setItem(CHAVE_PALETA_LOCAL, paletaSlug)
      if (r.erroAoSalvar) toast.error('A grade foi montada, mas não conseguimos salvá-la na sua conta.')
      else if (r.grade.avisos.length) toast.info(r.grade.avisos[0])
    })
  }

  if (!catalogo.length) return null

  const previa: [string, string][] = [
    ['Nome', titulo.trim() || escolhido?.nome || '—'],
    ['Tempo por dia', carga ? `${carga}h` : '—'],
    ['Cronograma', escolhido ? `${escolhido.nome} (${faixaSemanal(escolhido.dias_curso)})` : '—'],
    ['Começa em', semDatas ? 'Sem data — só semanas' : `${fmtBr(segunda)} (segunda)`],
    ['Semanas de revisão', revisaoAtiva ? `Sim — a cada ${revisaoCada} semanas` : 'Não'],
    ['Recesso', recessoAtivo && !semDatas ? (recessoModo === 'outras' ? `${recessoDe || '?'} a ${recessoAte || '?'}` : ROTULO_RECESSO[recessoModo]) : 'Não'],
    ['Cores', PALETAS.find((p) => p.slug === paletaSlug)?.nome ?? '—'],
  ]

  return (
    <div className="space-y-6">
      {/* Gatilho: o assistente inteiro abre num pop-up. */}
      <Card className="flex flex-col items-center gap-3 p-6 text-center shadow-lg sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Monte seu plano personalizado</p>
        <p className="max-w-md text-sm text-muted-foreground">Escolha a rotina, o cronograma e quando começar — em poucos passos, com prévia antes de gerar.</p>
        <Button size="lg" onClick={() => setWizardAberto(true)}>
          <CalendarPlus className="mr-2 h-4 w-4" /> {grade ? 'Montar outro plano' : 'Montar meu plano'}
        </Button>
      </Card>

      {/* Assistente em pop-up */}
      {wizardAberto && createPortal(
        <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setWizardAberto(false)} />
          <div role="dialog" aria-modal="true" className="animate-pop relative z-10 my-auto w-full max-w-3xl">
            <Card className="p-5 shadow-2xl sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Monte seu plano personalizado</p>
                <button type="button" onClick={() => setWizardAberto(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>

        {/* Stepper — clicável para voltar/avançar entre passos já vistos */}
        <div className="flex items-center gap-1 overflow-x-auto px-0.5 py-0.5">
          {PASSOS.map((t, i) => (
            <div key={t} className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => setEtapa(i)}
                className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 ${i === etapa ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition ${i === etapa ? 'bg-primary text-primary-foreground' : i < etapa ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {i < etapa ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`text-sm ${i === etapa ? 'font-semibold text-primary' : i < etapa ? 'text-foreground' : 'text-muted-foreground'}`}>{t}</span>
              </button>
              {i < PASSOS.length - 1 && <span className="mx-1 hidden h-px w-5 bg-border sm:block" />}
            </div>
          ))}
        </div>
        <div className="mb-3 mt-0.5 h-px bg-border" />

        {/* Corpo do passo atual */}
        <div className="min-h-[110px]">
          {etapa === 0 && (
            <div className="grid items-start gap-x-6 gap-y-5 sm:grid-cols-2 md:grid-cols-3">
              <Passo titulo="Nome do cronograma">
                <Input value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} placeholder={escolhido ? escolhido.nome : 'Como quer chamar este plano?'} />
                <Dica>Só para você distinguir os seus cronogramas salvos.</Dica>
              </Passo>
              <Passo titulo="Quanto tempo por dia?">
                <div className="flex flex-wrap gap-2">
                  {cargas.map((h) => (
                    <button key={h} onClick={() => aoMudar(setCarga)(h)}
                      className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm transition ${carga === h ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'hover:border-primary/40 hover:bg-muted'}`}>
                      <span className="font-bold">{CARGAS_ROTULO(h)}</span>
                      <span className={`text-[11px] ${carga === h ? 'opacity-80' : 'text-muted-foreground'}`}>{catalogo.filter((c) => c.carga_horaria === h).length} opções</span>
                    </button>
                  ))}
                </div>
              </Passo>
              <Passo titulo="Escolha seu cronograma">
                <Select value={cronogramaId} onValueChange={(v) => aoMudar(setCronogramaId)(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione">{escolhido ? `${escolhido.nome} (${faixaSemanal(escolhido.dias_curso)})` : undefined}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {daCarga.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome} ({faixaSemanal(c.dias_curso)})</SelectItem>)}
                  </SelectContent>
                </Select>
                {escolhido && (
                  <Dica>
                    {escolhido.total_semanas} semanas cadastradas{escolhido.semanas_revisao.length > 0 && `, ${escolhido.semanas_revisao.length} de revisão`} · {escolhido.dias_nome.length} dias por semana
                  </Dica>
                )}
              </Passo>
            </div>
          )}

          {etapa === 1 && (
            <div className="grid max-w-4xl items-start gap-x-6 gap-y-5 sm:grid-cols-[14rem_minmax(0,1fr)]">
              <Passo titulo="Quando você começa?">
                <Input type="date" value={inicio} min={hojeISO()} disabled={semDatas} onChange={(e) => aoMudar(setInicio)(e.target.value)} className={semDatas ? 'opacity-50' : ''} />
                <Dica>
                  {semDatas ? 'Ignorado neste modo — o plano é numerado só por semanas.' : dataAjustada ? (<>Todo cronograma começa numa segunda — ajustamos para <strong>{fmtBr(segunda)}</strong>.</>) : (<>Começa na segunda {fmtBr(segunda)}.</>)}
                </Dica>
              </Passo>
              <Passo titulo="Modo do plano">
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition hover:bg-muted/40">
                  <input type="checkbox" checked={semDatas} onChange={(e) => aoMudar(setSemDatas)(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                  <span>
                    <span className="block text-sm font-medium">Sem data — só numerar as semanas</span>
                    <span className="block text-xs text-muted-foreground">A grade fica “Semana 1, 2, 3…”, sem datas de calendário (o recesso, que depende de datas, fica desativado).</span>
                  </span>
                </label>
              </Passo>
            </div>
          )}

          {etapa === 2 && (
            <div className="grid items-start gap-x-6 gap-y-5 sm:grid-cols-2">
              <Passo titulo="Incluir semanas de revisão?">
                <div className="flex flex-wrap items-center gap-2">
                  <SimNao valor={revisaoAtiva} aoTrocar={aoMudar(setRevisaoAtiva)} />
                  {revisaoAtiva && (
                    <Select value={String(revisaoCada)} onValueChange={(v) => aoMudar(setRevisaoCada)(Number(v) as PeriodicidadeRevisao)}>
                      <SelectTrigger className="w-44"><SelectValue>A cada {revisaoCada} semanas</SelectValue></SelectTrigger>
                      <SelectContent>{[4, 6, 8, 10, 12].map((k) => <SelectItem key={k} value={String(k)}>A cada {k} semanas</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
                {revisaoAtiva && <Dica>Uma semana exclusiva de revisão é inserida após cada bloco.</Dica>}
              </Passo>
              <Passo titulo="Incluir recesso?">
                <div className="flex flex-wrap items-center gap-2">
                  <SimNao valor={recessoAtivo} aoTrocar={aoMudar(setRecessoAtivo)} />
                  {recessoAtivo && (
                    <Select value={recessoModo} onValueChange={(v) => aoMudar(setRecessoModo)(v as Exclude<ModoRecesso, 'nenhum'>)}>
                      <SelectTrigger className="w-52"><SelectValue>{ROTULO_RECESSO[recessoModo]}</SelectValue></SelectTrigger>
                      <SelectContent>{(Object.keys(ROTULO_RECESSO) as (keyof typeof ROTULO_RECESSO)[]).map((k) => <SelectItem key={k} value={k}>{ROTULO_RECESSO[k]}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
                {recessoAtivo && recessoModo === 'outras' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input type="date" value={recessoDe} onChange={(e) => aoMudar(setRecessoDe)(e.target.value)} className="w-40" />
                    <span className="text-sm text-muted-foreground">até</span>
                    <Input type="date" value={recessoAte} onChange={(e) => aoMudar(setRecessoAte)(e.target.value)} className="w-40" />
                    <Dica>O intervalo é esticado para semanas inteiras. Sem as duas datas, nenhuma semana é bloqueada.</Dica>
                  </div>
                )}
                {recessoAtivo && recessoModo !== 'outras' && <Dica>As semanas de recesso empurram o conteúdo para a frente.</Dica>}
              </Passo>
            </div>
          )}

          {etapa === 3 && (
            <div className="max-w-md">
              <Passo titulo="Cores das tabelas">
                <Select value={paletaSlug} onValueChange={(v) => setPaletaSlug(v ?? PALETAS[0].slug)}>
                  <SelectTrigger className="w-full"><SelectValue>{PALETAS.find((p) => p.slug === paletaSlug)?.nome}</SelectValue></SelectTrigger>
                  <SelectContent>{PALETAS.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
                <Dica>Vale para a tabela na tela e para o documento exportado.</Dica>
              </Passo>
            </div>
          )}

          {etapa === ULTIMA && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Confira seu plano antes de gerar</h3>
                <p className="text-xs text-muted-foreground">Revise as escolhas abaixo. Se estiver tudo certo, é só gerar — o cronograma fica salvo na sua conta.</p>
              </div>
              <div className="divide-y rounded-xl border">
                {previa.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="text-sm text-muted-foreground">{k}</span>
                    <span className="text-right text-sm font-semibold">{v}</span>
                  </div>
                ))}
              </div>
              {escolhido && (
                <p className="text-xs text-muted-foreground">
                  Resultado estimado: ~{escolhido.total_semanas} semanas de conteúdo{revisaoAtiva ? ' + revisões' : ''}{recessoAtivo ? ' + recesso' : ''}.
                </p>
              )}
              <div className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Seu cronograma fica salvo na sua conta.</strong> Você pode fechar a página e reabrir quando quiser — e gerar quantos quiser, lado a lado.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navegação */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <Button variant="ghost" onClick={() => setEtapa((e) => Math.max(0, e - 1))} disabled={etapa === 0}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
          {etapa < ULTIMA ? (
            <Button onClick={() => setEtapa((e) => Math.min(ULTIMA, e + 1))} disabled={etapa === 0 && !cronogramaId}>
              Avançar <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {desatualizada && <span className="text-sm text-amber-600">Você mudou algo — gere de novo para atualizar.</span>}
              <Button variant="outline" onClick={verPrevia} disabled={gerandoPrevia || !cronogramaId} size="lg">
                {gerandoPrevia ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                Ver prévia
              </Button>
              <Button onClick={gerar} disabled={gerando || !cronogramaId} size="lg">
                {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
                {grade ? 'Gerar de novo' : 'Gerar meu cronograma'}
              </Button>
            </div>
          )}
        </div>
            </Card>
          </div>
        </div>,
        document.body,
      )}

      {/* Resultado — aparece após gerar */}
      {grade && (
        <>
          <ResumoGrade grade={grade} ocultarDatas={semDatas} />
          <p className="text-sm text-muted-foreground">{grade.resumo.subtitulo}</p>
          <VisaoCronograma grade={grade} paletaSlug={paletaSlug} emissaoId={emissaoId} ocultarDatas={semDatas} />

          {naoSalvou && (
            <Card className="flex flex-row flex-wrap items-start gap-3 border-destructive/40 bg-destructive/5 p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <p className="flex-1 text-sm">
                <strong>Este cronograma não ficou salvo na sua conta.</strong>{' '}
                <span className="text-muted-foreground">A grade abaixo está correta e você pode usá-la agora, mas ela não vai aparecer em &quot;Meus cronogramas&quot;. Avise o suporte.</span>
              </p>
            </Card>
          )}

          {emissaoId && (
            <Card className="flex flex-row flex-wrap items-center gap-3 p-4">
              <Save className="h-5 w-5 text-emerald-600" />
              <p className="flex-1 text-sm text-muted-foreground">Este cronograma ficou salvo na sua conta — você pode fechar a página e voltar quando quiser.</p>
              <BotaoPdfCronograma emissaoId={emissaoId} />
              <Link href={`/aluno/cronograma/${emissaoId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir</Link>
            </Card>
          )}
        </>
      )}

      {/* Pop-up de PRÉVIA: a grade pronta, sem gravar — o aluno confirma e gera de vez aqui. */}
      {previaAberta && previaGrade && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setPreviaAberta(false)} />
          <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prévia — como o plano vai ficar</p>
                <h3 className="truncate text-base font-bold">{titulo.trim() || escolhido?.nome}</h3>
              </div>
              <button type="button" onClick={() => setPreviaAberta(false)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
              <ResumoGrade grade={previaGrade} ocultarDatas={semDatas} />
              <p className="text-sm text-muted-foreground">{previaGrade.resumo.subtitulo}</p>
              <GradeCronograma grade={previaGrade} paletaSlug={paletaSlug} titulo="Seu plano semana a semana" ocultarDatas={semDatas} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t p-4">
              <Button variant="ghost" onClick={() => setPreviaAberta(false)}>Fechar</Button>
              <Button onClick={gerar} disabled={gerando}>
                {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
                {grade ? 'Gerar de novo' : 'Gerar meu cronograma'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

const ROTULO_RECESSO = {
  natal: 'Natal',
  ano_novo: 'Ano Novo',
  natal_ano_novo: 'Natal + Ano Novo',
  outras: 'Outras semanas',
} as const

function Passo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex min-h-5 items-center gap-2 text-sm font-semibold">{titulo}</Label>
      {children}
    </div>
  )
}

function Dica({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

function SimNao({ valor, aoTrocar }: { valor: boolean; aoTrocar: (v: boolean) => void }) {
  return (
    <div className="flex h-8 overflow-hidden rounded-lg border">
      {[
        [true, 'Sim'],
        [false, 'Não'],
      ].map(([v, rotulo]) => (
        <button key={String(v)} onClick={() => aoTrocar(v as boolean)}
          className={`px-3.5 text-sm transition ${valor === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
          {rotulo as string}
        </button>
      ))}
    </div>
  )
}
