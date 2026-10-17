'use client'

// Aba "DESAFIOS" da aplicação de simulados (admin). Padrão igual ao JurisClub:
//  • SEM desafio selecionado → BLOCO DE INÍCIO: cards/tickets dos desafios + "Novo desafio".
//  • COM desafio (?desafio=<id>) → ÁREA INTERNA com abas:
//      Simulados (adicionar/criar dentro dele) · Selos · Ranking (geral dos N, separado/junto) ·
//      Acessos · Configurações (regras + personalização = toda a edição do bloco).
// FASE 1: estrutura + desafio "Maratona" (mock da config). FASE 2: CRUD real no banco.

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trophy, Plus, ArrowLeft, FileText, Medal, BarChart3, Users, Settings, Flag, Calendar, Award, Info, Palette, Loader2, ImagePlus, Crop, RefreshCw, Trash2, Search, X, ScrollText, ChevronRight, GripVertical, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MARATONA, type MaratonaConfig } from '@/lib/maratona/config'
import { REGULAMENTO_PADRAO } from '@/lib/leitura/regulamento'
import { MaratonaCardDestaque } from '@/components/aluno/maratona/maratona-card-destaque'
import { ModuloAcesso } from '@/components/admin/modulo-acesso'
import { RankingAdmin } from '@/components/admin/ranking-admin'
import { ModuloMedalhasForm } from '@/components/admin/modulo-medalhas-form'
import { ModuloRegulamentoForm } from '@/components/admin/modulo-regulamento-form'
import { CardSimuladoAdmin, MoverSimuladoDialog, CopiarSimuladoDialog, type SimuladoCard, type DestinoSim } from '@/components/admin/simulados-board'
import { NovoSimuladoDialog } from '@/components/admin/novo-simulado-dialog'
import { ImageCropper, type CropState } from '@/app/admin/simulados/criar/image-cropper'
import { obterRankingMaratona, salvarConfigMaratona, salvarConquistasDesafio, salvarCarimbosDesafio, salvarRegulamentoDesafio, type ConfigDesafioSim, type ContagemDesafio, type EtapaMaratona } from '@/app/admin/simulados/desafios-actions'
import type { ModuloConquistaDef, CarimboDef, CarimboCondicaoTipo } from '@/lib/leitura/carimbos-tipos'
import { moverSimuladoParaPasta } from '@/app/admin/simulados/actions'
import type { RankingLeitura } from '@/lib/leitura/ranking'
import { useTransition } from 'react'
import { createPortal } from 'react-dom'

const DMa = (iso: string) => { const [, m, d] = (iso || '').split('-'); return d && m ? `${d}/${m}` : iso }
// Visual do desafio (um por enquanto) vem da config; o ID REAL (pasta) vem do servidor p/ wirar os componentes.
const DESAFIO = { ...MARATONA, lancada: true, capa: MARATONA.capaUrl }

export function DesafiosSimuladoAdmin({ desafioId, maratonaId, rankingInicial, config, contagem, simuladosDesafio = [], simuladosFora = [], appUrl = '', selos, destinos = [] }: { desafioId: string | null; maratonaId: string; rankingInicial: RankingLeitura; config?: ConfigDesafioSim; contagem?: ContagemDesafio; simuladosDesafio?: SimuladoCard[]; simuladosFora?: { id: string; titulo: string; status: string }[]; appUrl?: string; selos?: { conquistas: ModuloConquistaDef[]; carimbos: CarimboDef[] }; destinos?: DestinoSim[] }) {
  if (desafioId) return <DesafioInterno desafio={config ?? { ...DESAFIO }} pastaId={desafioId} rankingInicial={rankingInicial} contagem={contagem ?? { simulados: 0, inscritos: 0 }} simulados={simuladosDesafio} fora={simuladosFora} appUrl={appUrl} selos={selos ?? { conquistas: [], carimbos: [] }} destinos={destinos} />
  return <DesafiosLista maratonaId={maratonaId} desafio={config ? { ...config, capa: config.capaUrl } : DESAFIO} />
}

