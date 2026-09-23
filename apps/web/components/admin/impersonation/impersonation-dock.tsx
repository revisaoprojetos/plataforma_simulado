'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Loader2, Pencil, Maximize2, Minimize2, RefreshCw, RotateCw, Clock, ShieldAlert, AppWindow, ChevronDown, Columns2, PanelLeft, PanelRight, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { LoginLoading } from '@/components/aluno/login-loading'
import type { LoginConfig } from '@/lib/login-config'
import { buscarAlunosImpersonacao, type AlunoBusca } from '@/app/admin/impersonation/actions'

export type LoadingCfg = { config: LoginConfig; logo: string | null; logoBg: string; logoEstilo: string; logoFiltro: string; plataforma: string }
type StartResp = { session_id: string; expires_at: string; student: { id: string; name: string }; action_level: string }
export type Modo = 'encaixado' | 'expandido' | 'flutuante' | 'split'
type OpenVis = { aluno: AlunoBusca; pos: { x: number; y: number }; size: { w: number; h: number } }

const ERROS: Record<string, string> = {
  no_permission: 'Você não tem permissão para visualizar alunos.',
  out_of_scope: 'Aluno fora do seu escopo.',
  rate_limited: 'Muitas aberturas em pouco tempo. Aguarde um instante.',
  reauth_required: 'Sua sessão está antiga. Saia e entre de novo.',
  impersonation_disabled: 'A visualização de alunos está desativada nesta plataforma.',
  student_not_found: 'Aluno não encontrado.',
}

interface DockCtx {
  podeAbrir: boolean; isAdmin: boolean; loading: LoadingCfg
  busca: string; setBusca: (s: string) => void; alunos: AlunoBusca[]; buscando: boolean
  abertos: OpenVis[]; ativoId: string | null; ativo: AlunoBusca | null
  sessao: StartResp | null; erro: string | null
  modo: Modo; setModo: (m: Modo) => void; avisar: boolean; arrastando: boolean
  frameCarregando: boolean; onFrameLoad: () => void; recarregar: () => void; iframeRef: React.RefObject<HTMLIFrameElement | null>
  abrir: (a: AlunoBusca) => void; ativar: (id: string) => void; fecharUm: (id: string) => void; fecharTudo: () => void; renovar: () => void; saindoIds: string[]
  inicioGesto: (tipo: 'move' | 'resize', id: string, e: React.MouseEvent) => void
  containerRef: React.RefObject<HTMLDivElement | null>
  larguraPicker: number; iniciarSplit: (e: React.MouseEvent) => void
  alturaCard: number | null; iniciarAltura: (e: React.MouseEvent) => void
  trocador: boolean; setTrocador: (v: boolean) => void
  ladoSplit: 'left' | 'right'; setLadoSplit: (l: 'left' | 'right') => void
  larguraSplit: number; iniciarSplitLargura: (e: React.MouseEvent) => void; vp: { w: number; h: number }
}
const Ctx = createContext<DockCtx | null>(null)
export function useImpersonationDock() { const c = useContext(Ctx); if (!c) throw new Error('ImpersonationDockProvider ausente'); return c }

