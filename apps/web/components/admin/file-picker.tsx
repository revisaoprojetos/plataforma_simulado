'use client'

/**
 * <FilePicker> — SELETOR DE ARQUIVO modal unificado e reutilizável (Fundação do Estúdio de Conteúdo).
 * 4 abas: Biblioteca · Enviar do computador · Vídeo (Link/Plataforma) · Link externo.
 *
 * Reusa (não duplica):
 *  - Upload/storage: pipeline `prepararUploadConteudo` + `importarDeStorage` (app/admin/biblioteca/actions)
 *    com progresso via `DriveUploadPanel` (components/admin/drive-novo) — mesma mecânica XHR da Biblioteca.
 *  - Árvore/busca/cards da Biblioteca: `listarArvore`/`listarPastasConteudo` + `CardPasta`/`CardConteudo`
 *    + `BuscaDrive`. Escolher da biblioteca LIGA (retorna o id do documento), NÃO copia o arquivo.
 *  - Modal/aviso: `components/ui/dialog` + `sonner`.
 *  - Vídeo: `lib/biblioteca/video-provedor` (YouTube/Vimeo/Panda/Google Drive).
 *
 * EXEMPLO DE USO:
 * ```tsx
 * const [aberto, setAberto] = useState(false)
 * <button onClick={() => setAberto(true)}>Escolher arquivo</button>
 * <FilePicker
 *   open={aberto}
 *   onClose={() => setAberto(false)}
 *   tenantId={tenantId}
 *   abaInicial="biblioteca"
 *   filtros={{ tipos: ['video'] }}             // opcional: restringe a lista da Biblioteca
 *   onSelecionar={(r) => {
 *     if (r.tipo === 'biblioteca') vincularDocumento(r.documentoId)       // liga, não copia
 *     else if (r.tipo === 'upload') vincularDocumento(r.documentoId)      // já ingerido na pasta escolhida
 *     else if (r.tipo === 'video') salvarVideo(r.url, r.plataforma)
 *     else if (r.tipo === 'link') salvarLink(r.url, r.titulo, r.abrirDentro)
 *     setAberto(false)
 *   }}
 * />
 * ```
 * Observação: a aba "Enviar" pode enviar VÁRIOS arquivos; ao confirmar, `onSelecionar` é chamado UMA vez
 * por documento enviado (cada um com seu `documentoId`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  FolderOpen, Upload, Video as VideoIcon, Link2, Folder, ChevronRight, ChevronDown,
  Loader2, FileUp, Check, ExternalLink, Info, X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { CardPasta } from '@/components/biblioteca/card-pasta'
import { CardConteudo } from '@/components/biblioteca/card-conteudo'
import { SeloTipo } from '@/components/biblioteca/selo-tipo'
import { BuscaDrive, type OpcaoChip } from '@/components/biblioteca/busca-drive'
import { DriveUploadPanel, DriveNovoStyles, type DriveUploadItem } from '@/components/admin/drive-novo'
import { cardGrid, FOLDER_MIN, POSTER_MIN } from '@/components/aluno/card-grid'
import { TIPOS_CONTEUDO, type KindConteudo } from '@/lib/biblioteca/tipos-conteudo'
import { detectarVideo, PLATAFORMA_LABEL, referenciaVideoProprio, type VideoPlataforma } from '@/lib/biblioteca/video-provedor'
import { formatTime } from '@/lib/video/player-protocolo'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Categoria } from '@/app/admin/biblioteca/actions-tipos'
import { listarArvore, listarPastasConteudo, prepararUploadConteudo, importarDeStorage } from '@/app/admin/biblioteca/actions'

// ───────────────────────── Tipos públicos (contrato) ─────────────────────────
export type FilePickerAba = 'biblioteca' | 'upload' | 'video' | 'link'

export type FilePickerResultado =
  | { tipo: 'biblioteca'; documentoId: string; titulo?: string; kind?: KindConteudo }
  | { tipo: 'upload'; documentoId: string; titulo?: string }
  | { tipo: 'video'; url: string; plataforma: VideoPlataforma; titulo?: string; embedUrl?: string | null }
  | { tipo: 'link'; url: string; titulo: string; abrirDentro: boolean }

export interface FilePickerProps {
  open: boolean
  onClose: () => void
  onSelecionar: (resultado: FilePickerResultado) => void
  abaInicial?: FilePickerAba
  /** Tenant do contexto. As server actions resolvem o tenant internamente; aqui serve para isolar o estado. */
  tenantId: string
  /** Filtros opcionais aplicados à aba Biblioteca. `disciplinaId` é reservado (ver limitações). */
  filtros?: { tipos?: KindConteudo[]; disciplinaId?: string }
  /** Coleção da Biblioteca navegada/alimentada pelo seletor ('conteudo' por padrão; 'jurisclub' p/ itens do JurisClub). */
  categoria?: Categoria
}

