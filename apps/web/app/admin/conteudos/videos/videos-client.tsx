'use client'

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, BarChart3, FilePlus2, Film, FolderPlus, Loader2, PlayCircle, Plus, Pencil, RefreshCw, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { DataTable, type DataTableRowAction } from '@/components/admin/data-table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { navProgressStart } from '@/lib/nav-progress'
import { formatTime } from '@/lib/video/player-protocolo'
import type { ArvoreCurso, AulaCatalogo, CursoCatalogo, EstadoAula, ModuloCatalogo } from '@/lib/video/catalogo-tipos'
import { cn } from '@/lib/utils'
import { iniciarUpload, temEnvioPendente, limparSalvo, type UploadProgresso, type UploadHandle } from './upload-multipart'
import { VideoAnalytics } from './video-analytics'

// ESTÚDIO · VÍDEOS — opera DIRETO no serviço de vídeo (Curso > Módulo > Aula). Sem espelho no Supabase:
// listagem/paginação/estado vêm das rotas /api/admin/video (que repassam ao serviço).

const PER_PAGE = [10, 25, 50]
const ESTADO_INFO: Record<EstadoAula, { label: string; tone: string }> = {
  sem_video: { label: 'Sem vídeo', tone: 'bg-muted text-muted-foreground' },
  enviando: { label: 'Enviando', tone: 'bg-muted text-muted-foreground' },
  na_fila: { label: 'Na fila', tone: 'bg-muted text-muted-foreground' },
  processando: { label: 'Processando', tone: 'bg-primary/10 text-primary' },
  pronta: { label: 'Pronto', tone: 'bg-primary text-primary-foreground' },
  erro: { label: 'Erro', tone: 'bg-destructive/10 text-destructive' },
}
const EM_ANDAMENTO = new Set<EstadoAula>(['enviando', 'na_fila', 'processando'])

const fmtBytes = (n?: number | null) => {
  if (!n) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}
const fmtData = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

async function chamar(url: string, init?: RequestInit): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined })
    return { ok: r.ok, json: (await r.json().catch(() => ({}))) as Record<string, unknown> }
  } catch { return { ok: false, json: {} } }
}
const msg = (j: Record<string, unknown>, padrao: string) => (typeof j.message === 'string' ? j.message : padrao)

type EnvioAtivo = { aulaId: string; nome: string; prog: UploadProgresso; handle: UploadHandle | null }

const btnIcone = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40'
const btnPrimario = 'inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring'
const btnSecundario = 'inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'

export function VideosClient({ podeGerir }: { podeGerir: boolean }) {
  const sp = useSearchParams()
  const cursoId = sp.get('curso')
  return cursoId
    ? <CursoView key={cursoId} cursoId={cursoId} podeGerir={podeGerir} />
    : <CursosView podeGerir={podeGerir} />
}

// ───────────────────────── Lista de cursos ─────────────────────────

