'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock, ListChecks, Loader2, Target } from 'lucide-react'
import { QuestaoCard } from '@/components/aluno/questao-card'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { confirmar } from '@/components/ui/confirm-dialog'

// TELA DE RESOLUÇÃO das questões da plataforma de UMA meta do Cronograma Adaptativo.
// Contrato igual ao do leitor da Biblioteca: `meta` (id da meta) + `voltar` + `tseg` (tempo já acumulado).
//  • cronômetro CONTÍNUO (sobrevive à troca de página — espelhado em sessionStorage) que só conta com a aba visível;
//  • o tempo vai ao servidor (acao:'tempo') a cada ~60s, ao sair da aba e ao voltar/concluir;
//  • "Concluir" marca a meta como feita (acao:'meta', estado:'done', res/err) e volta ao cronograma.
// Tudo por rotas /api/aluno/* (nunca server action — domínio custom / iframe Curseduca).

const API = '/api/aluno/cronograma/adaptativo'
const FLUSH_MS = 60_000
const MAX_DELTA = 4 * 3600

interface Sessao { seg: number; enviado: number; resp: Record<string, boolean> }
const VAZIA: Sessao = { seg: 0, enviado: 0, resp: {} }

const fmt = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`
}

export function QuestoesMetaClient({
  questoes, total, page, porPagina, chave, metaId, titulo, voltar, tsegInicial,
}: {
  questoes: QuestaoAluno[]
  total: number
  page: number
  porPagina: number
  chave: string
  metaId: string | null
  titulo: string
  voltar: string
  tsegInicial: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [indo, startNav] = useTransition()
  const storageKey = `crono-qplat:${chave}:${metaId ?? ''}`

  const [sessao, setSessao] = useState<Sessao>(VAZIA)
  const [pronto, setPronto] = useState(false)
  const [concluindo, setConcluindo] = useState(false)
  const ref = useRef<Sessao>(VAZIA)
  ref.current = sessao

  // Restaura a sessão (troca de página / reload) — só no cliente, depois de montar.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) {
        const j = JSON.parse(raw) as Partial<Sessao>
        setSessao({ seg: Number(j.seg) || 0, enviado: Number(j.enviado) || 0, resp: j.resp && typeof j.resp === 'object' ? j.resp : {} })
      }
    } catch { /* sem storage → começa do zero */ }
    setPronto(true)
  }, [storageKey])
  useEffect(() => {
    if (!pronto) return
    try { sessionStorage.setItem(storageKey, JSON.stringify(sessao)) } catch { /* no-op */ }
  }, [sessao, pronto, storageKey])

  // Cronômetro: +1s por segundo, só com a aba visível.
  useEffect(() => {
    if (!pronto) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') setSessao((s) => ({ ...s, seg: s.seg + 1 })) }, 1000)
    return () => clearInterval(t)
  }, [pronto])

  // Envia ao servidor o tempo ainda não enviado (idempotente por delta).
  const enviarTempo = useCallback((keepalive = false) => {
    if (!metaId) return
    const s = ref.current
    const delta = Math.min(MAX_DELTA, s.seg - s.enviado)
    if (delta < 5) return
    setSessao((c) => ({ ...c, enviado: c.enviado + delta }))
    ref.current = { ...s, enviado: s.enviado + delta }
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive, body: JSON.stringify({ acao: 'tempo', metaId, segAdd: delta }) }).catch(() => {})
  }, [metaId])

  useEffect(() => {
    if (!pronto || !metaId) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') enviarTempo() }, FLUSH_MS)
    const onVisibilidade = () => { if (document.visibilityState === 'hidden') enviarTempo(true) }
    const onPageHide = () => enviarTempo(true) // no pagehide a aba ainda aparece "visible" → handler próprio
    document.addEventListener('visibilitychange', onVisibilidade)
    window.addEventListener('pagehide', onPageHide)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisibilidade); window.removeEventListener('pagehide', onPageHide); enviarTempo(true) }
  }, [pronto, metaId, enviarTempo])

  const onResponder = useCallback(({ questaoId, correta }: { questaoId: string; correta: boolean }) => {
    setSessao((s) => ({ ...s, resp: { ...s.resp, [questaoId]: correta } }))
  }, [])

  const respondidas = Object.keys(sessao.resp).length
  const acertos = Object.values(sessao.resp).filter(Boolean).length
  const naPagina = useMemo(() => questoes.filter((q) => q.id in sessao.resp).length, [questoes, sessao.resp])
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const pctAcerto = respondidas ? Math.round((acertos / respondidas) * 100) : 0
  const pctProg = total ? Math.min(100, Math.round((respondidas / total) * 100)) : 0

  function irParaPagina(p: number) {
    const q = new URLSearchParams(sp.toString())
    if (p <= 1) q.delete('page'); else q.set('page', String(p))
    startNav(() => router.push(`${pathname}?${q.toString()}`))
  }

  function sair(destino = voltar) {
    enviarTempo(true)
    try { sessionStorage.removeItem(storageKey) } catch { /* no-op */ }
    window.dispatchEvent(new Event('navprogress:start'))
    router.push(destino)
  }

  async function concluir() {
    if (!metaId) return
    if (respondidas === 0) {
      const ok = await confirmar({ titulo: 'Concluir sem responder?', mensagem: 'Você ainda não respondeu nenhuma questão desta meta. Concluir mesmo assim?', confirmar: 'Concluir' })
      if (!ok) return
    }
    setConcluindo(true)
    try {
      enviarTempo(true)
      const r = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'meta', metaId, patch: { estado: 'done', res: respondidas, err: respondidas - acertos } }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) { toast.error(j?.message || 'Não foi possível concluir a meta. Tente novamente.'); setConcluindo(false); return }
      toast.success('Meta concluída!')
      sair()
    } catch {
      toast.error('Falha de rede ao concluir a meta.')
      setConcluindo(false)
    }
  }

  const tempoMeta = tsegInicial + sessao.seg

  // Desktop: a página ocupa EXATAMENTE o que sobra da tela abaixo do topo (medido, sem número fixo) — só a
  // coluna das questões rola e a barra lateral fica sempre à vista, sem faixa sobrando nem cortando embaixo.
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const ajustar = () => {
      if (!window.matchMedia('(min-width: 1024px)').matches) { el.style.height = ''; return }
      const topo = el.getBoundingClientRect().top
      el.style.height = `${Math.max(360, Math.floor(window.innerHeight - topo))}px`
    }
    ajustar()
    window.addEventListener('resize', ajustar)
    const t = window.setTimeout(ajustar, 300) // depois do shell terminar de montar
    return () => { window.removeEventListener('resize', ajustar); window.clearTimeout(t) }
  }, [])

  return (
    // O <main> do shell não tem padding nesta área (cada página traz o seu) e a rolagem dele não serve de
    // referência p/ `sticky`: no desktop a página tem altura fixa e SÓ a coluna das questões rola — a barra
    // lateral (tempo/progresso/ações) fica sempre visível.
    <div ref={raiz} className="space-y-4 px-4 py-5 sm:px-6 lg:flex lg:flex-col lg:space-y-0 lg:gap-4 lg:px-8 lg:pb-4 lg:pt-4">
      <button type="button" onClick={() => sair()} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar ao cronograma
      </button>

      <header className="shrink-0 space-y-1 border-b pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Questões da plataforma</p>
        <h1 className="text-2xl font-bold tracking-tight">{titulo || 'Questões da meta'}</h1>
        <p className="text-sm text-muted-foreground">Filtradas para esta meta · {total.toLocaleString('pt-BR')} {total === 1 ? 'questão' : 'questões'} · responda e confira o gabarito de cada uma.</p>
      </header>

      <div className="grid items-start gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-stretch">
        {/* Questões (rolam sozinhas no desktop) */}
        <div className="min-w-0 space-y-4 lg:overflow-y-auto lg:pb-2 lg:pr-2">
          {questoes.map((q, i) => (
            <QuestaoCard key={q.id} questao={q} numero={(page - 1) * porPagina + i + 1} onResponder={onResponder} />
          ))}

          <Paginacao page={page} totalPaginas={totalPaginas} onIr={irParaPagina} ocupado={indo} />
        </div>

        {/* Barra lateral: progresso + tempo + ações */}
        <aside className="order-first space-y-3 lg:order-last lg:overflow-y-auto">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Clock className="h-3.5 w-3.5" />Tempo</p>
            <div className="text-3xl font-bold tabular-nums tracking-tight">{fmt(sessao.seg)}</div>
            <p className="text-xs text-muted-foreground">nesta sessão{metaId && tsegInicial > 0 ? ` · ${fmt(tempoMeta)} no total da meta` : ''}</p>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Target className="h-3.5 w-3.5" />Progresso</p>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tabular-nums">{respondidas}</span>
              <span className="text-xs text-muted-foreground">de {total.toLocaleString('pt-BR')} respondidas</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pctProg} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pctProg}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-muted/50 p-2"><dd className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{acertos}</dd><dt className="text-[11px] text-muted-foreground">acertos{respondidas ? ` · ${pctAcerto}%` : ''}</dt></div>
              <div className="rounded-xl bg-muted/50 p-2"><dd className="text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">{respondidas - acertos}</dd><dt className="text-[11px] text-muted-foreground">erros</dt></div>
            </dl>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><ListChecks className="h-3.5 w-3.5" />Nesta página: {naPagina}/{questoes.length} · página {page} de {totalPaginas}</p>
          </div>

          <div className="space-y-2">
            {metaId && (
              <button type="button" onClick={concluir} disabled={concluindo}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
                {concluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Concluir meta e voltar
              </button>
            )}
            <button type="button" onClick={() => sair()} disabled={concluindo}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium transition hover:bg-muted disabled:opacity-60">
              <ArrowLeft className="h-4 w-4" />Voltar ao cronograma
            </button>
            {!metaId && <p className="text-center text-[11px] text-muted-foreground">Meta já concluída: aqui você só revisa as questões (nada é alterado no cronograma).</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Paginacao({ page, totalPaginas, onIr, ocupado }: { page: number; totalPaginas: number; onIr: (p: number) => void; ocupado: boolean }) {
  if (totalPaginas <= 1) return null
  const btn = 'inline-flex h-9 items-center gap-1 rounded-lg border bg-card px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-40'
  return (
    <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Paginação">
      <button type="button" className={btn} disabled={page <= 1 || ocupado} onClick={() => onIr(page - 1)}><ChevronLeft className="h-4 w-4" />Anterior</button>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">{ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Página <b className="text-foreground tabular-nums">{page}</b> de <span className="tabular-nums">{totalPaginas}</span></span>
      <button type="button" className={btn} disabled={page >= totalPaginas || ocupado} onClick={() => onIr(page + 1)}>Próxima<ChevronRight className="h-4 w-4" /></button>
    </nav>
  )
}