const ABAS: { k: FilePickerAba; rotulo: string; Icone: typeof FolderOpen }[] = [
  { k: 'biblioteca', rotulo: 'Biblioteca', Icone: FolderOpen },
  { k: 'upload', rotulo: 'Enviar do computador', Icone: Upload },
  { k: 'video', rotulo: 'Vídeo (Link/Plataforma)', Icone: VideoIcon },
  { k: 'link', rotulo: 'Link externo', Icone: Link2 },
]

const BOTAO_ROTULO: Record<FilePickerAba, string> = {
  biblioteca: 'Usar este arquivo',
  upload: 'Usar arquivos enviados',
  video: 'Usar este vídeo',
  link: 'Usar este link',
}

/** tipo_origem armazenado (docx|pdf|html|pptx|xlsx|video|audio) → KindConteudo dos selos/cards. */
function tipoOrigemToKind(tipoOrigem: string): KindConteudo {
  switch (tipoOrigem) {
    case 'pdf': return 'pdf'
    case 'pptx': return 'pptx'
    case 'xlsx': return 'xlsx'
    case 'video': return 'video'
    case 'audio': return 'audio'
    default: return 'docx' // docx/html e desconhecidos → documento
  }
}

// ───────────────────────── Componente principal ─────────────────────────
export function FilePicker({ open, onClose, onSelecionar, abaInicial = 'biblioteca', tenantId, filtros, categoria = 'conteudo' }: FilePickerProps) {
  const [aba, setAba] = useState<FilePickerAba>(abaInicial)
  // Resultado(s) pendente(s) reportado(s) pela aba ativa — habilita o botão do rodapé.
  const [pendente, setPendente] = useState<FilePickerResultado[] | null>(null)
  const [resumo, setResumo] = useState<string | null>(null)

  // Ao (re)abrir, volta à aba inicial e limpa o estado.
  useEffect(() => {
    if (open) { setAba(abaInicial); setPendente(null); setResumo(null) }
  }, [open, abaInicial])

  // Trocar de aba zera o pendente (cada aba re-reporta ao montar).
  const trocarAba = useCallback((k: FilePickerAba) => { setAba(k); setPendente(null); setResumo(null) }, [])

  const reportar = useCallback((r: FilePickerResultado[] | null, texto?: string | null) => {
    setPendente(r && r.length ? r : null)
    setResumo(texto ?? null)
  }, [])

  function confirmar() {
    if (!pendente?.length) return
    for (const r of pendente) onSelecionar(r)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DriveNovoStyles />
      <DialogContent
        showCloseButton
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          'w-[min(1120px,calc(100vw-2rem))] max-w-[min(1120px,calc(100vw-2rem))] sm:max-w-[min(1120px,calc(100vw-2rem))]',
          'h-[min(86vh,780px)]',
        )}
      >
        {/* Cabeçalho + abas (sublinhado) */}
        <div className="shrink-0 border-b px-4 pt-4">
          <DialogTitle className="mb-3">Selecionar arquivo</DialogTitle>
          <div role="tablist" aria-label="Origem do arquivo" className="flex flex-wrap gap-1">
            {ABAS.map(({ k, rotulo, Icone }) => (
              <button
                key={k}
                role="tab"
                aria-selected={aba === k}
                onClick={() => trocarAba(k)}
                className={cn(
                  'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  aba === k
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icone className="h-4 w-4" aria-hidden />
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* Corpo da aba ativa */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {aba === 'biblioteca' && <AbaBiblioteca tenantId={tenantId} filtros={filtros} categoria={categoria} onReportar={reportar} />}
          {aba === 'upload' && <AbaUpload categoria={categoria} onReportar={reportar} />}
          {aba === 'video' && <AbaVideo onReportar={reportar} />}
          {aba === 'link' && <AbaLink onReportar={reportar} />}
        </div>

        {/* Rodapé: selecionado + botão (rótulo muda por aba) */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-3">
          <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {resumo ? <span className="font-medium text-foreground">{resumo}</span> : 'Nenhum item selecionado.'}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancelar</button>
            <button
              onClick={confirmar}
              disabled={!pendente?.length}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {BOTAO_ROTULO[aba]}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── Aba: Biblioteca (liga, não copia) ─────────────────────────
type PastaFlat = { id: string; nome: string; pai_id: string | null }
type DocBib = Awaited<ReturnType<typeof listarArvore>>['documentos'][number]

function AbaBiblioteca({ tenantId, filtros, categoria: CATEGORIA, onReportar }: {
  tenantId: string
  categoria: Categoria
  filtros?: { tipos?: KindConteudo[]; disciplinaId?: string }
  onReportar: (r: FilePickerResultado[] | null, texto?: string | null) => void
}) {
  const [arvore, setArvore] = useState<PastaFlat[] | null>(null)
  const [pastaAtual, setPastaAtual] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocBib[]>([])
  const [subpastas, setSubpastas] = useState<{ id: string; nome: string; cor: string | null }[]>([])
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState<string | null>(null)
  const [tipoChip, setTipoChip] = useState<'todos' | KindConteudo>('todos')
  const [sel, setSel] = useState<DocBib | null>(null)

  // Árvore de pastas (flat → tree) uma vez.
  useEffect(() => {
    listarPastasConteudo(CATEGORIA).then((ps) => setArvore(ps)).catch(() => setArvore([]))
  }, [tenantId])

  const carregar = useCallback(async (pastaId: string | null) => {
    setCarregando(true)
    try {
      const r = await listarArvore(pastaId, CATEGORIA)
      if (!r.ok) { toast.error(r.error || 'Falha ao carregar a biblioteca.'); return }
      setPastaAtual(pastaId)
      setSubpastas(r.pastas.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor ?? null })))
      setDocs(r.documentos)
      setBreadcrumb(r.breadcrumb.map((b) => ({ id: b.id, nome: b.nome })))
    } catch { toast.error('Falha ao carregar a biblioteca.') } finally { setCarregando(false) }
  }, [])

  useEffect(() => { carregar(null) }, [carregar])

  // Selecionar documento reporta ao rodapé (liga por id — nunca copia).
  useEffect(() => {
    if (sel) onReportar([{ tipo: 'biblioteca', documentoId: sel.id, titulo: sel.titulo, kind: tipoOrigemToKind(sel.tipo_origem) }], sel.titulo)
    else onReportar(null)
  }, [sel, onReportar])

  const tiposPermitidos = filtros?.tipos
  const docsFiltrados = useMemo(() => {
    const q = (buscaAtiva ?? busca).trim().toLowerCase()
    return docs
      .filter((d) => !tiposPermitidos?.length || tiposPermitidos.includes(tipoOrigemToKind(d.tipo_origem)))
      .filter((d) => tipoChip === 'todos' || tipoOrigemToKind(d.tipo_origem) === tipoChip)
      .filter((d) => !q || d.titulo.toLowerCase().includes(q))
  }, [docs, busca, buscaAtiva, tipoChip, tiposPermitidos])

  const chips: OpcaoChip[] = useMemo(() => {
    const base: { k: 'todos' | KindConteudo; label: string }[] = [{ k: 'todos', label: 'Todos' }]
    const kinds = tiposPermitidos?.length ? tiposPermitidos : (['docx', 'pdf', 'video', 'audio'] as KindConteudo[])
    for (const k of kinds) base.push({ k, label: TIPOS_CONTEUDO[k].label })
    return base.map((o) => ({ k: o.k, label: o.label, ativo: tipoChip === o.k }))
  }, [tiposPermitidos, tipoChip])

  const capaDe = (d: DocBib) => (d.tipo_origem === 'docx' && d.versao_atual_id ? `/api/admin/biblioteca/capa/${d.versao_atual_id}` : null)

  return (
    <div className="flex h-full min-h-0">
      {/* Árvore à esquerda */}
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r p-2 md:block">
        <TreePasta
          arvore={arvore}
          pastaAtual={pastaAtual}
          onNavegar={(id) => { setSel(null); carregar(id) }}
        />
      </aside>

      {/* Direita: breadcrumb + busca + grade + prévia */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Breadcrumb */}
        <nav className="flex shrink-0 flex-wrap items-center gap-1 border-b px-4 py-2 text-xs">
          <button onClick={() => { setSel(null); carregar(null) }} className={cn('rounded px-1.5 py-0.5 hover:bg-muted', pastaAtual === null ? 'font-semibold text-foreground' : 'text-muted-foreground')}>Biblioteca</button>
          {breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button onClick={() => { setSel(null); carregar(b.id) }} className={cn('rounded px-1.5 py-0.5 hover:bg-muted', pastaAtual === b.id ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{b.nome}</button>
            </span>
          ))}
        </nav>

        <div className="flex min-h-0 flex-1">
          {/* Lista/grade */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
            <div className="shrink-0">
              <BuscaDrive
                valor={busca}
                onValor={setBusca}
                onSubmit={(t) => setBuscaAtiva(t)}
                onLimpar={() => { setBusca(''); setBuscaAtiva(null) }}
                tipos={chips}
                onTipo={(k) => setTipoChip(k as 'todos' | KindConteudo)}
                placeholder="Buscar documentos pelo título…"
                escopoLabel={pastaAtual ? (breadcrumb[breadcrumb.length - 1]?.nome ?? 'Pasta') : 'Biblioteca'}
              />
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {carregando ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando…</div>
              ) : (
                <div className="space-y-4">
                  {/* Subpastas (só quando não há busca por texto) */}
                  {buscaAtiva === null && subpastas.length > 0 && (
                    <div style={cardGrid(FOLDER_MIN, 10)}>
                      {subpastas.map((p) => (
                        <CardPasta key={p.id} nome={p.nome} cor={p.cor} onClick={() => { setSel(null); carregar(p.id) }} />
                      ))}
                    </div>
                  )}
                  {/* Documentos (seleção única) */}
                  {docsFiltrados.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
                      Nenhum documento {tiposPermitidos?.length ? 'do tipo pedido ' : ''}aqui.
                    </div>
                  ) : (
                    <div style={cardGrid(POSTER_MIN, 10)}>
                      {docsFiltrados.map((d) => {
                        const kind = tipoOrigemToKind(d.tipo_origem)
                        const escolhido = sel?.id === d.id
                        return (
                          <CardConteudo
                            key={d.id}
                            kind={kind}
                            titulo={d.titulo}
                            capaUrl={capaDe(d)}
                            subtitulo={TIPOS_CONTEUDO[kind].label}
                            onClick={() => setSel(escolhido ? null : d)}
                            className={cn('cursor-pointer', escolhido && 'ring-2 ring-primary')}
                            acoes={escolhido ? <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Selecionado"><Check className="h-3.5 w-3.5" /></span> : undefined}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Prévia do selecionado */}
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-l p-4 lg:block">
            {sel ? <PreviaDoc d={sel} capaUrl={capaDe(sel)} /> : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                <FolderOpen className="h-8 w-8 opacity-40" aria-hidden />
                Selecione um documento para ligar a este campo. Escolher da biblioteca liga ao arquivo — não cria cópia.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

/** Árvore recursiva de pastas (expand/collapse) para a navegação lateral da aba Biblioteca. */
function TreePasta({ arvore, pastaAtual, onNavegar }: {
  arvore: PastaFlat[] | null
  pastaAtual: string | null
  onNavegar: (id: string | null) => void
}) {
  const filhosPorPai = useMemo(() => {
    const m = new Map<string | null, PastaFlat[]>()
    for (const p of arvore ?? []) { const k = p.pai_id ?? null; const arr = m.get(k) ?? []; arr.push(p); m.set(k, arr) }
    for (const arr of m.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return m
  }, [arvore])

  if (arvore === null) return <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando pastas…</div>

  return (
    <div className="text-sm">
      <button
        onClick={() => onNavegar(null)}
        className={cn('mb-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted', pastaAtual === null && 'bg-primary/10 font-semibold text-primary')}
      >
        <FolderOpen className="h-4 w-4" aria-hidden />Biblioteca
      </button>
      {(filhosPorPai.get(null) ?? []).map((p) => (
        <TreeNo key={p.id} no={p} filhosPorPai={filhosPorPai} pastaAtual={pastaAtual} onNavegar={onNavegar} nivel={0} />
      ))}
    </div>
  )
}

function TreeNo({ no, filhosPorPai, pastaAtual, onNavegar, nivel }: {
  no: PastaFlat
  filhosPorPai: Map<string | null, PastaFlat[]>
  pastaAtual: string | null
  onNavegar: (id: string | null) => void
  nivel: number
}) {
  const filhos = filhosPorPai.get(no.id) ?? []
  const [aberto, setAberto] = useState(false)
  const ativo = pastaAtual === no.id
  return (
    <div>
      <div
        className={cn('flex items-center gap-0.5 rounded-lg pr-1 hover:bg-muted', ativo && 'bg-primary/10')}
        style={{ paddingLeft: nivel * 12 }}
      >
        {filhos.length > 0 ? (
          <button onClick={() => setAberto((v) => !v)} aria-label={aberto ? 'Recolher' : 'Expandir'} className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground">
            {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : <span className="h-6 w-6 shrink-0" />}
        <button
          onClick={() => onNavegar(no.id)}
          className={cn('flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left', ativo ? 'font-semibold text-primary' : 'text-foreground')}
        >
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{no.nome}</span>
        </button>
      </div>
      {aberto && filhos.map((f) => (
        <TreeNo key={f.id} no={f} filhosPorPai={filhosPorPai} pastaAtual={pastaAtual} onNavegar={onNavegar} nivel={nivel + 1} />
      ))}
    </div>
  )
}

function PreviaDoc({ d, capaUrl }: { d: DocBib; capaUrl: string | null }) {
  const kind = tipoOrigemToKind(d.tipo_origem)
  const [erro, setErro] = useState(false)
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-muted">
        {capaUrl && !erro ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capaUrl} alt="" className="aspect-[1/1.3] w-full object-cover object-top" onError={() => setErro(true)} />
        ) : (
          <div className="flex aspect-[1/1.3] w-full items-center justify-center"><SeloTipo kind={kind} /></div>
        )}
      </div>
      <div>
        <div className="flex items-center gap-2"><SeloTipo kind={kind} tamanho="sm" /><span className="text-[11px] text-muted-foreground">{TIPOS_CONTEUDO[kind].label}</span></div>
        <div className="mt-1 text-sm font-semibold leading-snug text-foreground">{d.titulo}</div>
      </div>
    </div>
  )
}

// ───────────────────────── Aba: Enviar do computador ─────────────────────────
function AbaUpload({ categoria: CATEGORIA, onReportar }: { categoria: Categoria; onReportar: (r: FilePickerResultado[] | null, texto?: string | null) => void }) {
  const [pastas, setPastas] = useState<PastaFlat[]>([])
  const [destino, setDestino] = useState<string | null>(null)
  const [uploads, setUploads] = useState<DriveUploadItem[] | null>(null)
  const [enviados, setEnviados] = useState<{ documentoId: string; titulo: string }[]>([])
  const [arrastando, setArrastando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { listarPastasConteudo(CATEGORIA).then(setPastas).catch(() => setPastas([])) }, [])

  useEffect(() => {
    if (enviados.length) onReportar(enviados.map((e) => ({ tipo: 'upload', documentoId: e.documentoId, titulo: e.titulo })), `${enviados.length} ${enviados.length === 1 ? 'arquivo enviado' : 'arquivos enviados'}`)
    else onReportar(null)
  }, [enviados, onReportar])

  // PUT direto ao storage com progresso de bytes (XHR) — mesma mecânica da Biblioteca.
  function subirComProgresso(signedUrl: string, f: File, onProg: (frac: number) => void): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', signedUrl)
        if (f.type) xhr.setRequestHeader('content-type', f.type)
        xhr.setRequestHeader('x-upsert', 'true')
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProg(e.loaded / e.total) }
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
        xhr.onerror = () => resolve(false)
        xhr.send(f)
      } catch { resolve(false) }
    })
  }

  async function enviar(files: File[]) {
    const { kindPorArquivo } = await import('@/lib/biblioteca/tipos-conteudo')
    const suportados = files.filter((f) => kindPorArquivo(f.name, f.type) !== null)
    if (!suportados.length) { toast.error('Nenhum arquivo suportado (docx, pdf, pptx, xlsx, vídeo, áudio).'); return }
    const base = Date.now()
    const itens: DriveUploadItem[] = suportados.map((f, i) => ({ id: `${base}-${i}-${f.name}`, nome: f.name, cor: 'var(--brand-primary, var(--primary))', pct: 0, status: 'enviando' }))
    setUploads((prev) => [...(prev ?? []), ...itens])
    const patch = (id: string, p: Partial<DriveUploadItem>) => setUploads((prev) => (prev ? prev.map((x) => (x.id === id ? { ...x, ...p } : x)) : prev))

    for (let i = 0; i < suportados.length; i++) {
      const f = suportados[i]
      const it = itens[i]
      try {
        const prep = await prepararUploadConteudo(f.name)
        if (!prep.ok || !prep.path || !prep.uploadUrl) { patch(it.id, { status: 'erro', pct: 100 }); continue }
        let subiu = await subirComProgresso(prep.uploadUrl, f, (frac) => patch(it.id, { pct: Math.min(99, Math.round(frac * 100)) }))
        if (!subiu && prep.kind === 'supabase' && prep.token && prep.bucket) {
          const up = await createClient().storage.from(prep.bucket).uploadToSignedUrl(prep.path, prep.token, f, { contentType: f.type || undefined })
          subiu = !up.error
        }
        if (!subiu) { patch(it.id, { status: 'erro', pct: 100 }); continue }
        patch(it.id, { status: 'processando', pct: 100 })
        const titulo = f.name.replace(/\.[^.]+$/, '')
        const r = await importarDeStorage({ path: prep.path, titulo, nomeArquivo: f.name, mime: f.type, pastaId: destino, categoria: CATEGORIA })
        if (r.ok && r.documentoId) { patch(it.id, { status: 'ok' }); setEnviados((prev) => [...prev, { documentoId: r.documentoId!, titulo }]) }
        else patch(it.id, { status: 'erro' })
      } catch { patch(it.id, { status: 'erro', pct: 100 }) }
    }
  }

  const pastasOrdenadas = useMemo(() => [...pastas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [pastas])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-5">
      {/* Pasta de destino */}
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">Pasta de destino na Biblioteca</span>
        <select
          value={destino ?? ''}
          onChange={(e) => setDestino(e.target.value || null)}
          className="h-9 w-full max-w-md rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <option value="">Raiz da Biblioteca</option>
          {pastasOrdenadas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>

      {/* Zona de arrastar/soltar */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length) enviar(fs) }}
        className={cn('flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors', arrastando ? 'border-primary bg-primary/5' : 'border-border bg-muted/20')}
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><FileUp className="h-6 w-6" aria-hidden /></span>
        <div className="text-sm font-medium text-foreground">Arraste arquivos aqui ou</div>
        <button onClick={() => fileRef.current?.click()} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">Escolher do computador</button>
        <p className="text-[11px] text-muted-foreground">Vários arquivos de uma vez. Suportados: documentos, PDF, apresentações, planilhas, vídeo e áudio.</p>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.currentTarget.value = ''; if (fs.length) enviar(fs) }} />
      </div>

      {enviados.length > 0 && (
        <div className="mt-4 rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" />{enviados.length} {enviados.length === 1 ? 'arquivo pronto' : 'arquivos prontos'} para usar</div>
          <ul className="space-y-1 text-sm">
            {enviados.map((e) => <li key={e.documentoId} className="truncate text-foreground">{e.titulo}</li>)}
          </ul>
        </div>
      )}

      {/* Painel flutuante de progresso (reuso exato do DriveUploadPanel). */}
      {uploads && uploads.length > 0 && <DriveUploadPanel itens={uploads} onClose={() => setUploads(null)} />}
    </div>
  )
}

// ───────────────────────── Aba: Vídeo (Link/Plataforma) ─────────────────────────
function AbaVideo({ onReportar }: { onReportar: (r: FilePickerResultado[] | null, texto?: string | null) => void }) {
  const [url, setUrl] = useState('')
  const [titulo, setTitulo] = useState('')
  const [proprio, setProprio] = useState<{ courseId: string; lessonId: string; titulo: string } | null>(null)
  const info = useMemo(() => (url.trim() ? detectarVideo(url) : null), [url])
  const valido = !!info && info.plataforma !== 'desconhecido'

  useEffect(() => {
    if (proprio) onReportar([{ tipo: 'video', url: referenciaVideoProprio(proprio.courseId, proprio.lessonId), plataforma: 'proprio', titulo: titulo.trim() || proprio.titulo, embedUrl: null }], `${PLATAFORMA_LABEL.proprio} · ${titulo.trim() || proprio.titulo}`)
    else if (valido && info) onReportar([{ tipo: 'video', url: url.trim(), plataforma: info.plataforma, titulo: titulo.trim() || undefined, embedUrl: info.embedUrl }], `${PLATAFORMA_LABEL[info.plataforma]}${titulo.trim() ? ` · ${titulo.trim()}` : ''}`)
    else onReportar(null)
  }, [proprio, valido, info, url, titulo, onReportar])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">URL do vídeo</span>
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (e.target.value.trim()) setProprio(null) }}
              placeholder="Cole o link do YouTube, Vimeo, Panda Video ou Google Drive"
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Título (opcional)</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Como o vídeo aparece para o aluno"
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>

          {url.trim() && (
            <div className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', valido ? 'bg-primary/10 text-primary' : 'bg-amber-500/12 text-amber-700 dark:text-amber-400')}>
              {valido ? <><Check className="h-3.5 w-3.5" />{PLATAFORMA_LABEL[info!.plataforma]} detectado</> : <><Info className="h-3.5 w-3.5" />Provedor não reconhecido — use YouTube, Vimeo, Panda ou Google Drive</>}
            </div>
          )}

          {/* Vídeo próprio (hospedado): lista os vídeos prontos do Estúdio (/admin/conteudos/videos). */}
          <SeletorVideoProprio selecionadoId={proprio?.lessonId ?? null} onEscolher={(v) => { setProprio(v); if (v) setUrl('') }} />
        </div>

        {/* Prévia do embed */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-muted-foreground">Prévia</span>
          <div className="aspect-video w-full overflow-hidden rounded-xl border bg-muted">
            {valido && info?.embedUrl ? (
              <iframe src={info.embedUrl} title="Prévia do vídeo" className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                <VideoIcon className="h-8 w-8 opacity-40" aria-hidden />
                {valido ? 'Sem prévia para este provedor.' : 'A prévia aparece quando o link for válido.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Vídeos hospedados: escolhe Curso > Aula (só aulas com vídeo pronto), lidos direto do serviço de vídeo via
// GET /api/admin/video (cursos paginados; ?cursoId&prontas=1). Sem permissão (403) ou falha → estado vazio
// discreto; os provedores por link seguem funcionando.
type CursoSel = { id: string; titulo: string }
type AulaProntaSel = { id: string; titulo: string; moduloTitulo: string; duracaoS?: number | null }
function SeletorVideoProprio({ selecionadoId, onEscolher }: { selecionadoId: string | null; onEscolher: (v: { courseId: string; lessonId: string; titulo: string } | null) => void }) {
  const [busca, setBusca] = useState('')
  const [cursos, setCursos] = useState<CursoSel[]>([])
  const [cursoId, setCursoId] = useState('')
  const [aulas, setAulas] = useState<AulaProntaSel[]>([])
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'indisponivel'>('carregando')
  const [carregandoAulas, setCarregandoAulas] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const res = await fetch('/api/admin/video?page=1&pageSize=100', { signal: ctrl.signal, cache: 'no-store' })
        if (!res.ok) { setEstado('indisponivel'); return }
        const j = (await res.json()) as { rows?: CursoSel[] }
        setCursos(Array.isArray(j.rows) ? j.rows : [])
        setEstado('ok')
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return
        setEstado('indisponivel')
      }
    })()
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    if (!cursoId) { setAulas([]); return }
    const ctrl = new AbortController()
    setCarregandoAulas(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/video?cursoId=${cursoId}&prontas=1`, { signal: ctrl.signal, cache: 'no-store' })
        const j = res.ok ? ((await res.json()) as { aulas?: AulaProntaSel[] }) : {}
        setAulas(Array.isArray(j.aulas) ? j.aulas : [])
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return
        setAulas([])
      } finally {
        if (!ctrl.signal.aborted) setCarregandoAulas(false)
      }
    })()
    return () => ctrl.abort()
  }, [cursoId])

  const q = busca.trim().toLowerCase()
  const visiveis = q ? aulas.filter((a) => a.titulo.toLowerCase().includes(q) || a.moduloTitulo.toLowerCase().includes(q)) : aulas

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground"><VideoIcon className="h-3.5 w-3.5" />{PLATAFORMA_LABEL.proprio}</div>
      {estado === 'indisponivel' ? (
        <p className="text-xs text-muted-foreground">Nenhum vídeo hospedado disponível para seu acesso. Use um dos provedores acima por link.</p>
      ) : estado === 'carregando' ? (
        <div className="flex items-center gap-1.5 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando cursos…</div>
      ) : (
        <>
          <select
            value={cursoId}
            onChange={(e) => { setCursoId(e.target.value); setBusca(''); onEscolher(null) }}
            aria-label="Curso do vídeo hospedado"
            className="mb-2 h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <option value="">{cursos.length ? 'Escolha o curso…' : 'Nenhum curso de vídeo ainda'}</option>
            {cursos.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
          </select>
          {cursoId && (
            <>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar aula pelo título"
                aria-label="Buscar aula hospedada"
                className="mb-2 h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border">
                {carregandoAulas ? (
                  <div className="flex items-center gap-1.5 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando aulas…</div>
                ) : visiveis.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">{q ? 'Nenhuma aula pronta encontrada.' : 'Este curso ainda não tem aula com vídeo pronto.'}</div>
                ) : (
                  <ul>
                    {visiveis.map((v) => {
                      const on = v.id === selecionadoId
                      return (
                        <li key={v.id}>
                          <button type="button" aria-pressed={on} onClick={() => onEscolher(on ? null : { courseId: cursoId, lessonId: v.id, titulo: v.titulo })}
                            className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60', on && 'bg-primary/10 text-primary')}>
                            {on ? <Check className="h-4 w-4 shrink-0" /> : <VideoIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            <span className="min-w-0 flex-1 truncate">{v.titulo}<span className="ml-1.5 text-xs text-muted-foreground">{v.moduloTitulo}</span></span>
                            {typeof v.duracaoS === 'number' && v.duracaoS > 0 && <span className="shrink-0 text-xs text-muted-foreground">{formatTime(v.duracaoS)}</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ───────────────────────── Aba: Link externo ─────────────────────────
function AbaLink({ onReportar }: { onReportar: (r: FilePickerResultado[] | null, texto?: string | null) => void }) {
  const [url, setUrl] = useState('')
  const [titulo, setTitulo] = useState('')
  const [abrirDentro, setAbrirDentro] = useState(true)
  const urlOk = /^https?:\/\/\S+\.\S+/.test(url.trim())

  useEffect(() => {
    if (urlOk) onReportar([{ tipo: 'link', url: url.trim(), titulo: titulo.trim() || url.trim(), abrirDentro }], titulo.trim() || url.trim())
    else onReportar(null)
  }, [urlOk, url, titulo, abrirDentro, onReportar])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">URL do link</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://exemplo.com/artigo"
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            {url.trim() && !urlOk && <span className="mt-1 block text-[11px] text-amber-700 dark:text-amber-400">Informe uma URL completa (começando com http:// ou https://).</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Título</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Como o link aparece para o aluno"
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border p-3">
            <input type="checkbox" checked={abrirDentro} onChange={(e) => setAbrirDentro(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand-primary,var(--primary))]" />
            <span className="text-sm">
              <span className="font-medium text-foreground">Abrir dentro da aula</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">Exibe o link num quadro embutido. Desmarcado, abre em nova aba. Alguns sites bloqueiam a exibição embutida.</span>
            </span>
          </label>
        </div>

        {/* Prévia */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-muted-foreground">Prévia</span>
          <div className="aspect-video w-full overflow-hidden rounded-xl border bg-muted">
            {urlOk && abrirDentro ? (
              <iframe src={url.trim()} title="Prévia do link" className="h-full w-full" sandbox="allow-scripts allow-same-origin allow-popups" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
                <ExternalLink className="h-8 w-8 opacity-40" aria-hidden />
                {urlOk ? 'Abre em nova aba (sem prévia embutida).' : 'A prévia aparece quando a URL for válida.'}
              </div>
            )}
          </div>
          {urlOk && <a href={url.trim()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Abrir em nova aba</a>}
        </div>
      </div>
    </div>
  )
}