function CursosView({ podeGerir }: { podeGerir: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [rows, setRows] = React.useState<CursoCatalogo[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [erro, setErro] = React.useState<string | null>(null)

  const qs = React.useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', sp.get('page') ?? '1')
    p.set('pageSize', String(PER_PAGE.includes(Number(sp.get('pp'))) ? Number(sp.get('pp')) : 10))
    return p.toString()
  }, [sp])

  const carregar = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/video?${qs}`, { signal, cache: 'no-store' })
      const j = (await r.json().catch(() => ({}))) as { rows?: CursoCatalogo[]; total?: number; message?: string }
      if (!r.ok) throw new Error(j.message ?? `Erro ${r.status}`)
      setRows(j.rows ?? []); setTotal(j.total ?? 0); setErro(null)
    } catch (e) {
      if (!signal?.aborted) setErro(e instanceof Error ? e.message : 'Não foi possível carregar os cursos.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [qs])

  React.useEffect(() => {
    const ac = new AbortController()
    void carregar(ac.signal)
    return () => ac.abort()
  }, [carregar])

  function abrir(c: CursoCatalogo) {
    const p = new URLSearchParams(); p.set('curso', c.id)
    navProgressStart()
    router.push(`${pathname}?${p}`)
  }
  async function novo() {
    const titulo = await pedirTexto({ titulo: 'Novo curso', label: 'Nome do curso', confirmar: 'Criar' })
    if (!titulo?.trim()) return
    const r = await chamar('/api/admin/video', { method: 'POST', body: JSON.stringify({ tipo: 'curso', titulo: titulo.trim() }) })
    if (r.ok) { toast.success('Curso criado.'); void carregar() } else toast.error(msg(r.json, 'Não foi possível criar o curso.'))
  }
  async function renomear(c: CursoCatalogo) {
    const titulo = await pedirTexto({ titulo: 'Renomear curso', label: 'Nome do curso', valorInicial: c.titulo, confirmar: 'Salvar' })
    if (!titulo?.trim() || titulo.trim() === c.titulo) return
    const r = await chamar(`/api/admin/video/${c.id}`, { method: 'PATCH', body: JSON.stringify({ tipo: 'curso', titulo: titulo.trim() }) })
    if (r.ok) void carregar(); else toast.error(msg(r.json, 'Não foi possível renomear.'))
  }
  async function excluir(c: CursoCatalogo) {
    if (!(await confirmar({ titulo: 'Excluir curso', mensagem: `Excluir "${c.titulo}" com todos os módulos, aulas e vídeos? Esta ação não pode ser desfeita.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await chamar(`/api/admin/video/${c.id}?tipo=curso`, { method: 'DELETE' })
    if (r.ok) { toast.success('Curso excluído.'); void carregar() } else toast.error(msg(r.json, 'Não foi possível excluir.'))
  }

  const acoes = (c: CursoCatalogo): DataTableRowAction[] => {
    const l: DataTableRowAction[] = [{ label: 'Abrir', icon: <Film />, onClick: () => abrir(c) }]
    if (podeGerir) {
      l.push({ label: 'Renomear', icon: <Pencil />, onClick: () => void renomear(c) })
      l.push({ label: 'Excluir', icon: <Trash2 />, onClick: () => void excluir(c), destructive: true, separatorBefore: true })
    }
    return l
  }

  return (
    <div className="w-full space-y-5">
      <EstudioHeader
        titulo="Vídeos"
        acoes={podeGerir ? <button type="button" onClick={() => void novo()} className={btnPrimario}><Plus className="h-4 w-4" /> Novo curso</button> : undefined}
      />
      <DataTable<CursoCatalogo>
        rows={rows}
        total={total}
        loading={loading}
        error={erro}
        getRowId={(r) => r.id}
        selectable={false}
        perPageOptions={PER_PAGE}
        defaultPerPage={10}
        nomeSingular="curso"
        onRowClick={abrir}
        columns={[
          { key: 'titulo', header: 'Curso', title: (r) => r.titulo,
            render: (r) => <span className="inline-flex items-center gap-2 font-medium text-foreground"><Film className="h-4 w-4 shrink-0 text-muted-foreground" />{r.titulo}</span> },
          { key: 'criadoEm', header: 'Criado', align: 'center', width: '8rem', render: (r) => fmtData(r.criadoEm) },
        ]}
        rowActions={acoes}
        empty={<span className="inline-flex flex-col items-center gap-2"><Film className="h-6 w-6 opacity-50" />Nenhum curso ainda. Crie o primeiro para organizar seus vídeos.</span>}
      />
    </div>
  )
}

// ───────────────────────── Árvore de um curso ─────────────────────────