/* ─────────── BLOCO DE INÍCIO: cards dos desafios ─────────── */
function DesafiosLista({ maratonaId, desafio }: { maratonaId: string; desafio?: typeof DESAFIO }) {
  const d = desafio ?? DESAFIO
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Um desafio agrupa vários simulados numa jornada (ex.: maratona), com ranking, selos e acesso próprios.</p>
        <button type="button" onClick={() => toast('Criar desafio chega na próxima fase (cadastro no banco).', { icon: '🏁' })}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo desafio
        </button>
      </div>
      {/* Card em estilo TICKET (igual aos simulados): imagem 4:3 à esquerda, infos à direita. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Link href={`/admin/simulados?tab=desafios&desafio=${maratonaId}`}
          className="group/card relative flex h-32 overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:h-36">
          <div className="relative aspect-[4/3] h-full shrink-0 overflow-hidden bg-muted">
            <img src={d.capa} alt="" className="h-full w-full object-cover transition-transform group-hover/card:scale-[1.03]" />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur"><Trophy className="h-3 w-3 text-amber-300" /> Desafio</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between px-3 pb-2 pt-2">
            <div className="flex min-h-6 items-center">
              <span className={cn('inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', d.lancada ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')}>{d.lancada ? 'Lançado' : 'Rascunho'}</span>
            </div>
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground sm:text-[15px]">{d.titulo} <span className="text-primary">{d.destaque}</span></h3>
              <p className="line-clamp-1 text-[11px] text-muted-foreground">{d.qtdSimulados} simulados · {DMa(d.inicio)} a {DMa(d.fim)}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Abrir desafio <ChevronRight className="h-3.5 w-3.5" /></span>
          </div>
        </Link>
      </div>
    </div>
  )
}

/* ─────────── ÁREA INTERNA do desafio (igual ao admin dos desafios: back + h1 + abas underline) ─────────── */
type Aba = 'simulados' | 'selos' | 'ranking' | 'acessos' | 'regulamento' | 'config'
const ABAS: { k: Aba; label: string; icon: React.ReactNode }[] = [
  { k: 'simulados', label: 'Simulados', icon: <FileText className="h-4 w-4" /> },
  { k: 'selos', label: 'Selos', icon: <Medal className="h-4 w-4" /> },
  { k: 'ranking', label: 'Ranking', icon: <BarChart3 className="h-4 w-4" /> },
  { k: 'acessos', label: 'Acessos', icon: <Users className="h-4 w-4" /> },
  { k: 'regulamento', label: 'Regulamento', icon: <ScrollText className="h-4 w-4" /> },
  { k: 'config', label: 'Configurações', icon: <Settings className="h-4 w-4" /> },
]

function DesafioInterno({ desafio, pastaId, rankingInicial, contagem, simulados, fora, appUrl, selos, destinos }: { desafio: ConfigDesafioSim; pastaId: string; rankingInicial: RankingLeitura; contagem: ContagemDesafio; simulados: SimuladoCard[]; fora: { id: string; titulo: string; status: string }[]; appUrl: string; selos: { conquistas: ModuloConquistaDef[]; carimbos: CarimboDef[] }; destinos: DestinoSim[] }) {
  const [aba, setAba] = useState<Aba>('simulados')
  return (
    <div className="space-y-4">
      {/* Cabeçalho (igual ao JurisClub): voltar (ícone) + título + status + subtítulo */}
      <div className="flex items-start gap-2">
        <Link href="/admin/simulados?tab=desafios" aria-label="Voltar aos desafios" title="Voltar aos desafios"
          className="mt-1 inline-flex shrink-0 items-center justify-center rounded-lg border bg-card p-2 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            <Trophy className="h-6 w-6 text-primary" /> {desafio.titulo} <span className="text-primary">{desafio.destaque}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', desafio.lancada ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{desafio.lancada ? 'Lançado' : 'Rascunho'}</span>
          </h1>
          <p className="text-muted-foreground">{desafio.qtdSimulados} simulados · {DMa(desafio.inicio)} a {DMa(desafio.fim)} · inscrições até {DMa(desafio.inscricoesAte)}</p>
        </div>
      </div>

      <TabsBar aba={aba} setAba={setAba} />

      <div className="pt-1">
        {aba === 'simulados' && <AbaSimulados pastaId={pastaId} simulados={simulados} fora={fora} appUrl={appUrl} destinos={destinos} etapas={desafio.etapas} />}
        {aba === 'selos' && <AbaSelos pastaId={pastaId} selos={selos} simulados={simulados} />}
        {/* RANKING e ACESSOS: componentes REAIS da plataforma (mesmos do JurisClub), por pasta/módulo. */}
        {aba === 'ranking' && <RankingAdmin inicial={rankingInicial} moduloId={pastaId} moduloNome={`${desafio.titulo} ${desafio.destaque}`} loader={obterRankingMaratona} rotulos={{ aulas: 'Simulados' }} detalheAluno={false} />}
        {aba === 'acessos' && <ModuloAcesso pastaId={pastaId} area="maratona" />}
        {/* REGULAMENTO: mesma tela do Lei Seca (ModuloRegulamentoForm), gravando em desafio_jogo.config.regulamento. */}
        {aba === 'regulamento' && <ModuloRegulamentoForm key={pastaId} pastaId={pastaId} atual={desafio.regulamento ?? REGULAMENTO_PADRAO} salvar={salvarRegulamentoDesafio} />}
        {aba === 'config' && <AbaConfig pastaId={pastaId} inicial={desafio} contagem={contagem} />}
      </div>
    </div>
  )
}

// Barra de abas com underline DESLIZANTE (mesma do JurisTabsBar), navegando por estado.
function TabsBar({ aba, setAba }: { aba: Aba; setAba: (a: Aba) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ left: number; width: number }>({ left: 0, width: 0 })
  useEffect(() => {
    const medir = () => { const el = ref.current?.querySelector<HTMLElement>('[data-on="1"]'); if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth }) }
    medir(); window.addEventListener('resize', medir); return () => window.removeEventListener('resize', medir)
  }, [aba])
  return (
    <div ref={ref} className="relative flex gap-8 overflow-x-auto border-b pl-1 text-sm">
      {ABAS.map((a) => (
        <button key={a.k} type="button" data-on={aba === a.k ? '1' : '0'} onClick={() => setAba(a.k)}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-md py-2 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40', aba === a.k ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
          {a.icon} {a.label}
        </button>
      ))}
      <span className="absolute bottom-[-1px] h-0.5 rounded-full bg-primary transition-all duration-300 ease-out" style={{ left: ind.left, width: ind.width }} />
    </div>
  )
}