export function ImpersonationDockProvider({ podeAbrir, isAdmin, loading, children }: { podeAbrir: boolean; isAdmin: boolean; loading: LoadingCfg; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [busca, setBusca] = useState('')
  const [alunos, setAlunos] = useState<AlunoBusca[]>([])
  const [buscando, setBuscando] = useState(false)
  const [abertos, setAbertos] = useState<OpenVis[]>([])
  const [ativoId, setAtivoId] = useState<string | null>(null)
  const [sessao, setSessao] = useState<StartResp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>('encaixado')
  const [avisar, setAvisar] = useState(false)
  const [frameCarregando, setFrameCarregando] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  // Refresh estilo navegador: recarrega a PÁGINA ATUAL de dentro do iframe (mesma origem), sem
  // remontar — assim o aluno permanece onde estava (não volta ao Início).
  const recarregar = useCallback(() => { setFrameCarregando(true); try { iframeRef.current?.contentWindow?.location.reload() } catch { /* mesma origem esperada */ } }, [])
  const [trocador, setTrocador] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [ladoSplit, setLadoSplit] = useState<'left' | 'right'>('right')
  const [larguraSplit, setLarguraSplit] = useState(480)
  const [vp, setVp] = useState({ w: 1280, h: 800 })
  const abertosRef = useRef<OpenVis[]>([]); abertosRef.current = abertos
  const ativo = abertos.find((o) => o.aluno.id === ativoId)?.aluno ?? null

  useEffect(() => { const upd = () => setVp({ w: window.innerWidth, h: window.innerHeight }); upd(); window.addEventListener('resize', upd); return () => window.removeEventListener('resize', upd) }, [])

  useEffect(() => {
    if (!podeAbrir) return
    const t = setTimeout(async () => { setBuscando(true); const r = await buscarAlunosImpersonacao(busca).catch(() => null); if (r?.ok && r.alunos) setAlunos(r.alunos); setBuscando(false) }, busca ? 300 : 0)
    return () => clearTimeout(t)
  }, [busca, podeAbrir])

  const encerrarSessao = useCallback((sid: string, reason: 'closed_by_admin' | 'expired') => {
    fetch(`/api/admin/impersonate/${sid}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }), keepalive: true }).catch(() => {})
  }, [])

  // Torna `aluno` a visualização AO VIVO (única com sessão/iframe). Fecha a sessão anterior.
  const sessRef = useRef(sessao); sessRef.current = sessao
  const trocarAtivo = useCallback(async (aluno: AlunoBusca) => {
    const atual = sessRef.current
    if (atual) encerrarSessao(atual.session_id, 'closed_by_admin')
    setErro(null); setSessao(null); setFrameCarregando(true); setTrocador(false); setAtivoId(aluno.id)
    const r = await fetch('/api/admin/impersonate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: aluno.id }) })
    const dd = await r.json().catch(() => ({}))
    if (!r.ok) { setErro(ERROS[dd?.error] ?? 'Não foi possível abrir a conta do aluno.'); return }
    setSessao(dd as StartResp)
  }, [encerrarSessao])

  const abrir = useCallback((aluno: AlunoBusca) => {
    setAbertos((prev) => prev.some((o) => o.aluno.id === aluno.id) ? prev : [...prev, { aluno, pos: { x: 120 + prev.length * 30, y: 90 + prev.length * 30 }, size: { w: 940, h: 640 } }])
    trocarAtivo(aluno)
  }, [trocarAtivo])

  const ativar = useCallback((id: string) => { if (id === ativoId) return; const o = abertosRef.current.find((x) => x.aluno.id === id); if (o) trocarAtivo(o.aluno) }, [ativoId, trocarAtivo])

  const fecharUmAgora = useCallback((id: string) => {
    const rest = abertosRef.current.filter((o) => o.aluno.id !== id)
    setAbertos(rest)
    if (id !== ativoId) return
    const next = rest[rest.length - 1]
    if (next) trocarAtivo(next.aluno)
    else { const s = sessRef.current; if (s) encerrarSessao(s.session_id, 'closed_by_admin'); setSessao(null); setAtivoId(null); setModo('encaixado') }
  }, [ativoId, trocarAtivo, encerrarSessao])
  // No modo janela, anima a saída (~200ms) antes de remover; nos demais, remove na hora.
  const [saindoIds, setSaindoIds] = useState<string[]>([])
  const fecharUm = useCallback((id: string) => {
    if (modo === 'flutuante') {
      setSaindoIds((s) => (s.includes(id) ? s : [...s, id]))
      setTimeout(() => { fecharUmAgora(id); setSaindoIds((s) => s.filter((x) => x !== id)) }, 200)
    } else fecharUmAgora(id)
  }, [modo, fecharUmAgora])

  const fecharTudo = useCallback(() => { const s = sessRef.current; if (s) encerrarSessao(s.session_id, 'closed_by_admin'); setAbertos([]); setAtivoId(null); setSessao(null); setModo('encaixado') }, [encerrarSessao])

  useEffect(() => {
    if (!sessao) return
    const exp = new Date(sessao.expires_at).getTime()
    const t1 = setTimeout(() => setAvisar(true), Math.max(exp - Date.now() - 120_000, 0))
    const t2 = setTimeout(() => { encerrarSessao(sessao.session_id, 'expired'); setSessao(null) }, Math.max(exp - Date.now(), 0))
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [sessao, encerrarSessao])

  const renovar = useCallback(() => {
    if (!sessao) return
    fetch(`/api/admin/impersonate/${sessao.session_id}/renew`, { method: 'POST' }).then(async (r) => { const dd = await r.json().catch(() => ({})); if (r.ok && dd?.expires_at) { setSessao((s) => (s ? { ...s, expires_at: dd.expires_at } : s)); setAvisar(false) } }).catch(() => {})
  }, [sessao])

  useEffect(() => () => { const s = sessRef.current; if (s) encerrarSessao(s.session_id, 'closed_by_admin') }, [encerrarSessao])

  // Gestos das janelas (move/resize) — por id da visualização.
  const gesto = useRef<null | { tipo: 'move' | 'resize'; id: string; sx: number; sy: number; px: number; py: number; pw: number; ph: number }>(null)
  const mover = useCallback((e: MouseEvent) => {
    const g = gesto.current; if (!g) return
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy
    setAbertos((prev) => prev.map((o) => o.aluno.id !== g.id ? o : g.tipo === 'move'
      ? { ...o, pos: { x: Math.max(0, g.px + dx), y: Math.max(0, g.py + dy) } }
      : { ...o, size: { w: Math.max(460, g.pw + dx), h: Math.max(320, g.ph + dy) } }))
  }, [])
  const fimGesto = useCallback(() => { gesto.current = null; setArrastando(false); window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', fimGesto) }, [mover])
  const inicioGesto = useCallback((tipo: 'move' | 'resize', id: string, e: React.MouseEvent) => {
    e.preventDefault(); const v = abertosRef.current.find((o) => o.aluno.id === id); if (!v) return
    gesto.current = { tipo, id, sx: e.clientX, sy: e.clientY, px: v.pos.x, py: v.pos.y, pw: v.size.w, ph: v.size.h }
    setArrastando(true); window.addEventListener('mousemove', mover); window.addEventListener('mouseup', fimGesto)
  }, [mover, fimGesto])
  useEffect(() => () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', fimGesto) }, [mover, fimGesto])

  // Divisória do picker (console encaixado).
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [larguraPicker, setLarguraPicker] = useState(300)
  const splitMove = useCallback((e: MouseEvent) => { const r = containerRef.current?.getBoundingClientRect(); if (!r) return; setLarguraPicker(Math.min(560, Math.max(220, e.clientX - r.left))) }, [])
  const splitUp = useCallback(() => { setArrastando(false); window.removeEventListener('mousemove', splitMove); window.removeEventListener('mouseup', splitUp) }, [splitMove])
  const iniciarSplit = useCallback((e: React.MouseEvent) => { e.preventDefault(); setArrastando(true); window.addEventListener('mousemove', splitMove); window.addEventListener('mouseup', splitUp) }, [splitMove, splitUp])
  useEffect(() => () => { window.removeEventListener('mousemove', splitMove); window.removeEventListener('mouseup', splitUp) }, [splitMove, splitUp])

  // Alça de altura (console encaixado).
  const [alturaCard, setAlturaCard] = useState<number | null>(null)
  const altGesto = useRef<null | { sy: number; h: number }>(null)
  const altMove = useCallback((e: MouseEvent) => { const g = altGesto.current; if (!g) return; setAlturaCard(Math.max(360, g.h + (e.clientY - g.sy))) }, [])
  const altUp = useCallback(() => { altGesto.current = null; setArrastando(false); window.removeEventListener('mousemove', altMove); window.removeEventListener('mouseup', altUp) }, [altMove])
  const iniciarAltura = useCallback((e: React.MouseEvent) => { e.preventDefault(); altGesto.current = { sy: e.clientY, h: containerRef.current?.getBoundingClientRect().height ?? 500 }; setArrastando(true); window.addEventListener('mousemove', altMove); window.addEventListener('mouseup', altUp) }, [altMove, altUp])
  useEffect(() => () => { window.removeEventListener('mousemove', altMove); window.removeEventListener('mouseup', altUp) }, [altMove, altUp])

  // Largura da divisão (borda interna do painel lateral).
  const slGesto = useRef<null | { sx: number; w: number; lado: 'left' | 'right' }>(null)
  const slMove = useCallback((e: MouseEvent) => { const g = slGesto.current; if (!g) return; const delta = g.lado === 'right' ? g.sx - e.clientX : e.clientX - g.sx; setLarguraSplit(Math.min(window.innerWidth * 0.8, Math.max(340, g.w + delta))) }, [])
  const slUp = useCallback(() => { slGesto.current = null; setArrastando(false); window.removeEventListener('mousemove', slMove); window.removeEventListener('mouseup', slUp) }, [slMove])
  const iniciarSplitLargura = useCallback((e: React.MouseEvent) => { e.preventDefault(); slGesto.current = { sx: e.clientX, w: larguraSplit, lado: ladoSplit }; setArrastando(true); window.addEventListener('mousemove', slMove); window.addEventListener('mouseup', slUp) }, [larguraSplit, ladoSplit, slMove, slUp])
  useEffect(() => () => { window.removeEventListener('mousemove', slMove); window.removeEventListener('mouseup', slUp) }, [slMove, slUp])

  const ctx: DockCtx = {
    podeAbrir, isAdmin, loading, busca, setBusca, alunos, buscando,
    abertos, ativoId, ativo, sessao, erro, modo, setModo, avisar, arrastando, frameCarregando, onFrameLoad: () => setFrameCarregando(false), recarregar, iframeRef,
    abrir, ativar, fecharUm, fecharTudo, renovar, saindoIds, inicioGesto, containerRef,
    larguraPicker, iniciarSplit, alturaCard, iniciarAltura, trocador, setTrocador,
    ladoSplit, setLadoSplit, larguraSplit, iniciarSplitLargura, vp,
  }

  const temAbertos = abertos.length > 0
  const padStyle: React.CSSProperties = modo === 'split' && temAbertos ? (ladoSplit === 'right' ? { paddingRight: larguraSplit } : { paddingLeft: larguraSplit }) : {}

  return (
    <Ctx.Provider value={ctx}>
      <div className="transition-[padding] duration-300 ease-out" style={{ ...padStyle, ...(arrastando ? { transition: 'none' } : {}) }}>{children}</div>

      {/* JANELA: uma janela por visualização (ativa = ao vivo; demais = card "ativar"). */}
      {mounted && modo === 'flutuante' && abertos.map((o) => createPortal(<JanelaFlutuante key={o.aluno.id} vis={o} />, document.body))}

      {/* DIVIDIDA: painel lateral com abas (todas) + a ativa ao vivo. */}
      {mounted && modo === 'split' && temAbertos && createPortal(<PainelSplit />, document.body)}
    </Ctx.Provider>
  )
}

// ─────────────── Componentes ───────────────

const btnBarra = 'rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground'

/** Barra da visualização ATIVA (switcher + modos + fechar). Em janela é a alça de arraste. */
function Barra({ arrastavelId }: { arrastavelId?: string }) {
  const d = useImpersonationDock()
  const flut = d.modo === 'flutuante'
  return (
    <div onMouseDown={flut && arrastavelId ? (e) => d.inicioGesto('move', arrastavelId, e) : undefined}
      className={cn('flex items-center gap-2 border-b bg-muted/50 px-3 py-2', flut && arrastavelId && 'cursor-move select-none')}>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"><Pencil className="h-3 w-3" /> Operável</span>
      <div className="relative min-w-0 flex-1">
        <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => d.setTrocador(!d.trocador)} title="Abrir outro aluno"
          className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-sm transition-colors hover:bg-muted">
          <span className="truncate">Conta de <span className="font-semibold">{d.ativo?.nome}</span>{d.ativo?.email && <span className="text-muted-foreground"> · {d.ativo.email}</span>}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', d.trocador && 'rotate-180')} />
        </button>
        {d.trocador && <PickerPopover />}
      </div>
      <button type="button" onClick={d.recarregar} title="Atualizar (recarregar a conta)" className={btnBarra}><RotateCw className="h-4 w-4" /></button>
      {(d.modo === 'encaixado' || d.modo === 'expandido') && (
        <button type="button" onClick={() => d.setModo(d.modo === 'expandido' ? 'encaixado' : 'expandido')} title={d.modo === 'expandido' ? 'Recolher' : 'Expandir na tela'} className={btnBarra}>{d.modo === 'expandido' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
      )}
      {d.modo === 'split' && (
        <button type="button" onClick={() => d.setLadoSplit(d.ladoSplit === 'right' ? 'left' : 'right')} title={`Fixar à ${d.ladoSplit === 'right' ? 'esquerda' : 'direita'}`} className={btnBarra}>{d.ladoSplit === 'right' ? <PanelLeft className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}</button>
      )}
      <button type="button" onClick={() => d.setModo(d.modo === 'split' ? 'encaixado' : 'split')} title={d.modo === 'split' ? 'Encaixar na área' : 'Dividir tela'} className={cn(btnBarra, d.modo === 'split' && 'bg-primary/10 text-primary')}><Columns2 className="h-4 w-4" /></button>
      <button type="button" onClick={() => d.setModo(flut ? 'encaixado' : 'flutuante')} title={flut ? 'Encaixar na área' : 'Abrir em janela'} className={cn(btnBarra, flut && 'bg-primary/10 text-primary')}><AppWindow className="h-4 w-4" /></button>
      <button type="button" onClick={() => d.ativo && d.fecharUm(d.ativo.id)} title="Fechar esta visualização" className={btnBarra}><X className="h-4 w-4" /></button>
    </div>
  )
}

function PickerPopover() {
  const d = useImpersonationDock()
  return (
    <>
      <div className="fixed inset-0 z-[9]" onMouseDown={(e) => { e.stopPropagation(); d.setTrocador(false) }} />
      <div onMouseDown={(e) => e.stopPropagation()} className="absolute left-0 top-full z-[10] mt-1.5 w-80 max-w-[85vw] overflow-hidden rounded-xl border bg-card shadow-2xl">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={d.busca} onChange={(e) => d.setBusca(e.target.value)} placeholder="Buscar aluno…" className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            {d.buscando && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {d.alunos.length === 0 ? <p className="p-3 text-center text-sm text-muted-foreground">Nenhum aluno.</p> : d.alunos.map((a) => (
            <button key={a.id} type="button" onClick={() => d.abrir(a)} className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors', d.ativoId === a.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}>
              <AvatarEstudante nome={a.nome} avatar={a.avatar} cor={a.avatarCor ?? '#6d28d9'} className="h-7 w-7 shrink-0 text-[10px] text-white" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.nome}</span>{a.email && <span className="block truncate text-[11px] text-muted-foreground">{a.email}</span>}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function BannerAviso() {
  const d = useImpersonationDock()
  if (!d.avisar || !d.sessao) return null
  return (
    <div aria-live="polite" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
      <Clock className="h-3.5 w-3.5 shrink-0" /><span className="flex-1">A sessão vai expirar em breve.</span>
      <button type="button" onClick={d.renovar} className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 font-semibold hover:bg-amber-500/30"><RefreshCw className="h-3 w-3" /> Renovar</button>
    </div>
  )
}

/** Conteúdo AO VIVO da visualização ativa (iframe + carregamento branded). */
function Corpo() {
  const d = useImpersonationDock()
  if (d.erro) return <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"><ShieldAlert className="h-7 w-7 text-destructive" /><p className="max-w-sm text-sm text-destructive">{d.erro}</p></div>
  return (
    <div className="relative h-full w-full bg-background">
      {d.sessao && <iframe ref={d.iframeRef} key={d.sessao.session_id} src="/aluno" title={`Conta de ${d.ativo?.nome}`} onLoad={d.onFrameLoad} className={cn('h-full w-full border-0 bg-background', d.arrastando && 'pointer-events-none')} />}
      {(!d.sessao || d.frameCarregando) && <div className="absolute inset-0 z-[1]"><LoginLoading config={d.loading.config} plataforma={d.loading.plataforma} logo={d.loading.logo} logoBg={d.loading.logoBg} logoEstilo={d.loading.logoEstilo} logoFiltro={d.loading.logoFiltro} preview /></div>}
    </div>
  )
}

/** Card "pausado" de uma visualização não-ativa (clique para ativar). */
function CardPausado({ vis, arrastavelId }: { vis: OpenVis; arrastavelId?: string }) {
  const d = useImpersonationDock()
  return (
    <div className="flex h-full flex-col">
      <div onMouseDown={arrastavelId ? (e) => d.inicioGesto('move', arrastavelId, e) : undefined} className={cn('flex items-center gap-2 border-b bg-muted/50 px-3 py-2', arrastavelId && 'cursor-move select-none')}>
        <AvatarEstudante nome={vis.aluno.nome} avatar={vis.aluno.avatar} cor={vis.aluno.avatarCor ?? '#6d28d9'} className="h-6 w-6 shrink-0 text-[10px] text-white" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{vis.aluno.nome}</span>
        <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => d.fecharUm(vis.aluno.id)} title="Fechar" className={btnBarra}><X className="h-4 w-4" /></button>
      </div>
      <button type="button" onClick={() => d.ativar(vis.aluno.id)} className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground transition-colors hover:bg-muted/40">
        <AvatarEstudante nome={vis.aluno.nome} avatar={vis.aluno.avatar} cor={vis.aluno.avatarCor ?? '#6d28d9'} className="h-12 w-12 text-sm text-white" />
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"><Play className="h-3.5 w-3.5" /> Ativar</span>
        <span className="text-[11px]">Pausado — só uma visualização fica ao vivo por vez.</span>
      </button>
    </div>
  )
}

/** Uma janela flutuante (ativa = ao vivo; pausada = card). */
function JanelaFlutuante({ vis }: { vis: OpenVis }) {
  const d = useImpersonationDock()
  const ativo = vis.aluno.id === d.ativoId
  const saindo = d.saindoIds.includes(vis.aluno.id)
  return (
    <div className={cn('fixed z-[300] flex flex-col overflow-hidden rounded-xl border bg-card shadow-2xl duration-200 fill-mode-both', ativo && 'ring-1 ring-primary/40',
      saindo ? 'animate-out fade-out zoom-out-95 pointer-events-none' : 'animate-in fade-in zoom-in-95')}
      style={{ left: vis.pos.x, top: vis.pos.y, width: vis.size.w, height: vis.size.h, transition: d.arrastando ? 'none' : 'left .25s ease, top .25s ease, width .25s ease, height .25s ease' }}>
      {ativo ? (
        <>
          <Barra arrastavelId={vis.aluno.id} />
          <BannerAviso />
          <div className="min-h-0 flex-1"><Corpo /></div>
          <div onMouseDown={(e) => d.inicioGesto('resize', vis.aluno.id, e)} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" style={{ background: 'linear-gradient(135deg, transparent 50%, var(--border) 50%)' }} />
        </>
      ) : (
        <>
          <CardPausado vis={vis} arrastavelId={vis.aluno.id} />
          <div onMouseDown={(e) => d.inicioGesto('resize', vis.aluno.id, e)} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" style={{ background: 'linear-gradient(135deg, transparent 50%, var(--border) 50%)' }} />
        </>
      )}
    </div>
  )
}

/** Painel lateral (dividida): abas de TODAS as visualizações + a ativa ao vivo. */
function PainelSplit() {
  const d = useImpersonationDock()
  const larg = Math.min(d.vp.w * 0.8, d.larguraSplit)
  return (
    <div className={cn('fixed top-0 z-[300] flex h-screen flex-col overflow-hidden border-y-0 bg-card shadow-2xl', d.ladoSplit === 'right' ? 'right-0 rounded-l-2xl border-r-0' : 'left-0 rounded-r-2xl border-l-0')} style={{ width: larg }}>
      <TabStrip />
      {d.ativo ? (<><Barra /><BannerAviso /><div className="min-h-0 flex-1"><Corpo /></div></>) : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Nenhuma visualização.</div>}
      <div onMouseDown={d.iniciarSplitLargura} title="Arraste para ajustar a divisão" className="group absolute top-0 h-full w-1.5 cursor-col-resize" style={{ [d.ladoSplit === 'right' ? 'left' : 'right']: 0 }}>
        <span className="absolute inset-y-0 left-0 w-full bg-border/60 transition-colors group-hover:bg-primary" />
      </div>
    </div>
  )
}

/** Abas horizontais de TODAS as visualizações abertas (ativar / fechar). Para ABRIR outro aluno,
 *  use o picker de baixo (console) ou o "Conta de…" da barra (janela/dividida). */
function TabStrip() {
  const d = useImpersonationDock()
  if (d.abertos.length === 0) return null
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b bg-muted/30 px-1.5 py-1.5">
      {d.abertos.map((o) => {
        const on = o.aluno.id === d.ativoId
        return (
          <div key={o.aluno.id} className={cn('flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-sm transition-colors', on ? 'border-primary/50 bg-primary/10 text-primary' : 'hover:bg-muted')}>
            <button type="button" onClick={() => d.ativar(o.aluno.id)} className="flex min-w-0 items-center gap-1.5">
              <AvatarEstudante nome={o.aluno.nome} avatar={o.aluno.avatar} cor={o.aluno.avatarCor ?? '#6d28d9'} className="h-5 w-5 shrink-0 text-[9px] text-white" />
              <span className="max-w-[9rem] truncate font-medium">{o.aluno.nome}</span>
            </button>
            <button type="button" onClick={() => d.fecharUm(o.aluno.id)} title="Fechar" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        )
      })}
    </div>
  )
}

export { Barra, BannerAviso, Corpo, TabStrip }
