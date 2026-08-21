'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Info, Loader2, Save, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GradeCronograma, ResumoGrade } from '@/components/cronograma/grade-cronograma'
import { fmtBr, hojeISO, proximaSegunda } from '@/lib/cronograma/datas'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import { CHAVE_PALETA_LOCAL, PALETAS } from '@/lib/cronograma/paletas'
import type { Grade, ModoRecesso, PeriodicidadeRevisao } from '@/lib/cronograma/tipos'
import type { CronogramaDoAluno } from '@/lib/cronograma/acesso'
import { gerarCronograma } from './actions'

const CARGAS_ROTULO = (h: number) => `${h}h`

export function CronogramaClient({ catalogo }: { catalogo: CronogramaDoAluno[] }) {
  // ── Passo 1: como o aluno quer chamar ESTE cronograma (vira o título da emissão salva).
  // O nome que aparece no documento é o do aluno, lido da sessão no servidor — não precisa ser digitado.
  const [titulo, setTitulo] = useState('')

  // ── Passo 2: carga horária
  const cargas = useMemo(() => [...new Set(catalogo.map((c) => c.carga_horaria))].sort((a, b) => a - b), [catalogo])
  const [carga, setCarga] = useState<number | null>(cargas[0] ?? null)

  // ── Passo 4: cronograma (filtrado pela carga)
  const daCarga = useMemo(() => catalogo.filter((c) => c.carga_horaria === carga), [catalogo, carga])
  const [cronogramaId, setCronogramaId] = useState<string>(daCarga[0]?.id ?? '')
  const escolhido = useMemo(() => catalogo.find((c) => c.id === cronogramaId) ?? null, [catalogo, cronogramaId])

  // ── Passo 3: data de início (R1 — sempre uma segunda)
  const [inicio, setInicio] = useState(() => proximaSegunda(hojeISO()))
  const segunda = useMemo(() => proximaSegunda(inicio), [inicio])
  const dataAjustada = segunda !== inicio

  // ── Passos 5 e 6: revisão e recesso
  const [revisaoAtiva, setRevisaoAtiva] = useState(true)
  const [revisaoCada, setRevisaoCada] = useState<PeriodicidadeRevisao>(12)
  const [recessoAtivo, setRecessoAtivo] = useState(false)
  const [recessoModo, setRecessoModo] = useState<Exclude<ModoRecesso, 'nenhum'>>('natal')
  const [recessoDe, setRecessoDe] = useState('')
  const [recessoAte, setRecessoAte] = useState('')

  // ── Passo 7: paleta (lembrada no navegador)
  const [paletaSlug, setPaletaSlug] = useState(PALETAS[0].slug)
  useEffect(() => {
    const salva = localStorage.getItem(CHAVE_PALETA_LOCAL)
    if (salva) setPaletaSlug(salva)
  }, [])

  const [grade, setGrade] = useState<Grade | null>(null)
  const [emissaoId, setEmissaoId] = useState<string | null>(null)
  const [desatualizada, setDesatualizada] = useState(false)
  const [gerando, iniciar] = useTransition()

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

  function gerar() {
    if (!cronogramaId) { toast.error('Escolha um cronograma.'); return }
    iniciar(async () => {
      const r = await gerarCronograma(
        cronogramaId,
        {
          inicio: segunda,
          revisao: { ativo: revisaoAtiva, cada: revisaoCada },
          recesso: recessoAtivo
            ? { modo: recessoModo, de: recessoDe || undefined, ate: recessoAte || undefined }
            : { modo: 'nenhum' },
        },
        { nome: titulo, paleta: paletaSlug },
      )
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setGrade(r.grade)
      setEmissaoId(r.emissaoId)
      setDesatualizada(false)
      localStorage.setItem(CHAVE_PALETA_LOCAL, paletaSlug)
      if (r.grade.avisos.length) toast.info(r.grade.avisos[0])
    })
  }

  if (!catalogo.length) return null

  return (
    <div className="space-y-6">
      <Card className="p-5 shadow-lg sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Monte seu plano personalizado
        </p>
        <div className="mb-5 mt-3 h-px bg-border" />

        <div className="grid items-start gap-x-6 gap-y-5 md:grid-cols-2 lg:grid-cols-3">
          <Passo n={1} titulo="Nome do cronograma">
            <Input
              value={titulo}
              maxLength={80}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={escolhido ? escolhido.nome : 'Como quer chamar este plano?'}
            />
            <Dica>Só para você distinguir os seus cronogramas salvos.</Dica>
          </Passo>

          <Passo n={2} titulo="Quanto tempo por dia?">
            <div className="flex flex-wrap gap-2">
              {cargas.map((h) => (
                <button
                  key={h}
                  onClick={() => aoMudar(setCarga)(h)}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm transition ${
                    carga === h
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'hover:border-primary/40 hover:bg-muted'
                  }`}
                >
                  <span className="font-bold">{CARGAS_ROTULO(h)}</span>
                  <span className={`text-[11px] ${carga === h ? 'opacity-80' : 'text-muted-foreground'}`}>
                    {catalogo.filter((c) => c.carga_horaria === h).length} opções
                  </span>
                </button>
              ))}
            </div>
          </Passo>

          <Passo n={3} titulo="Quando você começa?">
            <Input type="date" value={inicio} min={hojeISO()} onChange={(e) => aoMudar(setInicio)(e.target.value)} />
            <Dica>
              {dataAjustada ? (
                <>
                  Todo cronograma começa numa segunda — ajustamos para <strong>{fmtBr(segunda)}</strong>.
                </>
              ) : (
                <>Começa na segunda {fmtBr(segunda)}.</>
              )}
            </Dica>
          </Passo>

          <Passo n={4} titulo="Escolha seu cronograma">
            <Select value={cronogramaId} onValueChange={(v) => aoMudar(setCronogramaId)(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione">
                  {escolhido ? `${escolhido.nome} (${faixaSemanal(escolhido.dias_curso)})` : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {daCarga.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} ({faixaSemanal(c.dias_curso)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {escolhido && (
              <Dica>
                {escolhido.total_semanas} semanas cadastradas
                {escolhido.semanas_revisao.length > 0 && `, ${escolhido.semanas_revisao.length} de revisão`} ·{' '}
                {escolhido.dias_nome.length} dias por semana
              </Dica>
            )}
          </Passo>

          <Passo n={5} titulo="Incluir semanas de revisão?">
            <div className="flex flex-wrap items-center gap-2">
              <SimNao valor={revisaoAtiva} aoTrocar={aoMudar(setRevisaoAtiva)} />
              {revisaoAtiva && (
                <Select value={String(revisaoCada)} onValueChange={(v) => aoMudar(setRevisaoCada)(Number(v) as PeriodicidadeRevisao)}>
                  <SelectTrigger className="w-44">
                    <SelectValue>A cada {revisaoCada} semanas</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {[4, 6, 8, 10, 12].map((k) => (
                      <SelectItem key={k} value={String(k)}>
                        A cada {k} semanas
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {revisaoAtiva && <Dica>Uma semana exclusiva de revisão é inserida após cada bloco.</Dica>}
          </Passo>

          <Passo n={6} titulo="Incluir recesso?">
            <div className="flex flex-wrap items-center gap-2">
              <SimNao valor={recessoAtivo} aoTrocar={aoMudar(setRecessoAtivo)} />
              {recessoAtivo && (
                <Select value={recessoModo} onValueChange={(v) => aoMudar(setRecessoModo)(v as Exclude<ModoRecesso, 'nenhum'>)}>
                  <SelectTrigger className="w-52">
                    <SelectValue>{ROTULO_RECESSO[recessoModo]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROTULO_RECESSO) as (keyof typeof ROTULO_RECESSO)[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {ROTULO_RECESSO[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
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

          <Passo n={7} titulo="Cores das tabelas">
            <Select value={paletaSlug} onValueChange={(v) => setPaletaSlug(v ?? PALETAS[0].slug)}>
              <SelectTrigger className="w-full">
                <SelectValue>{PALETAS.find((p) => p.slug === paletaSlug)?.nome}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PALETAS.map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dica>Vale para a tabela na tela e para o documento exportado.</Dica>
          </Passo>
        </div>

        {/* No gerador antigo este aviso dizia que nada era guardado. Aqui ele diz o contrário —
            é a diferença que a plataforma trouxe, e vale dizer no mesmo lugar em que assustava. */}
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            <strong className="text-foreground">Seu cronograma fica salvo na sua conta.</strong> Você pode fechar a
            página e reabrir quando quiser — e gerar quantos quiser, lado a lado.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-5">
          <Button onClick={gerar} disabled={gerando || !cronogramaId} size="lg">
            {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {grade ? 'Gerar de novo' : 'Gerar meu cronograma'}
          </Button>
          {desatualizada && (
            <span className="text-sm text-amber-600">Você mudou as escolhas — gere de novo para atualizar a tabela.</span>
          )}
        </div>
      </Card>

      {/* Os quatro números ficam na tela desde o início, como no gerador antigo: mostram o
          formato do resultado antes de existir resultado, em vez de aparecerem do nada. */}
      <ResumoGrade grade={grade} />

      {grade ? (
        <>
          <p className="text-sm text-muted-foreground">{grade.resumo.subtitulo}</p>
          <GradeCronograma grade={grade} paletaSlug={paletaSlug} titulo="Seu plano semana a semana" />

          {emissaoId && (
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <Save className="h-5 w-5 text-emerald-600" />
              <p className="flex-1 text-sm text-muted-foreground">
                Este cronograma ficou salvo na sua conta — você pode fechar a página e voltar quando quiser.
              </p>
              <Link href={`/aluno/cronograma/${emissaoId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Abrir
              </Link>
            </Card>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Seu plano semana a semana</h2>
          <Card className="border-dashed px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Preencha suas escolhas e clique em <strong className="text-foreground">Gerar meu cronograma</strong>.
            </p>
          </Card>
        </div>
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

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex min-h-5 items-center gap-2 text-sm">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {n}
        </span>
        {titulo}
      </Label>
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
        <button
          key={String(v)}
          onClick={() => aoTrocar(v as boolean)}
          className={`px-3.5 text-sm transition ${valor === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
        >
          {rotulo as string}
        </button>
      ))}
    </div>
  )
}