/* ── Simulados do desafio: cada simulado é COLOCADO numa das 3 ÁREAS do percurso (onde o link/acesso dele
 *  aparece). A data/liberação/regras vêm do PRÓPRIO simulado (editadas na área interna dele). ── */
const AREAS_MARATONA = 3 // o percurso tem 3 áreas de simulado (checkpoints)
/** Formata segundos em "1h 20min 30s" (omite as partes zeradas). */
function fmtDur(seg: number): string {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60
  return [h ? `${h}h` : '', m ? `${m}min` : '', s ? `${s}s` : ''].filter(Boolean).join(' ') || '0s'
}
type EtapaItem = { id: string; slot: number; rotulo: string; custom: boolean; segMin: number } // slot 0=não incluído; rotulo=texto do nome (sempre preservado); custom=aplica o nome personalizado; segMin=tempo mín. no simulado p/ o check-in, em seg (0=sem mínimo)

function AbaSimulados({ pastaId, simulados, fora, appUrl, destinos, etapas }: { pastaId: string; simulados: SimuladoCard[]; fora: { id: string; titulo: string; status: string }[]; appUrl: string; destinos: DestinoSim[]; etapas?: EtapaMaratona[] }) {
  const router = useRouter()
  const [movendo, setMovendo] = useState<SimuladoCard | null>(null)
  const [copiando, setCopiando] = useState<SimuladoCard | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pend, start] = useTransition()

  const porId = useMemo(() => new Map(simulados.map((s) => [s.id, s])), [simulados])
  const inicial = useMemo<EtapaItem[]>(() => {
    const et = Array.isArray(etapas) ? etapas : []
    const vistos = new Set<string>()
    const base: EtapaItem[] = []
    const norm = (v: any) => { const n = Number(v) || 0; return n >= 1 && n <= AREAS_MARATONA ? n : 0 }
    for (const e of et) if (porId.has(e.simuladoId) && !vistos.has(e.simuladoId)) {
      vistos.add(e.simuladoId)
      const rotulo = (e.rotulo ?? '').toString()
      // custom ligado: explícito (rotuloOn) ou, p/ dados antigos sem a flag, quando há texto salvo.
      const custom = e.rotuloOn === true || (e.rotuloOn === undefined && !!rotulo.trim())
      base.push({ id: e.simuladoId, slot: norm(e.slot), rotulo, custom, segMin: Math.max(0, Math.round(Number(e.segMin) || 0)) })
    }
    for (const s of simulados) if (!vistos.has(s.id)) base.push({ id: s.id, slot: 0, rotulo: '', custom: false, segMin: 0 })
    return base
  }, [etapas, simulados, porId])

  const [itens, setItens] = useState<EtapaItem[]>(inicial)
  useEffect(() => { setItens(inicial) }, [inicial]) // ressincroniza ao adicionar/remover simulado
  const [drag, setDrag] = useState<number | null>(null)
  const dirty = JSON.stringify(itens) !== JSON.stringify(inicial)

  const reorder = (from: number, to: number) => { if (from === to) return; setItens((p) => { const a = [...p]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a }) }
  // Atribui a área; se outro simulado já está nessa área, libera o outro (uma área = um simulado).
  const setSlot = (id: string, slot: number) => setItens((p) => p.map((it) => it.id === id ? { ...it, slot } : (slot !== 0 && it.slot === slot ? { ...it, slot: 0 } : it)))
  const setRotulo = (id: string, rotulo: string) => setItens((p) => p.map((it) => it.id === id ? { ...it, rotulo } : it))
  const setSegMin = (id: string, segMin: number) => setItens((p) => p.map((it) => it.id === id ? { ...it, segMin: Math.max(0, Math.round(segMin) || 0) } : it))
  // Liga/desliga o nome personalizado SEM apagar o texto digitado (fica salvo p/ quando religar).
  const toggleCustom = (id: string, on: boolean) => setItens((p) => p.map((it) => it.id === id ? { ...it, custom: on } : it))

  function salvar() {
    start(async () => {
      const novas: EtapaMaratona[] = itens.map((it) => ({ simuladoId: it.id, ...(it.slot ? { slot: it.slot } : {}), ...(it.rotulo.trim() ? { rotulo: it.rotulo.trim() } : {}), rotuloOn: it.custom, ...(it.segMin ? { segMin: it.segMin } : {}) }))
      const r = await salvarConfigMaratona(pastaId, { etapas: novas })
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar.'); return }
      toast.success('Maratona salva.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">A maratona tem <b>3 áreas</b> no percurso. Escolha <b>em qual área</b> cada simulado aparece (onde o link/acesso dele entra) — <b>uma área por simulado</b>. A <b>data</b>, a <b>liberação</b> e as demais regras vêm de <b>dentro do próprio simulado</b> (nada a repetir aqui).</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-muted"><Plus className="h-4 w-4" /> Adicionar existente</button>
          <NovoSimuladoDialog destino={pastaId} trigger={
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"><Plus className="h-4 w-4" /> Criar simulado</button>
          } />
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          Nenhum simulado neste desafio ainda. Use <b>Criar simulado</b> ou <b>Adicionar existente</b>.
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map((it, i) => {
            const s = porId.get(it.id)
            if (!s) return null
            return (
              <div key={it.id}
                onDragEnter={() => { if (drag !== null && drag !== i) { reorder(drag, i); setDrag(i) } }}
                onDragOver={(e) => { if (drag !== null) e.preventDefault() }}
                onDrop={() => setDrag(null)}
                className={cn('rounded-2xl border bg-muted/20 p-2 transition', drag === i && 'opacity-60 ring-2 ring-primary/50')}>
                <div className="flex flex-wrap items-stretch gap-2 lg:flex-nowrap">
                  {/* ALÇA de arrastar (só ela é draggable → os links/menu do card continuam clicáveis). */}
                  <span draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)} title="Arraste para reordenar"
                    className="flex cursor-grab touch-none select-none flex-col items-center justify-center rounded-xl px-1 text-muted-foreground transition-colors hover:bg-muted active:cursor-grabbing">
                    <GripVertical className="h-4 w-4" />
                  </span>
                  {/* CARD COMPLETO do simulado — editar, personalizar, mover, copiar, ao-vivo (intacto).
                      Data/liberação/regras vêm daqui (editadas na área interna do simulado). */}
                  <div className="min-w-0 flex-1">
                    <CardSimuladoAdmin s={s} appUrl={appUrl} online={0} variant="ticket" selecionado={false} onSelecionar={() => {}} onMover={() => setMovendo(s)} onCopiar={() => setCopiando(s)} />
                  </div>
                  {/* CONFIGURADOR — área do percurso + nome exibido (mesma linha) + tempo mínimo. Largura ~ a do card. */}
                  <div className="flex w-full flex-col justify-center gap-3 rounded-xl border bg-card p-3 lg:min-w-0 lg:flex-1">
                    {/* LINHA 1: "Onde aparece" e "Nome exibido" lado a lado. */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                      <label className="flex flex-1 flex-col gap-1 text-xs font-semibold">Onde aparece na maratona
                        <select value={it.slot} onChange={(e) => setSlot(it.id, Number(e.target.value))}
                          className="h-9 w-full rounded-lg border bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                          <option value={0}>Não incluir no percurso</option>
                          {Array.from({ length: AREAS_MARATONA }, (_, k) => k + 1).map((n) => (
                            <option key={n} value={n}>Área {n} do percurso</option>
                          ))}
                        </select>
                      </label>
                      {/* NOME EXIBIDO: título em cima (alinhado ao "Onde aparece") + o campo/texto do nome.
                          A opção "Usar nome personalizado" ficou LÁ EMBAIXO, após a caixa de tempo. */}
                      <div className="flex flex-1 flex-col gap-1.5">
                        <span className="text-xs font-semibold">Nome exibido na maratona</span>
                        {it.custom
                          ? <input value={it.rotulo} onChange={(e) => setRotulo(it.id, e.target.value)} placeholder="ex.: AGU"
                              className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
                          : <span className="flex h-9 items-center truncate text-[12px] text-muted-foreground" title={s.titulo}>Usa o nome real: <b className="ml-1 font-medium text-foreground">{s.titulo}</b></span>}
                      </div>
                    </div>
                    {/* LINHA 2: TEMPO MÍNIMO + opção de nome personalizado + "aparece na área" — tudo na MESMA linha. */}
                    <div className="flex flex-col gap-1.5 border-t pt-3">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        {/* Tempo mínimo (h/min/seg) */}
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold">Tempo mínimo no simulado</span>
                          <div className="flex items-center gap-1.5">
                            <input type="number" min={0} value={Math.floor(it.segMin / 3600)} onChange={(e) => setSegMin(it.id, (Number(e.target.value) || 0) * 3600 + (it.segMin % 3600))}
                              className="h-8 w-16 rounded-lg border bg-background px-2.5 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
                            <span className="text-[11px] text-muted-foreground">h</span>
                            <input type="number" min={0} max={59} value={Math.floor((it.segMin % 3600) / 60)} onChange={(e) => setSegMin(it.id, Math.floor(it.segMin / 3600) * 3600 + Math.min(59, Number(e.target.value) || 0) * 60 + (it.segMin % 60))}
                              className="h-8 w-16 rounded-lg border bg-background px-2.5 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
                            <span className="text-[11px] text-muted-foreground">min</span>
                            <input type="number" min={0} max={59} value={it.segMin % 60} onChange={(e) => setSegMin(it.id, Math.floor(it.segMin / 60) * 60 + Math.min(59, Number(e.target.value) || 0))}
                              className="h-8 w-16 rounded-lg border bg-background px-2.5 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
                            <span className="text-[11px] text-muted-foreground">seg</span>
                          </div>
                        </div>
                        {/* Opção de nome personalizado (desmarcar NÃO apaga o texto) + "aparece na área" */}
                        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <input type="checkbox" checked={it.custom} onChange={(e) => toggleCustom(it.id, e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
                          Usar nome personalizado
                        </label>
                        <span className="text-[11px] text-muted-foreground">{it.slot ? `Aparece na Área ${it.slot}.` : 'Não aparece no percurso.'}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{it.segMin ? `≥ ${fmtDur(it.segMin)} no simulado = ganha o selo da etapa.` : 'Sem mínimo (0 = selo ao encerrar).'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {itens.length > 0 && (
        <div className="flex items-center justify-end gap-2 pt-1">
          {dirty && <button type="button" onClick={() => setItens(inicial)} className="rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition hover:bg-muted">Descartar</button>}
          <button type="button" onClick={salvar} disabled={!dirty || pend}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50">
            {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar áreas
          </button>
        </div>
      )}

      {movendo && <MoverSimuladoDialog simulado={movendo} destinos={destinos} atualId={pastaId} onClose={() => setMovendo(null)} />}
      {copiando && <CopiarSimuladoDialog simulado={copiando} destinos={destinos} atualId={pastaId} onClose={() => setCopiando(null)} />}
      {addOpen && <AdicionarSimuladoDialog pastaId={pastaId} fora={fora} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); router.refresh() }} />}
    </div>
  )
}


/* Dialog "Adicionar existente": busca + vincula o simulado à pasta do desafio (moverSimuladoParaPasta). */
function AdicionarSimuladoDialog({ pastaId, fora, onClose, onAdded }: { pastaId: string; fora: { id: string; titulo: string; status: string }[]; onClose: () => void; onAdded: () => void }) {
  const [busca, setBusca] = useState('')
  const [pend, start] = useTransition()
  const [addingId, setAddingId] = useState<string | null>(null)
  const q = busca.trim().toLowerCase()
  const lista = q ? fora.filter((s) => s.titulo.toLowerCase().includes(q)) : fora
  function adicionar(id: string) {
    setAddingId(id)
    start(async () => {
      const r = await moverSimuladoParaPasta(id, pastaId)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao adicionar.'); setAddingId(null); return }
      toast.success('Simulado adicionado ao desafio.')
      onAdded()
    })
  }
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Adicionar simulado ao desafio</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar simulado…" className="w-full rounded-lg border bg-background py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-3">
          {lista.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nenhum simulado disponível.</p>}
          {lista.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0 flex-1"><b className="block truncate text-sm">{s.titulo}</b><span className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.status}</span></div>
              <button type="button" disabled={pend} onClick={() => adicionar(s.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
                {pend && addingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ── Selos (medalhas): MESMA aba do Lei Seca — Conquistas (ícone+condição) + Carimbos (imagem+condição),
 *    reusando ModuloMedalhasForm. Grava em conquistas_def/carimbos_def da pasta do desafio; a "condição
 *    por aula" vira "por simulado" (as opções são os simulados vinculados). ── */
// Condições relabeladas para o contexto de SIMULADOS (mesmos `tipo`, texto adaptado).
const CONDICAO_LABELS_SIM: Record<CarimboCondicaoTipo, string> = {
  concluir_modulo: 'Concluir o desafio (todos os simulados)',
  gabaritar_modulo: 'Gabaritar o desafio (100% em todos os simulados)',
  concluir_aulas: 'Concluir N simulados',
  gabaritar_aulas: 'Gabaritar N simulados',
  concluir_aula: 'Fazer simulado(s) específico(s)',
  gabaritar_aula: 'Gabaritar simulado(s) específico(s)',
}
const AULAS_TEXTOS_SIM = { emQuais: 'Em quais simulados:', todas: 'Todos os simulados', especificas: 'Simulados específicos', conta: 'simulado(s)', selecione: 'Selecione os simulados', filtrar: 'Filtrar simulados', escolher: 'Escolher simulados', vazio: 'Nenhum simulado no desafio ainda.' }
function AbaSelos({ pastaId, selos, simulados }: { pastaId: string; selos: { conquistas: ModuloConquistaDef[]; carimbos: CarimboDef[] }; simulados: SimuladoCard[] }) {
  const aulas = simulados.map((s) => ({ id: s.id, titulo: s.titulo }))
  return (
    <ModuloMedalhasForm
      pastaId={pastaId}
      conquistas={selos.conquistas}
      carimbos={selos.carimbos}
      aulas={aulas}
      salvarConquistas={salvarConquistasDesafio}
      salvarCarimbos={salvarCarimbosDesafio}
      rotuloAula={{ todas: 'Não exigir nestes simulados:', especificas: 'Exigir estes simulados:' }}
      condicaoLabels={CONDICAO_LABELS_SIM}
      aulasTextos={AULAS_TEXTOS_SIM}
      variante="simulado"
    />
  )
}


/* ── Configurações: edita a MESMA config que alimenta o card REAL do aluno, com PRÉVIA ao vivo desse
 * card (MaratonaCardDestaque) e capa com "Ajustar" (recorte/zoom 1:1, igual aos simulados). Tudo salvo
 * em desafio_jogo.config; imagens vão pro storage (hospedarBase64). ── */
const inputCls = 'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
function CampoInput({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon}{label}</span>
      {children}
    </label>
  )
}
// Alterna entre VINCULAR AO REAL (usa a contagem da plataforma) e um valor MANUAL (editável).
function VincularReal({ auto, setAuto, real, nome }: { auto: boolean; setAuto: (b: boolean) => void; real: number; nome: string }) {
  return (
    <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
      Vincular ao real <b className="text-foreground">({real.toLocaleString('pt-BR')} {nome})</b>
    </span>
  )
}
/** Redimensiona o arquivo ORIGINAL (p/ reeditar) em WebP até `max` px. */
async function redimImg(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const cv = document.createElement('canvas')
  cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s)
  const ctx = cv.getContext('2d'); if (!ctx) throw new Error('canvas')
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, cv.width, cv.height)
  const webp = cv.toDataURL('image/webp', 0.92)
  return webp.startsWith('data:image/webp') ? webp : cv.toDataURL('image/jpeg', 0.92)
}

function AbaConfig({ pastaId, inicial, contagem }: { pastaId: string; inicial: ConfigDesafioSim; contagem: ContagemDesafio }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [titulo, setTitulo] = useState(inicial.titulo)
  const [destaque, setDestaque] = useState(inicial.destaque)
  const [descricao, setDescricao] = useState(inicial.descricao)
  const [inscricoesAte, setInscricoesAte] = useState(inicial.inscricoesAte)
  const [inicio, setInicio] = useState(inicial.inicio)
  const [fim, setFim] = useState(inicial.fim)
  const [qtd, setQtd] = useState(inicial.qtdSimulados)
  const [qtdAuto, setQtdAuto] = useState(inicial.qtdSimuladosAuto !== false)
  const [padrao, setPadrao] = useState(inicial.padrao)
  const [xp, setXp] = useState(inicial.recompensa.xp)
  const [extra, setExtra] = useState(inicial.recompensa.extra ?? '')
  const [inscritos, setInscritos] = useState(inicial.inscritos)
  const [inscritosAuto, setInscritosAuto] = useState(inicial.inscritosAuto !== false)
  const [regulamentoUrl, setRegulamentoUrl] = useState(inicial.regulamentoUrl ?? '#')
  const [lancada, setLancada] = useState(inicial.lancada)
  // Visibilidade na home do aluno (default OCULTO — o desafio vive na própria área).
  const [mostrarNasPastas, setMostrarNasPastas] = useState(inicial.mostrarNasPastas === true)
  const [mostrarNosRecentes, setMostrarNosRecentes] = useState(inicial.mostrarNosRecentes === true)
  // Capa (1:1): a imagem exibida (capaUrl) + ORIGINAL p/ reajustar + estado do recorte (zoom/centro).
  const [capaUrl, setCapaUrl] = useState<string>(inicial.capaUrl ?? '')
  const [capaOrig, setCapaOrig] = useState<string | null>(inicial.capaOrig ?? null)
  const [capaCrop, setCapaCrop] = useState<CropState | null>(inicial.capaCrop ?? null)
  const [cropper, setCropper] = useState<{ file?: File; src?: string } | null>(null)
  const [pend, start] = useTransition()

  // Valores EFETIVOS: quando "vinculado ao real", usa a contagem da pasta; senão o número fixo.
  const qtdEfetivo = qtdAuto ? contagem.simulados : (Number(qtd) || 0)
  const inscritosEfetivo = inscritosAuto ? contagem.inscritos : (Number(inscritos) || 0)

  // Config AO VIVO montada do estado → a prévia é exatamente o card do aluno (WYSIWYG).
  const live: MaratonaConfig = {
    ...inicial,
    titulo, destaque, descricao, inscricoesAte, inicio, fim,
    qtdSimulados: qtdEfetivo, padrao,
    recompensa: { xp: Number(xp) || 0, extra: extra.trim() || undefined },
    inscritos: inscritosEfetivo, capaUrl: capaUrl || inicial.capaUrl, regulamentoUrl,
  }

  async function escolher(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem.'); return }
    try { const orig = await redimImg(file); setCapaOrig(orig); setCapaCrop(null); setCropper({ src: orig }) }
    catch { toast.error('Falha ao carregar a imagem.') }
  }
  function ajustar() { if (capaOrig) setCropper({ src: capaOrig }) }

  function salvar() {
    start(async () => {
      const r = await salvarConfigMaratona(pastaId, {
        titulo: titulo.trim(), destaque: destaque.trim(), descricao: descricao.trim(),
        inscricoesAte, inicio, fim, qtdSimulados: Number(qtd) || 0, qtdSimuladosAuto: qtdAuto, padrao: padrao.trim(),
        recompensa: { xp: Number(xp) || 0, extra: extra.trim() || undefined }, inscritos: Number(inscritos) || 0, inscritosAuto,
        regulamentoUrl: regulamentoUrl.trim() || '#', lancada, mostrarNasPastas, mostrarNosRecentes,
        capaUrl: capaUrl || inicial.capaUrl, capaOrig, capaCrop,
      })
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar.'); return }
      toast.success('Configurações salvas.')
      router.refresh()
    })
  }

  const btnOverlay = 'inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70'
  return (
    <div className="space-y-4">
      {/* PRÉVIA = o card REAL do aluno, atualizando ao vivo (cliques desativados). */}
      <Secao icon={<Trophy className="h-4 w-4 text-primary" />} titulo="Prévia do card (como o aluno vê)">
        <div className="pointer-events-none select-none">
          <MaratonaCardDestaque config={live} estado="aceitar" recolhidoInicial={false} />
        </div>
      </Secao>

      {/* CAPA do card (1:1) com Ajustar/Trocar/Remover — mesmo padrão dos simulados. */}
      <Secao icon={<Palette className="h-4 w-4 text-primary" />} titulo="Capa do card">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void escolher(f); e.target.value = '' }} />
        <div className="flex items-start gap-4">
          {capaUrl ? (
            <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-2xl border">
              <img src={capaUrl} alt="Capa do desafio" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
                <button type="button" onClick={ajustar} className={btnOverlay}><Crop className="h-3.5 w-3.5" /> Ajustar</button>
                <button type="button" onClick={() => fileRef.current?.click()} className={btnOverlay}><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                <button type="button" onClick={() => { setCapaUrl(''); setCapaOrig(null); setCapaCrop(null) }} className={cn(btnOverlay, 'hover:bg-rose-600')}><Trash2 className="h-3.5 w-3.5" /> Remover</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex h-36 w-36 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-medium">Adicionar capa</span>
            </button>
          )}
          <p className="text-xs text-muted-foreground">Imagem quadrada (1:1) — aparece flutuando no card do desafio. Depois de enviar, use <b>Ajustar</b> para enquadrar (posição e zoom). Ex.: 800×800px · JPG, PNG ou WebP.</p>
        </div>
      </Secao>

      {/* TODO o conteúdo exibido no card (textos + números que aparecem nos chips/destaques). Não são
          regras aplicadas — só o que o aluno lê no card. Por isso ficam juntos, na "Configuração do card". */}
      <Secao icon={<Info className="h-4 w-4 text-primary" />} titulo="Conteúdo do card">
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">Textos e números que aparecem no card (prévia acima). Não alteram a lógica do desafio — só o que é mostrado.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoInput label="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} /></CampoInput>
          <CampoInput label="Destaque (degradê dourado)"><input value={destaque} onChange={(e) => setDestaque(e.target.value)} className={inputCls} placeholder="Ex.: ENAP + AGU" /></CampoInput>
          <div className="sm:col-span-2"><CampoInput label="Descrição"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className={inputCls} /></CampoInput></div>
          <CampoInput label="Inscrições até" icon={<Calendar className="h-3.5 w-3.5" />}><input type="date" value={inscricoesAte} onChange={(e) => setInscricoesAte(e.target.value)} className={inputCls} /></CampoInput>
          <div className="grid grid-cols-2 gap-2">
            <CampoInput label="Início" icon={<Calendar className="h-3.5 w-3.5" />}><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputCls} /></CampoInput>
            <CampoInput label="Fim" icon={<Calendar className="h-3.5 w-3.5" />}><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={inputCls} /></CampoInput>
          </div>
          <CampoInput label="Qtd. simulados" icon={<FileText className="h-3.5 w-3.5" />}>
            <input type="number" min={0} value={qtdAuto ? contagem.simulados : qtd} disabled={qtdAuto} onChange={(e) => setQtd(Number(e.target.value))} className={cn(inputCls, qtdAuto && 'opacity-60')} />
            <VincularReal auto={qtdAuto} setAuto={setQtdAuto} real={contagem.simulados} nome="simulados vinculados" />
          </CampoInput>
          <CampoInput label="Padrão das provas"><input value={padrao} onChange={(e) => setPadrao(e.target.value)} className={inputCls} placeholder="Ex.: Cebraspe" /></CampoInput>
          <CampoInput label="Recompensa (XP)" icon={<Award className="h-3.5 w-3.5" />}><input type="number" min={0} value={xp} onChange={(e) => setXp(Number(e.target.value))} className={inputCls} /></CampoInput>
          <CampoInput label="Recompensa (extra)"><input value={extra} onChange={(e) => setExtra(e.target.value)} className={inputCls} placeholder="Ex.: adesivo exclusivo" /></CampoInput>
          <CampoInput label="Inscritos (exibidos)">
            <input type="number" min={0} value={inscritosAuto ? contagem.inscritos : inscritos} disabled={inscritosAuto} onChange={(e) => setInscritos(Number(e.target.value))} className={cn(inputCls, inscritosAuto && 'opacity-60')} />
            <VincularReal auto={inscritosAuto} setAuto={setInscritosAuto} real={contagem.inscritos} nome="alunos com acesso" />
          </CampoInput>
          <CampoInput label="Regulamento (link)"><input value={regulamentoUrl} onChange={(e) => setRegulamentoUrl(e.target.value)} className={inputCls} placeholder="https://… ou #" /></CampoInput>
        </div>
      </Secao>

      {/* Publicação = o único ajuste que muda o comportamento (visibilidade), separado do conteúdo do card. */}
      <Secao icon={<Flag className="h-4 w-4 text-primary" />} titulo="Publicação">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
          <input type="checkbox" checked={lancada} onChange={(e) => setLancada(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          Lançado <span className="font-normal text-muted-foreground">— quando ligado, o card aparece para quem tem acesso (Curseduca + Guru).</span>
        </label>
      </Secao>

      {/* Visibilidade na HOME do aluno — por padrão o desafio fica SÓ na própria área (não polui a home). */}
      <Secao icon={<Info className="h-4 w-4 text-primary" />} titulo="Visibilidade na home do aluno">
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">Por padrão o desafio vive só na própria área. Ligue abaixo para também mostrá-lo na home do aluno.</p>
        <div className="space-y-2.5">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium">
            <input type="checkbox" checked={mostrarNasPastas} onChange={(e) => setMostrarNasPastas(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
            <span>Mostrar a pasta do desafio na área de <b>Pastas</b> <span className="block font-normal text-muted-foreground">Quando desligado, a pasta do desafio não aparece na lista de pastas da home.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium">
            <input type="checkbox" checked={mostrarNosRecentes} onChange={(e) => setMostrarNosRecentes(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
            <span>Mostrar os simulados nos <b>Recentes</b> <span className="block font-normal text-muted-foreground">Quando desligado, os simulados do desafio não aparecem na fileira de recentes da home.</span></span>
          </label>
        </div>
      </Secao>

      <div className="flex items-center justify-end">
        <button type="button" onClick={salvar} disabled={pend} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
          {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />} Salvar configurações
        </button>
      </div>

      {cropper && (
        <ImageCropper file={cropper.file} src={cropper.src} aspect={1} titulo="Ajustar capa (1:1)"
          initialZoom={capaCrop?.zoom} initialCenter={capaCrop ? { x: capaCrop.cx, y: capaCrop.cy } : undefined}
          onCancel={() => setCropper(null)}
          onConfirm={(base64, state) => { setCapaUrl(base64); setCapaCrop(state); setCropper(null); toast.success('Enquadramento aplicado.') }} />
      )}
    </div>
  )
}

/* ── helpers ── */
function Secao({ icon, titulo, children }: { icon: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <b className="mb-3 flex items-center gap-2 text-sm">{icon}{titulo}</b>
      {children}
    </div>
  )
}
