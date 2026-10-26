'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Folder, ChevronRight, ChevronLeft, Loader2, X, FileText } from 'lucide-react'
import { CapaCard } from '@/components/aluno/capa-card'
import type { PickerPasta, PickerSim } from './previa-actions'

const STATUS: Record<string, { label: string; cls: string }> = {
  publicado: { label: 'Publicado', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  rascunho: { label: 'Rascunho', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  encerrado: { label: 'Encerrado', cls: 'bg-muted text-muted-foreground' },
}

export function SimuladoPickerDialog({ onSelect, onClose }: { onSelect: (id: string, titulo: string) => void; onClose: () => void }) {
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<'simulado' | 'desafio'>('simulado')
  const [pastas, setPastas] = useState<PickerPasta[]>([])
  const [simulados, setSimulados] = useState<PickerSim[]>([])
  const [pastaAtual, setPastaAtual] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [montado, setMontado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { setMontado(true) }, [])
  // Recarrega ao trocar de aba (Simulados × Desafios) e reseta a navegação/busca.
  useEffect(() => {
    let vivo = true
    setCarregando(true); setPastaAtual(null); setBusca(''); setErro(null)
    ;(async () => {
      try {
        // Rota de API (resolve tenant por host, sem o problema de origem das server actions em domínio custom).
        const r = await fetch(`/api/teste/simulados-picker${aba === 'desafio' ? '?modo=desafio' : ''}`, { cache: 'no-store' }).then((x) => x.json())
        if (vivo) { setPastas(r.pastas || []); setSimulados(r.simulados || []); setErro(r.error || r.erro || null) }
      } catch (e) { if (vivo) setErro(`Falha ao carregar: ${(e as any)?.message || e}`) }
      finally { if (vivo) setCarregando(false) }
    })()
    return () => { vivo = false }
  }, [aba])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])

  const porId = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas])
  const breadcrumb = useMemo(() => { const out: PickerPasta[] = []; let cur = pastaAtual; while (cur) { const p = porId.get(cur); if (!p) break; out.unshift(p); cur = p.paiId } return out }, [pastaAtual, porId])

  const q = busca.trim().toLowerCase()
  const buscando = q.length > 0
  const subpastas = buscando ? [] : pastas.filter((p) => (p.paiId ?? null) === pastaAtual)
  const sims = buscando ? simulados.filter((s) => s.titulo.toLowerCase().includes(q)) : simulados.filter((s) => (s.pastaId ?? null) === pastaAtual)

  if (!montado) return null
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex h-[82vh] max-h-[760px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Selecionar simulado</h2>
            <p className="text-xs text-muted-foreground">Navegue pelas pastas ou busque pelo nome.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {/* Abas: Simulados × Desafios (os desafios se comportam como pastas com simulados internos) */}
        <div className="flex items-center gap-1 border-b px-4">
          {([['simulado', 'Simulados'], ['desafio', 'Desafios']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setAba(k)}
              className={`relative px-3 py-2 text-sm font-medium transition-colors ${aba === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {label}
              {aba === k && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        <div className="border-b px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar simulado…" className="w-full rounded-lg border bg-background py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </div>
          {!buscando && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => setPastaAtual(pastaAtual ? (porId.get(pastaAtual)?.paiId ?? null) : null)}
                disabled={!pastaAtual}
                aria-label="Voltar um nível"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-default disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
                <button onClick={() => setPastaAtual(null)} className={pastaAtual ? 'text-muted-foreground hover:text-foreground' : 'font-semibold text-foreground'}>Início</button>
                {breadcrumb.map((b, i) => (
                  <span key={b.id} className="inline-flex min-w-0 items-center gap-1.5">
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <button onClick={() => setPastaAtual(b.id)} className={`truncate ${i === breadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{b.nome}</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : erro ? (
            <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive">{erro}</div>
          ) : (
            <>
              {!buscando && !!subpastas.length && (
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {subpastas.map((p) => <FolderCard key={p.id} p={p} onClick={() => { setPastaAtual(p.id); setBusca('') }} />)}
                </div>
              )}
              {sims.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sims.map((s) => <SimTicket key={s.id} s={s} onClick={() => onSelect(s.id, s.titulo)} />)}
                </div>
              ) : (!subpastas.length && (
                <div className="py-12 text-center text-sm text-muted-foreground">{buscando ? 'Nenhum simulado encontrado.' : (aba === 'desafio' && !pastaAtual ? 'Nenhum desafio ainda.' : 'Pasta vazia.')}</div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function FolderCard({ p, onClick }: { p: PickerPasta; onClick: () => void }) {
  const cor = p.cor || '#1a367c'
  return (
    <button onClick={onClick} className="group/card flex h-28 overflow-hidden rounded-2xl border bg-card text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/50">
      <div className="relative aspect-[4/3] h-full shrink-0 overflow-hidden">
        <CapaCard capa={p.capa} cor={cor} icone={p.icone} orig={p.orig} cfg={p.cfg} />
        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"><Folder className="h-3 w-3" /> Pasta</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{p.nome}</h3>
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{p.count} simulado{p.count === 1 ? '' : 's'} <ChevronRight className="h-3 w-3" /></span>
      </div>
    </button>
  )
}

function SimTicket({ s, onClick }: { s: PickerSim; onClick: () => void }) {
  const cor = s.cor || '#1a367c'
  const st = STATUS[s.status] || STATUS.rascunho
  return (
    <button onClick={onClick} className="group/card flex h-28 overflow-hidden rounded-2xl border bg-card text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/50">
      <div className="relative aspect-[4/3] h-full shrink-0 overflow-hidden"><CapaCard capa={s.capa} cor={cor} icone={s.icone} orig={s.orig} cfg={s.cfg} /></div>
      <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{s.titulo}</h3>
        <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
      </div>
    </button>
  )
}