function CursoView({ cursoId, podeGerir }: { cursoId: string; podeGerir: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const [arv, setArv] = React.useState<ArvoreCurso | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [erro, setErro] = React.useState<string | null>(null)
  const [envios, setEnvios] = React.useState<EnvioAtivo[]>([])
  const [metricas, setMetricas] = React.useState<AulaCatalogo | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const alvoRef = React.useRef<{ aulaId: string; retomar: boolean } | null>(null)

  const carregar = React.useCallback(async (silencioso: boolean, signal?: AbortSignal) => {
    if (!silencioso) setLoading(true)
    try {
      const r = await fetch(`/api/admin/video?cursoId=${cursoId}`, { signal, cache: 'no-store' })
      const j = (await r.json().catch(() => ({}))) as ArvoreCurso & { message?: string }
      if (!r.ok) throw new Error(j.message ?? `Erro ${r.status}`)
      setArv({ curso: j.curso, modulos: j.modulos }); setErro(null)
    } catch (e) {
      if (!signal?.aborted && !silencioso) setErro(e instanceof Error ? e.message : 'Não foi possível carregar o curso.')
    } finally {
      if (!silencioso && !signal?.aborted) setLoading(false)
    }
  }, [cursoId])

  React.useEffect(() => {
    const ac = new AbortController()
    void carregar(false, ac.signal)
    return () => ac.abort()
  }, [carregar])

  // Polling leve (6 s) só enquanto há vídeo em andamento e a aba está visível.
  const temAndamento = !!arv?.modulos.some((m) => m.aulas.some((a) => EM_ANDAMENTO.has(a.estado))) || envios.some((e) => e.prog.estado === 'finalizando')
  React.useEffect(() => {
    if (!temAndamento) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') void carregar(true) }, 6000)
    return () => clearInterval(id)
  }, [temAndamento, carregar])

  function voltar() { navProgressStart(); router.push(pathname) }

  // ── upload ──
  function escolherArquivo(aulaId: string, retomar = false) {
    alvoRef.current = { aulaId, retomar }
    fileRef.current?.click()
  }
  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const alvo = alvoRef.current
    alvoRef.current = null
    if (!file || !alvo) return
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name)) { toast.error('Selecione um arquivo de vídeo.'); return }
    const { aulaId, retomar } = alvo
    const handle = iniciarUpload({
      file, aulaId, retomar,
      onChange: (prog) => {
        setEnvios((l) => l.map((x) => (x.aulaId === aulaId ? { ...x, prog } : x)))
        if (prog.estado === 'concluido') { toast.success('Envio concluído. Processando o vídeo…'); void carregar(true) }
        else if (prog.estado === 'erro') toast.error(prog.erro ?? 'Falha no envio. Você pode retomar depois.')
      },
    })
    setEnvios((l) => [...l.filter((x) => x.aulaId !== aulaId), { aulaId, nome: file.name, prog: { estado: 'enviando', enviado: 0, total: file.size }, handle }])
    void handle.promessa.then(() => void carregar(true))
  }
  async function cancelarEnvio(e: EnvioAtivo) {
    e.handle?.cancelar()
    limparSalvo(e.aulaId)
    await chamar(`/api/admin/video/${e.aulaId}/video`, { method: 'DELETE' })
    setEnvios((l) => l.filter((x) => x.aulaId !== e.aulaId))
    void carregar(true)
  }

  // ── estrutura ──
  async function criar(tipo: 'modulo' | 'aula', parentId: string) {
    const titulo = await pedirTexto({ titulo: tipo === 'modulo' ? 'Novo módulo' : 'Nova aula', label: tipo === 'modulo' ? 'Nome do módulo' : 'Título da aula', confirmar: 'Criar' })
    if (!titulo?.trim()) return
    const corpo = tipo === 'modulo' ? { tipo, titulo: titulo.trim(), cursoId: parentId } : { tipo, titulo: titulo.trim(), moduloId: parentId }
    const r = await chamar('/api/admin/video', { method: 'POST', body: JSON.stringify(corpo) })
    if (r.ok) void carregar(true); else toast.error(msg(r.json, 'Não foi possível criar.'))
  }
  async function renomear(tipo: 'curso' | 'modulo' | 'aula', id: string, atual: string) {
    const titulo = await pedirTexto({ titulo: 'Renomear', label: 'Novo nome', valorInicial: atual, confirmar: 'Salvar' })
    if (!titulo?.trim() || titulo.trim() === atual) return
    const r = await chamar(`/api/admin/video/${id}`, { method: 'PATCH', body: JSON.stringify({ tipo, titulo: titulo.trim() }) })
    if (r.ok) void carregar(true); else toast.error(msg(r.json, 'Não foi possível renomear.'))
  }
  async function excluir(tipo: 'modulo' | 'aula', id: string, nome: string) {
    const aviso = tipo === 'modulo' ? 'com todas as aulas e vídeos' : 'e o vídeo dela'
    if (!(await confirmar({ titulo: tipo === 'modulo' ? 'Excluir módulo' : 'Excluir aula', mensagem: `Excluir "${nome}" ${aviso}? Esta ação não pode ser desfeita.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await chamar(`/api/admin/video/${id}?tipo=${tipo}`, { method: 'DELETE' })
    if (r.ok) { limparSalvo(id); toast.success('Excluído.'); void carregar(true) } else toast.error(msg(r.json, 'Não foi possível excluir.'))
  }
  async function reprocessar(a: AulaCatalogo) {
    if (!(await confirmar({ titulo: 'Reprocessar vídeo', mensagem: `Reprocessar "${a.titulo}"? O vídeo fica indisponível até terminar.`, confirmar: 'Reprocessar' }))) return
    const r = await chamar(`/api/admin/video/${a.id}/reprocess`, { method: 'POST' })
    if (r.ok) { toast.success('Reprocessamento iniciado.'); void carregar(true) } else toast.error(msg(r.json, 'Não foi possível reprocessar.'))
  }
  async function removerVideo(a: AulaCatalogo) {
    if (!(await confirmar({ titulo: 'Remover vídeo', mensagem: `Remover o vídeo de "${a.titulo}"? A aula permanece, sem vídeo.`, confirmar: 'Remover', destrutivo: true }))) return
    const r = await chamar(`/api/admin/video/${a.id}/video`, { method: 'DELETE' })
    if (r.ok) { limparSalvo(a.id); toast.success('Vídeo removido.'); void carregar(true) } else toast.error(msg(r.json, 'Não foi possível remover.'))
  }

  const titulo = arv?.curso.titulo ?? 'Vídeos'

  return (
    <div className="w-full space-y-5">
      <EstudioHeader
        titulo={titulo}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={voltar} className={btnSecundario}><ArrowLeft className="h-4 w-4" /> Cursos</button>
            {podeGerir && arv && (
              <>
                <button type="button" onClick={() => void renomear('curso', arv.curso.id, arv.curso.titulo)} className={btnSecundario}><Pencil className="h-4 w-4" /> Renomear</button>
                <button type="button" onClick={() => void criar('modulo', arv.curso.id)} className={btnPrimario}><FolderPlus className="h-4 w-4" /> Novo módulo</button>
              </>
            )}
          </div>
        }
      />
      <input ref={fileRef} type="file" accept="video/*,.mkv,.mov" className="sr-only" tabIndex={-1} aria-hidden onChange={onArquivo} />

      {envios.length > 0 && (
        <ul aria-label="Envios em andamento" className="space-y-2">
          {envios.map((e) => {
            const pct = e.prog.total ? Math.round((e.prog.enviado / e.prog.total) * 100) : 0
            const fim = e.prog.estado === 'concluido' || e.prog.estado === 'erro' || e.prog.estado === 'cancelado'
            return (
              <li key={e.aulaId} className="rounded-2xl border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <Film className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{e.nome}</span>
                  <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                    {e.prog.estado === 'finalizando' ? 'Finalizando…' : e.prog.estado === 'concluido' ? 'Concluído' : e.prog.estado === 'erro' ? 'Interrompido' : e.prog.estado === 'cancelado' ? 'Cancelado' : `${pct}%`}
                  </span>
                  {fim ? (
                    <button type="button" onClick={() => setEnvios((l) => l.filter((x) => x.aulaId !== e.aulaId))} aria-label="Dispensar" className={btnIcone}><X className="h-4 w-4" /></button>
                  ) : (
                    <button type="button" onClick={() => void cancelarEnvio(e)}
                      className="inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Cancelar</button>
                  )}
                </div>
                <div role="progressbar" aria-label={`Envio de ${e.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full transition-[width]', e.prog.estado === 'erro' ? 'bg-destructive' : 'bg-primary')} style={{ width: `${pct}%` }} />
                </div>
                {e.prog.estado === 'erro' && <p className="mt-2 text-xs text-destructive">{e.prog.erro} Para retomar, use “Retomar envio” na aula.</p>}
              </li>
            )
          })}
        </ul>
      )}

      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : erro ? (
        <p role="alert" className="text-sm text-destructive">{erro}</p>
      ) : arv && arv.modulos.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          <Film className="mx-auto mb-2 h-6 w-6 opacity-50" />
          Este curso ainda não tem módulos.{podeGerir ? ' Crie o primeiro em “Novo módulo”.' : ''}
        </div>
      ) : (
        <div className="space-y-4">
          {arv?.modulos.map((m) => (
            <ModuloCard key={m.id} m={m} podeGerir={podeGerir}
              envio={(aulaId) => envios.find((e) => e.aulaId === aulaId)}
              onNovaAula={() => void criar('aula', m.id)}
              onRenomearModulo={() => void renomear('modulo', m.id, m.titulo)}
              onExcluirModulo={() => void excluir('modulo', m.id, m.titulo)}
              onEnviar={(a, retomar) => escolherArquivo(a.id, retomar)}
              onRenomearAula={(a) => void renomear('aula', a.id, a.titulo)}
              onExcluirAula={(a) => void excluir('aula', a.id, a.titulo)}
              onReprocessar={(a) => void reprocessar(a)}
              onRemoverVideo={(a) => void removerVideo(a)}
              onMetricas={setMetricas} />
          ))}
        </div>
      )}

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

