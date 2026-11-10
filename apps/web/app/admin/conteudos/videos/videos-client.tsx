'use client'

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { BarChart3, RefreshCw, Trash2, Upload, X, Film, PlayCircle, RotateCcw } from 'lucide-react'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { DataTable, type DataTableRowAction } from '@/components/admin/data-table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { navProgressStart } from '@/lib/nav-progress'
import { formatTime } from '@/lib/video/player-protocolo'
import { cn } from '@/lib/utils'
import { iniciarUpload, temEnvioPendente, limparSalvo, type UploadProgresso, type UploadHandle } from './upload-multipart'
import { VideoAnalytics } from './video-analytics'

type VideoRow = {
  id: string
  titulo: string
  status: string
  durationS?: number | null
  sizeBytes?: number | null
  createdAt?: string | null
  error?: string | null
}

const PER_PAGE = [10, 25, 50]
const STATUS_FILTROS: { id: string; label: string }[] = [
  { id: '', label: 'Todos' }, { id: 'uploading', label: 'Enviando' }, { id: 'processing', label: 'Processando' },
  { id: 'ready', label: 'Pronto' }, { id: 'failed', label: 'Com erro' },
]
const STATUS_INFO: Record<string, { label: string; tone: string }> = {
  uploading: { label: 'Enviando', tone: 'bg-muted text-muted-foreground' },
  queued: { label: 'Na fila', tone: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processando', tone: 'bg-primary/10 text-primary' },
  ready: { label: 'Pronto', tone: 'bg-primary text-primary-foreground' },
  failed: { label: 'Erro', tone: 'bg-destructive/10 text-destructive' },
}
const EM_ANDAMENTO = new Set(['uploading', 'queued', 'processing'])

const fmtBytes = (n?: number | null) => {
  if (!n) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}
const fmtData = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

type EnvioAtivo = { key: string; nome: string; videoId: string | null; prog: UploadProgresso; handle: UploadHandle | null }

export function VideosClient({ podeGerir }: { podeGerir: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [rows, setRows] = React.useState<VideoRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [erro, setErro] = React.useState<string | null>(null)
  const [envios, setEnvios] = React.useState<EnvioAtivo[]>([])
  const [metricas, setMetricas] = React.useState<VideoRow | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const retomarRef = React.useRef<string | null>(null)

  // Parâmetros da URL → query da rota (tudo calculado no servidor).
  const qs = React.useMemo(() => {
    const p = new URLSearchParams()
    const q = sp.get('q'); if (q) p.set('search', q)
    const st = sp.get('status'); if (st) p.set('status', st)
    p.set('page', sp.get('page') ?? '1')
    p.set('pageSize', String(PER_PAGE.includes(Number(sp.get('pp'))) ? Number(sp.get('pp')) : 10))
    p.set('sort', sp.get('sort') ?? 'createdAt')
    p.set('dir', sp.get('dir') === 'asc' ? 'asc' : 'desc')
    return p.toString()
  }, [sp])

  const carregar = React.useCallback(async (silencioso: boolean, signal?: AbortSignal) => {
    if (!silencioso) setLoading(true)
    try {
      const r = await fetch(`/api/admin/video?${qs}`, { signal, cache: 'no-store' })
      const j = (await r.json().catch(() => ({}))) as { rows?: VideoRow[]; total?: number; error?: string }
      if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`)
      setRows(j.rows ?? []); setTotal(j.total ?? 0); setErro(null)
    } catch (e) {
      if (!signal?.aborted) setErro(e instanceof Error ? e.message : 'Não foi possível carregar os vídeos.')
    } finally {
      if (!silencioso && !signal?.aborted) setLoading(false)
    }
  }, [qs])

  React.useEffect(() => {
    const ac = new AbortController()
    void carregar(false, ac.signal)
    return () => ac.abort()
  }, [carregar])

  // Polling leve (6 s) só enquanto há vídeo em andamento e a aba está visível.
  const temAndamento = rows.some((r) => EM_ANDAMENTO.has(r.status)) || envios.some((e) => e.prog.estado === 'finalizando')
  React.useEffect(() => {
    if (!temAndamento) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') void carregar(true) }, 6000)
    return () => clearInterval(id)
  }, [temAndamento, carregar])

  function setParam(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(sp.toString()); mut(p); p.delete('page')
    navProgressStart()
    router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
  }

  // ── upload ──
  function escolherArquivo(retomarId?: string) {
    retomarRef.current = retomarId ?? null
    fileRef.current?.click()
  }
  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name)) { toast.error('Selecione um arquivo de vídeo.'); return }
    const retomarId = retomarRef.current ?? undefined
    retomarRef.current = null
    const key = retomarId ?? `${file.name}-${Date.now()}`
    const upd = (prog: UploadProgresso, videoId: string | null) => {
      setEnvios((l) => l.map((x) => (x.key === key ? { ...x, prog, videoId: videoId ?? x.videoId } : x)))
      if (prog.estado === 'concluido') { toast.success('Envio concluído. Processando o vídeo…'); void carregar(true) }
      else if (prog.estado === 'erro') toast.error(prog.erro ?? 'Falha no envio. Você pode retomar depois.')
    }
    const handle = iniciarUpload({ file, titulo: file.name.replace(/\.[^.]+$/, ''), retomarId, onChange: upd })
    setEnvios((l) => [...l.filter((x) => x.key !== key), { key, nome: file.name, videoId: retomarId ?? null, prog: { estado: 'enviando', enviado: 0, total: file.size }, handle }])
    void handle.promessa.then(() => void carregar(true))
  }
  async function cancelarEnvio(e: EnvioAtivo) {
    e.handle?.cancelar()
    if (e.videoId) {
      limparSalvo(e.videoId)
      await fetch(`/api/admin/video/${e.videoId}`, { method: 'DELETE' }).catch(() => undefined)
    }
    setEnvios((l) => l.filter((x) => x.key !== e.key))
    void carregar(true)
  }

  // ── ações de linha ──
  async function reprocessar(r: VideoRow) {
    if (!(await confirmar({ titulo: 'Reprocessar vídeo', mensagem: `Reprocessar "${r.titulo}"? O vídeo fica indisponível até terminar.`, confirmar: 'Reprocessar' }))) return
    const res = await fetch(`/api/admin/video/${r.id}/reprocess`, { method: 'POST' })
    if (res.ok) { toast.success('Reprocessamento iniciado.'); void carregar(true) } else toast.error('Não foi possível reprocessar.')
  }
  async function excluir(r: VideoRow) {
    if (!(await confirmar({ titulo: 'Excluir vídeo', mensagem: `Excluir "${r.titulo}"? Aulas que usam este vídeo perderão o conteúdo. Esta ação não pode ser desfeita.`, confirmar: 'Excluir', destrutivo: true }))) return
    const res = await fetch(`/api/admin/video/${r.id}`, { method: 'DELETE' })
    if (res.ok) { limparSalvo(r.id); toast.success('Vídeo excluído.'); void carregar(true) } else toast.error('Não foi possível excluir.')
  }

  const acoes = (r: VideoRow): DataTableRowAction[] => {
    const l: DataTableRowAction[] = [{ label: 'Ver métricas', icon: <BarChart3 />, onClick: () => setMetricas(r), disabled: r.status !== 'ready' }]
    if (podeGerir) {
      if (r.status === 'uploading' && temEnvioPendente(r.id)) l.push({ label: 'Retomar envio', icon: <RotateCcw />, onClick: () => escolherArquivo(r.id) })
      l.push({ label: 'Reprocessar', icon: <RefreshCw />, onClick: () => void reprocessar(r), disabled: r.status === 'uploading' || r.status === 'processing', separatorBefore: true })
      l.push({ label: 'Excluir', icon: <Trash2 />, onClick: () => void excluir(r), destructive: true })
    }
    return l
  }

  const statusAtual = sp.get('status') ?? ''

  return (
    <div className="w-full space-y-5">
      <EstudioHeader
        titulo="Vídeos"
        acoes={podeGerir ? (
          <button type="button" onClick={() => escolherArquivo()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
            <Upload className="h-4 w-4" /> Enviar vídeo
          </button>
        ) : undefined}
      />
      <input ref={fileRef} type="file" accept="video/*,.mkv,.mov" className="sr-only" tabIndex={-1} aria-hidden onChange={onArquivo} />

      {envios.length > 0 && (
        <ul aria-label="Envios em andamento" className="space-y-2">
          {envios.map((e) => {
            const pct = e.prog.total ? Math.round((e.prog.enviado / e.prog.total) * 100) : 0
            const fim = e.prog.estado === 'concluido' || e.prog.estado === 'erro' || e.prog.estado === 'cancelado'
            return (
              <li key={e.key} className="rounded-2xl border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <Film className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{e.nome}</span>
                  <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                    {e.prog.estado === 'finalizando' ? 'Finalizando…' : e.prog.estado === 'concluido' ? 'Concluído' : e.prog.estado === 'erro' ? 'Interrompido' : e.prog.estado === 'cancelado' ? 'Cancelado' : `${pct}%`}
                  </span>
                  {fim ? (
                    <button type="button" onClick={() => setEnvios((l) => l.filter((x) => x.key !== e.key))} aria-label="Dispensar"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /></button>
                  ) : (
                    <button type="button" onClick={() => void cancelarEnvio(e)}
                      className="inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Cancelar</button>
                  )}
                </div>
                <div role="progressbar" aria-label={`Envio de ${e.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full transition-[width]', e.prog.estado === 'erro' ? 'bg-destructive' : 'bg-primary')} style={{ width: `${pct}%` }} />
                </div>
                {e.prog.estado === 'erro' && <p className="mt-2 text-xs text-destructive">{e.prog.erro} Para retomar, use “Retomar envio” no menu do vídeo.</p>}
              </li>
            )
          })}
        </ul>
      )}

      <DataTable<VideoRow>
        rows={rows}
        total={total}
        loading={loading}
        error={erro}
        getRowId={(r) => r.id}
        selectable={false}
        searchable
        searchPlaceholder="Buscar vídeo pelo título…"
        perPageOptions={PER_PAGE}
        defaultPerPage={10}
        defaultSort={{ key: 'createdAt', dir: 'desc' }}
        nomeSingular="vídeo"
        filters={
          <div role="group" aria-label="Filtrar por status" className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTROS.map((f) => (
              <button key={f.id || 'todos'} type="button" aria-pressed={statusAtual === f.id}
                onClick={() => setParam((p) => { f.id ? p.set('status', f.id) : p.delete('status') })}
                className={cn('h-11 rounded-xl border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  statusAtual === f.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted')}>
                {f.label}
              </button>
            ))}
          </div>
        }
        columns={[
          { key: 'titulo', header: 'Vídeo', sortable: true, title: (r) => r.titulo,
            render: (r) => (
              <span className="inline-flex items-center gap-2 font-medium text-foreground"><PlayCircle className="h-4 w-4 shrink-0 text-muted-foreground" />{r.titulo}</span>
            ) },
          { key: 'status', header: 'Status', sortable: true, align: 'center', width: '9.5rem',
            render: (r) => {
              const s = STATUS_INFO[r.status] ?? { label: r.status, tone: 'bg-muted text-muted-foreground' }
              return <span title={r.error ?? undefined} className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', s.tone)}>{s.label}</span>
            } },
          { key: 'durationS', header: 'Duração', sortable: true, align: 'center', width: '7rem', render: (r) => (r.durationS ? formatTime(r.durationS) : '—') },
          { key: 'sizeBytes', header: 'Tamanho', sortable: true, align: 'center', width: '7rem', render: (r) => fmtBytes(r.sizeBytes) },
          { key: 'createdAt', header: 'Criado', sortable: true, align: 'center', width: '8rem', render: (r) => fmtData(r.createdAt) },
        ]}
        rowActions={acoes}
        empty={<span className="inline-flex flex-col items-center gap-2"><Film className="h-6 w-6 opacity-50" />Nenhum vídeo encontrado.</span>}
      />

      <Dialog open={!!metricas} onOpenChange={(o) => { if (!o) setMetricas(null) }}>
        <DialogContent className="sm:max-w-2xl lg:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Métricas do vídeo</DialogTitle>
            <DialogDescription className="truncate">{metricas?.titulo}</DialogDescription>
          </DialogHeader>
          {metricas && <VideoAnalytics id={metricas.id} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
