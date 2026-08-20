'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CalendarDays, Download, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtBr, fmtIntervalo, hojeISO, proximaSegunda } from '@/lib/cronograma/datas'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import { CHAVE_PALETA_LOCAL, PALETAS, acharPaleta } from '@/lib/cronograma/paletas'
import { ORDEM_TIPO, ROTULO_TELA, type Grade, type ModoRecesso, type PeriodicidadeRevisao, type TipoMeta } from '@/lib/cronograma/tipos'
import type { CronogramaDoAluno } from '@/lib/cronograma/acesso'
import { gerarCronograma } from './actions'

const CARGAS_ROTULO = (h: number) => `${h}h`

export function CronogramaClient({ catalogo, nomeAluno }: { catalogo: CronogramaDoAluno[]; nomeAluno: string }) {
  // ── Passo 1 e 2: nome e carga
  const [nome, setNome] = useState(nomeAluno)
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
  const paleta = acharPaleta(paletaSlug)

  const [grade, setGrade] = useState<Grade | null>(null)
  const [desatualizada, setDesatualizada] = useState(false)
  const [gerando, iniciar] = useTransition()

  // ── Filtros do resultado. AO VIVO, sobre a grade já calculada: mexer neles não
  // dispara nova geração nem apaga a tabela (correção deliberada ao gerador legado).
  const [filtroSemana, setFiltroSemana] = useState<string>('todas')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')

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
    if (!cronogramaId) return toast.error('Escolha um cronograma.')
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
        { nome, paleta: paletaSlug },
      )
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setGrade(r.grade)
      setDesatualizada(false)
      setFiltroSemana('todas')
      setFiltroTipo('todos')
      localStorage.setItem(CHAVE_PALETA_LOCAL, paletaSlug)
      if (r.grade.avisos.length) toast.info(r.grade.avisos[0])
    })
  }

  const semanasVisiveis = useMemo(() => {
    if (!grade) return []
    let xs = grade.semanas
    if (filtroSemana !== 'todas') xs = xs.filter((s) => String(s.numero) === filtroSemana)
    if (filtroTipo === 'todos') return xs
    return xs
      .map((s) => (s.kind === 'conteudo' ? { ...s, metas: s.metas.filter((m) => m.tipo === filtroTipo) } : s))
      .filter((s) => s.kind !== 'conteudo' || s.metas.length > 0)
  }, [grade, filtroSemana, filtroTipo])

  if (!catalogo.length) return null

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Passo n={1} titulo="Seu nome">
            <Input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder="Como aparecerá no documento" />
          </Passo>

          <Passo n={2} titulo="Quanto tempo por dia?">
            <div className="flex flex-wrap gap-2">
              {cargas.map((h) => (
                <button
                  key={h}
                  onClick={() => aoMudar(setCarga)(h)}
                  className={`rounded-lg border px-4 py-2 text-sm transition ${
                    carga === h ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  <span className="font-semibold">{CARGAS_ROTULO(h)}</span>
                  <span className={`ml-1.5 text-xs ${carga === h ? 'opacity-80' : 'text-muted-foreground'}`}>
                    {catalogo.filter((c) => c.carga_horaria === h).length} opções
                  </span>
                </button>
              ))}
            </div>
          </Passo>

          <Passo n={3} titulo="Quando você começa?">
            <Input type="date" value={inicio} min={hojeISO()} onChange={(e) => aoMudar(setInicio)(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              {dataAjustada ? (
                <>
                  Todo cronograma começa numa segunda — ajustamos para <strong>{fmtBr(segunda)}</strong>.
                </>
              ) : (
                <>Começa na segunda {fmtBr(segunda)}.</>
              )}
            </p>
          </Passo>

          <Passo n={4} titulo="Escolha seu cronograma">
            <Select value={cronogramaId} onValueChange={(v) => aoMudar(setCronogramaId)(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
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
              <p className="mt-1 text-xs text-muted-foreground">
                {escolhido.total_semanas} semanas cadastradas
                {escolhido.semanas_revisao.length > 0 && `, ${escolhido.semanas_revisao.length} de revisão`} ·{' '}
                {escolhido.dias_nome.length} dias por semana
              </p>
            )}
          </Passo>

          <Passo n={5} titulo="Incluir semanas de revisão?">
            <div className="flex flex-wrap items-center gap-2">
              <SimNao valor={revisaoAtiva} aoTrocar={aoMudar(setRevisaoAtiva)} />
              {revisaoAtiva && (
                <Select value={String(revisaoCada)} onValueChange={(v) => aoMudar(setRevisaoCada)(Number(v) as PeriodicidadeRevisao)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
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
          </Passo>

          <Passo n={6} titulo="Incluir recesso?">
            <div className="flex flex-wrap items-center gap-2">
              <SimNao valor={recessoAtivo} aoTrocar={aoMudar(setRecessoAtivo)} />
              {recessoAtivo && (
                <Select value={recessoModo} onValueChange={(v) => aoMudar(setRecessoModo)(v as any)}>
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="natal">Natal</SelectItem>
                    <SelectItem value="ano_novo">Ano Novo</SelectItem>
                    <SelectItem value="natal_ano_novo">Natal + Ano Novo</SelectItem>
                    <SelectItem value="outras">Outras semanas</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            {recessoAtivo && recessoModo === 'outras' && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input type="date" value={recessoDe} onChange={(e) => aoMudar(setRecessoDe)(e.target.value)} className="w-40" />
                <span className="text-sm text-muted-foreground">até</span>
                <Input type="date" value={recessoAte} onChange={(e) => aoMudar(setRecessoAte)(e.target.value)} className="w-40" />
                <p className="w-full text-xs text-muted-foreground">
                  O intervalo é esticado para semanas inteiras. Sem as duas datas, nenhuma semana é bloqueada.
                </p>
              </div>
            )}
          </Passo>

          <Passo n={7} titulo="Cores das tabelas">
            <Select value={paletaSlug} onValueChange={(v) => setPaletaSlug(v ?? PALETAS[0].slug)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PALETAS.map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Passo>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={gerar} disabled={gerando || !cronogramaId} size="lg">
            {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {grade ? 'Gerar de novo' : 'Gerar meu cronograma'}
          </Button>
          {desatualizada && (
            <span className="text-sm text-amber-600">Você mudou as escolhas — gere de novo para atualizar a tabela.</span>
          )}
        </div>
      </Card>

      {grade && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Semanas', grade.resumo.totalSemanas],
              ['Dias por semana', grade.resumo.diasPorSemana],
              ['Atividades', grade.resumo.atividades],
              ['Conclusão', fmtBr(grade.resumo.conclusao)],
            ].map(([rotulo, valor]) => (
              <Card key={rotulo as string} className="p-4">
                <p className="text-2xl font-bold tabular-nums">{valor as any}</p>
                <p className="text-xs text-muted-foreground">{rotulo as string}</p>
              </Card>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">{grade.resumo.subtitulo}</p>

          <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <Select value={filtroSemana} onValueChange={(v) => setFiltroSemana(v ?? 'todas')}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as semanas</SelectItem>
                  {grade.semanas.map((s) => (
                    <SelectItem key={s.numero} value={String(s.numero)}>
                      Semana {s.numero}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v ?? 'todos')}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {ORDEM_TIPO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ROTULO_TELA[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="ml-auto text-xs text-muted-foreground">
                Os filtros são aplicados na hora — não é preciso gerar de novo.
              </span>
            </div>

            <div className="divide-y">
              {semanasVisiveis.map((s) => (
                <div key={s.numero}>
                  <div
                    className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm font-semibold text-white"
                    style={{ background: s.kind === 'conteudo' ? paleta.primaria : paleta.revisao }}
                  >
                    <span>Semana {s.numero}</span>
                    <span className="font-normal opacity-90">{fmtIntervalo(s.inicio, s.fim)}</span>
                    {s.kind === 'revisao' && <Badge variant="secondary">Semana de revisão</Badge>}
                    {s.kind === 'recesso' && <Badge variant="secondary">Semana de recesso</Badge>}
                  </div>

                  {s.kind === 'recesso' && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      Não há metas programadas nesta semana; o cronograma será retomado na próxima
                      segunda-feira.
                    </p>
                  )}

                  {s.kind === 'revisao' &&
                    s.blocos.map((b) => (
                      <div key={b.titulo} className="px-4 py-2">
                        <p className="text-sm font-medium">{b.titulo}</p>
                        <p className="text-sm text-muted-foreground">{b.texto}</p>
                      </div>
                    ))}

                  {s.kind === 'conteudo' &&
                    s.metas.map((m) => (
                      <div key={m.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5" style={{ background: paleta.celula }}>
                        <div className="w-24 shrink-0 text-xs">
                          <p className="font-medium">{fmtBr(m.data)}</p>
                          <p className="text-muted-foreground">{m.diaNome}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {ROTULO_TELA[m.tipo]}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">{m.titulo}</p>
                          {m.complemento && <p className="text-xs text-muted-foreground">{m.complemento}</p>}
                          {m.tipo === 'simulado' && m.simulado_externo_url && (
                            <a
                              href={m.simulado_externo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              {m.simulado_externo_nome ?? 'Abrir simulado'} <ExternalLink className="inline h-3 w-3" />
                            </a>
                          )}
                        </div>
                        {m.links && (
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            {m.links.urls.map((u) => (
                              <a
                                key={u.plataforma.id}
                                href={u.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border px-2 py-0.5 text-xs text-primary hover:bg-background"
                              >
                                {u.plataforma.nome}
                              </a>
                            ))}
                            {m.links.ausente && <span className="text-xs italic text-muted-foreground">{m.links.ausente}</span>}
                          </div>
                        )}
                        {m.duracao && <span className="shrink-0 text-xs text-muted-foreground">{m.duracao}</span>}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-wrap items-center gap-3 p-4">
            <Download className="h-5 w-5 text-muted-foreground" />
            <p className="flex-1 text-sm text-muted-foreground">
              As exportações em DOCX e CSV entram na próxima etapa. Seu cronograma fica salvo aqui — você pode
              fechar a página e voltar depois.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {n}
        </span>
        {titulo}
      </Label>
      {children}
    </div>
  )
}

function SimNao({ valor, aoTrocar }: { valor: boolean; aoTrocar: (v: boolean) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border">
      {[
        [true, 'Sim'],
        [false, 'Não'],
      ].map(([v, rotulo]) => (
        <button
          key={String(v)}
          onClick={() => aoTrocar(v as boolean)}
          className={`px-4 py-2 text-sm transition ${valor === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
        >
          {rotulo as string}
        </button>
      ))}
    </div>
  )
}