function ModuloCard(p: {
  m: ModuloCatalogo
  podeGerir: boolean
  envio: (aulaId: string) => EnvioAtivo | undefined
  onNovaAula: () => void
  onRenomearModulo: () => void
  onExcluirModulo: () => void
  onEnviar: (a: AulaCatalogo, retomar: boolean) => void
  onRenomearAula: (a: AulaCatalogo) => void
  onExcluirAula: (a: AulaCatalogo) => void
  onReprocessar: (a: AulaCatalogo) => void
  onRemoverVideo: (a: AulaCatalogo) => void
  onMetricas: (a: AulaCatalogo) => void
}) {
  const { m, podeGerir } = p
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <header className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{m.titulo}</h2>
        <span className="text-xs text-muted-foreground">{m.aulas.length} {m.aulas.length === 1 ? 'aula' : 'aulas'}</span>
        {podeGerir && (
          <>
            <button type="button" onClick={p.onNovaAula} className={btnIcone} aria-label="Nova aula" title="Nova aula"><FilePlus2 className="h-4 w-4" /></button>
            <button type="button" onClick={p.onRenomearModulo} className={btnIcone} aria-label="Renomear módulo" title="Renomear módulo"><Pencil className="h-4 w-4" /></button>
            <button type="button" onClick={p.onExcluirModulo} className={cn(btnIcone, 'hover:text-destructive')} aria-label="Excluir módulo" title="Excluir módulo"><Trash2 className="h-4 w-4" /></button>
          </>
        )}
      </header>
      {m.aulas.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">Nenhuma aula neste módulo.</p>
      ) : (
        <ul className="divide-y">
          {m.aulas.map((a) => {
            const info = ESTADO_INFO[a.estado]
            const envio = p.envio(a.id)
            const enviandoAgora = !!envio && !['concluido', 'erro', 'cancelado'].includes(envio.prog.estado)
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <PlayCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={a.titulo}>{a.titulo}</span>
                <span title={a.erro ?? undefined} className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', info.tone)}>{info.label}</span>
                <span className="w-16 text-center text-xs tabular-nums text-muted-foreground">{a.duracaoS ? formatTime(a.duracaoS) : '—'}</span>
                <span className="w-20 text-center text-xs tabular-nums text-muted-foreground">{fmtBytes(a.tamanhoBytes)}</span>
                <div className="flex items-center">
                  <button type="button" onClick={() => p.onMetricas(a)} disabled={a.estado !== 'pronta'} className={btnIcone} aria-label="Ver métricas" title="Ver métricas"><BarChart3 className="h-4 w-4" /></button>
                  {podeGerir && (
                    <>
                      {a.estado === 'enviando' && !enviandoAgora && temEnvioPendente(a.id) && (
                        <button type="button" onClick={() => p.onEnviar(a, true)} className={btnIcone} aria-label="Retomar envio" title="Retomar envio"><RotateCcw className="h-4 w-4" /></button>
                      )}
                      {(a.estado === 'sem_video' || a.estado === 'erro') && !enviandoAgora && (
                        <button type="button" onClick={() => p.onEnviar(a, false)} className={btnIcone} aria-label="Enviar vídeo" title="Enviar vídeo"><Upload className="h-4 w-4" /></button>
                      )}
                      {(a.estado === 'pronta' || a.estado === 'erro') && (
                        <button type="button" onClick={() => p.onReprocessar(a)} className={btnIcone} aria-label="Reprocessar" title="Reprocessar"><RefreshCw className="h-4 w-4" /></button>
                      )}
                      {a.videoId && a.estado !== 'processando' && (
                        <button type="button" onClick={() => p.onRemoverVideo(a)} className={cn(btnIcone, 'hover:text-destructive')} aria-label="Remover vídeo" title="Remover vídeo"><X className="h-4 w-4" /></button>
                      )}
                      <button type="button" onClick={() => p.onRenomearAula(a)} className={btnIcone} aria-label="Renomear aula" title="Renomear aula"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => p.onExcluirAula(a)} className={cn(btnIcone, 'hover:text-destructive')} aria-label="Excluir aula" title="Excluir aula"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
