'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Search, X, Loader2, Eye, Pencil, Maximize2, Minimize2, Minus, RefreshCw, Clock, ShieldAlert, SlidersHorizontal, Users, History, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { buscarAlunosImpersonacao, type AlunoBusca } from '@/app/admin/impersonation/actions'
import type { LogImpersonation } from '@/lib/impersonation/logs'

type StartResp = { session_id: string; expires_at: string; student: { id: string; name: string }; action_level: string }
type Modo = 'encaixado' | 'flutuante'
const ERROS: Record<string, string> = {
  no_permission: 'Você não tem permissão para visualizar alunos.',
  out_of_scope: 'Aluno fora do seu escopo.',
  rate_limited: 'Muitas aberturas em pouco tempo. Aguarde um instante.',
  reauth_required: 'Sua sessão está antiga. Saia e entre de novo.',
  impersonation_disabled: 'A visualização de alunos está desativada nesta plataforma.',
  student_not_found: 'Aluno não encontrado.',
}
const REASON: Record<string, string> = { closed_by_admin: 'Fechada pelo admin', expired: 'Expirou', renewed_into_new_session: 'Renovada' }

export function ImpersonationConsole({ podeAbrir, isAdmin, alunosIniciais, logs }: {
  podeAbrir: boolean; isAdmin: boolean; alunosIniciais: AlunoBusca[]; logs: LogImpersonation[]
}) {
  const [aba, setAba] = useState<'console' | 'logs'>('console')
  const [busca, setBusca] = useState('')
  const [alunos, setAlunos] = useState<AlunoBusca[]>(alunosIniciais)
  const [buscando, setBuscando] = useState(false)
  const [ativo, setAtivo] = useState<AlunoBusca | null>(null)
  const [sessao, setSessao] = useState<StartResp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>('encaixado')
  const [avisar, setAvisar] = useState(false)
  // Janela flutuante
  const [pos, setPos] = useState({ x: 140, y: 96 })
  const [size, setSize] = useState({ w: 940, h: 640 })
  const [min, setMin] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const gesto = useRef<null | { tipo: 'move' | 'resize'; sx: number; sy: number; px: number; py: number; pw: number; ph: number }>(null)

  // Busca (debounce leve).
  useEffect(() => {
    const t = setTimeout(async () => {
      setBuscando(true)
      const r = await buscarAlunosImpersonacao(busca).catch(() => null)
      if (r?.ok && r.alunos) setAlunos(r.alunos)
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [busca])

  const encerrarSessao = useCallback((sid: string, reason: 'closed_by_admin' | 'expired') => {
    fetch(`/api/admin/impersonate/${sid}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }), keepalive: true }).catch(() => {})
  }, [])

  const abrir = useCallback(async (aluno: AlunoBusca) => {
    if (!podeAbrir) return
    if (sessao) encerrarSessao(sessao.session_id, 'closed_by_admin') // 1 aluno por vez
    setErro(null); setSessao(null); setAtivo(aluno); setMin(false)
    const r = await fetch('/api/admin/impersonate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: aluno.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErro(ERROS[d?.error] ?? 'Não foi possível abrir a conta do aluno.'); return }
    setSessao(d as StartResp)
  }, [podeAbrir, sessao, encerrarSessao])

  const fechar = useCallback(() => {
    if (sessao) encerrarSessao(sessao.session_id, 'closed_by_admin')
    setSessao(null); setAtivo(null); setAvisar(false)
  }, [sessao, encerrarSessao])

  // Expiração: aviso 2 min antes + auto-encerra.
  useEffect(() => {
    if (!sessao) return
    const exp = new Date(sessao.expires_at).getTime()
    const t1 = setTimeout(() => setAvisar(true), Math.max(exp - Date.now() - 120_000, 0))
    const t2 = setTimeout(() => { encerrarSessao(sessao.session_id, 'expired'); setSessao(null); setAtivo(null); setAvisar(false) }, Math.max(exp - Date.now(), 0))
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [sessao, encerrarSessao])

  const renovar = useCallback(() => {
    if (!sessao) return
    fetch(`/api/admin/impersonate/${sessao.session_id}/renew`, { method: 'POST' })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok && d?.expires_at) { setSessao((s) => (s ? { ...s, expires_at: d.expires_at } : s)); setAvisar(false) } })
      .catch(() => {})
  }, [sessao])

  // Fecha a sessão ao desmontar o console.
  useEffect(() => () => { if (sessao) encerrarSessao(sessao.session_id, 'closed_by_admin') }, [sessao, encerrarSessao])

  // Gestos da janela flutuante.
  const mover = useCallback((e: MouseEvent) => {
    const g = gesto.current; if (!g) return
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy
    if (g.tipo === 'move') setPos({ x: Math.max(0, g.px + dx), y: Math.max(0, g.py + dy) })
    else setSize({ w: Math.max(460, g.pw + dx), h: Math.max(340, g.ph + dy) })
  }, [])
  const fimGesto = useCallback(() => { gesto.current = null; setArrastando(false); window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', fimGesto) }, [mover])
  const inicioGesto = useCallback((tipo: 'move' | 'resize', e: React.MouseEvent) => {
    e.preventDefault()
    gesto.current = { tipo, sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y, pw: size.w, ph: size.h }
    setArrastando(true)
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', fimGesto)
  }, [pos, size, mover, fimGesto])
  useEffect(() => () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', fimGesto) }, [mover, fimGesto])

  // ── Frame (barra + iframe). `flutuante` só muda o wrapper; conteúdo é o mesmo. ──
  const barra = (
    <div onMouseDown={modo === 'flutuante' ? (e) => inicioGesto('move', e) : undefined}
      className={cn('flex items-center gap-2 border-b bg-muted/50 px-3 py-2', modo === 'flutuante' && 'cursor-move select-none')}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"><Pencil className="h-3 w-3" /> Operável</span>
      <span className="min-w-0 flex-1 truncate text-sm">Conta de <span className="font-semibold">{ativo?.nome}</span></span>
      <button type="button" onClick={() => setModo((m) => (m === 'encaixado' ? 'flutuante' : 'encaixado'))} title={modo === 'encaixado' ? 'Destacar em janela' : 'Encaixar na área'} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        {modo === 'encaixado' ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
      </button>
      {modo === 'flutuante' && (
        <button type="button" onClick={() => setMin((v) => !v)} title={min ? 'Restaurar' : 'Minimizar'} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Minus className="h-4 w-4" /></button>
      )}
      <button type="button" onClick={fechar} title="Fechar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  )
  const bannerAviso = avisar && sessao && (
    <div aria-live="polite" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
      <Clock className="h-3.5 w-3.5 shrink-0" /><span className="flex-1">A sessão vai expirar em breve.</span>
      <button type="button" onClick={renovar} className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 font-semibold hover:bg-amber-500/30"><RefreshCw className="h-3 w-3" /> Renovar</button>
    </div>
  )
  const corpo = erro ? (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <ShieldAlert className="h-7 w-7 text-destructive" /><p className="max-w-sm text-sm text-destructive">{erro}</p>
    </div>
  ) : !sessao ? (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Abrindo…</div>
  ) : (
    <iframe key={sessao.session_id} src="/aluno" title={`Conta de ${ativo?.nome}`} className={cn('h-full w-full border-0 bg-background', arrastando && 'pointer-events-none')} />
  )

  return (
    <div className="animate-page space-y-4">
      {/* Cabeçalho + abas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Eye className="h-6 w-6 text-primary" /> Visualização de aluno</h1>
          <p className="text-sm text-muted-foreground">Abra a conta de um aluno e opere como ele — as ações contam como do próprio aluno.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            <button type="button" onClick={() => setAba('console')} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', aba === 'console' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}><Users className="h-4 w-4" /> Console</button>
            <button type="button" onClick={() => setAba('logs')} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', aba === 'logs' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}><History className="h-4 w-4" /> Logs</button>
          </div>
          {isAdmin && <Link href="/admin/impersonation/config" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><SlidersHorizontal className="h-4 w-4" /> Configurar</Link>}
        </div>
      </div>

      {aba === 'console' ? (
        <>
          {!podeAbrir && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">Seu papel não pode visualizar alunos. Peça a um administrador para habilitar em <b>Configurar</b>.</div>
          )}
          <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            {/* Picker */}
            <aside className="flex flex-col rounded-2xl border bg-card shadow-sm">
              <div className="border-b p-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno…" className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
                  {buscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="max-h-[calc(100vh-17rem)] min-h-[12rem] flex-1 overflow-y-auto p-1.5">
                {alunos.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">Nenhum aluno.</p>
                ) : alunos.map((a) => (
                  <button key={a.id} type="button" onClick={() => abrir(a)} disabled={!podeAbrir}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-50', ativo?.id === a.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">{(a.nome || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.nome}</span>
                      {a.email && <span className="block truncate text-[11px] text-muted-foreground">{a.email}</span>}
                    </span>
                    {ativo?.id === a.id && <ExternalLink className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            </aside>

            {/* Área principal (encaixado) */}
            <main className="relative h-[calc(100vh-15rem)] min-h-[24rem] overflow-hidden rounded-2xl border bg-muted/30 shadow-sm">
              {!ativo ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                  <Eye className="h-8 w-8 opacity-40" />
                  <p className="text-sm">Escolha um aluno à esquerda para abrir a conta dele aqui.</p>
                </div>
              ) : modo === 'encaixado' ? (
                <div className="absolute inset-0 flex flex-col">{barra}{bannerAviso}<div className="min-h-0 flex-1">{corpo}</div></div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                  <ExternalLink className="h-8 w-8 opacity-40" />
                  <p className="text-sm">A conta de <b>{ativo.nome}</b> está aberta em uma janela.</p>
                  <button type="button" onClick={() => setModo('encaixado')} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Encaixar aqui</button>
                </div>
              )}
            </main>
          </div>
        </>
      ) : (
        <LogsTable logs={logs} />
      )}

      {/* Janela flutuante (portal) */}
      {ativo && modo === 'flutuante' && createPortal(
        <div className="fixed z-[300] flex flex-col overflow-hidden rounded-xl border bg-card shadow-2xl" style={{ left: pos.x, top: pos.y, width: size.w, height: min ? undefined : size.h }}>
          {barra}
          {!min && <>{bannerAviso}<div className="min-h-0 flex-1">{corpo}</div>
            {/* handle de redimensionar (canto inferior direito) */}
            <div onMouseDown={(e) => inicioGesto('resize', e)} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" style={{ background: 'linear-gradient(135deg, transparent 50%, var(--border) 50%)' }} />
          </>}
        </div>,
        document.body,
      )}
    </div>
  )
}

function LogsTable({ logs }: { logs: LogImpersonation[] }) {
  if (logs.length === 0) return <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhuma visualização registrada ainda.</div>
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted text-left text-muted-foreground">
          <tr><th className="px-3 py-2.5 font-medium">Aluno</th><th className="px-3 py-2.5 font-medium">Início</th><th className="px-3 py-2.5 font-medium">Fim</th><th className="px-3 py-2.5 font-medium">Motivo</th><th className="px-3 py-2.5 font-medium">IP</th></tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2.5"><Link href={`/admin/estudantes/${l.estudanteId}`} className="font-medium hover:underline">{l.estudanteNome}</Link>{l.estudanteEmail && <span className="block truncate text-xs text-muted-foreground">{l.estudanteEmail}</span>}</td>
              <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{formatBrt(l.startedAt) ?? '—'}</td>
              <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{l.endedAt ? formatBrt(l.endedAt) : <span className="text-emerald-600 dark:text-emerald-400">em aberto</span>}</td>
              <td className="px-3 py-2.5">{l.endReason ? (REASON[l.endReason] ?? l.endReason) : '—'}</td>
              <td className="px-3 py-2.5 tabular-nums text-xs text-muted-foreground">{l.ip ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
