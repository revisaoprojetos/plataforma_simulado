'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  FolderPlus, Upload, Folder, FileText, FileType2, FileCode2, Search, LayoutGrid, List as ListIcon,
  ChevronRight, ChevronLeft, MoreVertical, Loader2, X, CircleCheck, CircleDashed, Archive,
  Download, Pencil, Info, Trash2, FolderInput, Layers, Link2, RotateCcw, Clock, ExternalLink,
} from 'lucide-react'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { formatBrt } from '@/lib/brt'
import {
  listarArvore, criarPasta, removerPasta, renomearPasta, moverDocumento,
  importarDocumento, publicarDocumento, publicarNovaVersao, removerDocumento, detalheDocumento, abrirEdicaoDocx,
  renomearDocumento, urlDownloadDocumento, listarPastasConteudo, dadosVisualizacao, thumbDocumento,
  type PastaConteudo, type Categoria,
} from './actions'

declare global { interface Window { DocsAPI?: any } }

type Doc = Awaited<ReturnType<typeof listarArvore>>['documentos'][number]
type StatusFiltro = 'todos' | 'rascunho' | 'publicado' | 'arquivado'

const ICONE_TIPO: Record<string, typeof FileText> = { docx: FileType2, pdf: FileText, html: FileCode2 }

/** Miniatura do card: tenta a IMAGEM FIEL do .docx (1ª página, render do OnlyOffice) — igual aos Modelos
 *  de Caderno. Se falhar (não-docx, OnlyOffice indisponível), cai na folha de trechos ou no ícone. */
function CardThumb({ doc, thumbUrl, trechos }: { doc: Doc; thumbUrl?: string; trechos?: { tipo: string; texto: string }[] }) {
  // Começa já com a URL da capa (vinda do loader) → renderiza a imagem direto, sem piscar os trechos.
  const [url, setUrl] = useState<string | null>(thumbUrl ?? null)
  const [falhou, setFalhou] = useState(false)
  const Icone = ICONE_TIPO[doc.tipo_origem] ?? FileText
  // Sem capa pronta e é docx → gera via action (1ª vez). Com capa pronta, nem chama.
  useEffect(() => {
    if (url || falhou || doc.tipo_origem !== 'docx') return
    let vivo = true
    thumbDocumento(doc.id).then((r) => { if (vivo) { if (r.url) setUrl(r.url); else setFalhou(true) } }).catch(() => { if (vivo) setFalhou(true) })
    return () => { vivo = false }
  }, [doc.id, doc.tipo_origem, url, falhou])
  // A URL pronta pode apontar p/ capa ainda não gerada → onError regenera via action (uma vez).
  async function aoFalhar() {
    if (doc.tipo_origem !== 'docx') { setUrl(null); setFalhou(true); return }
    const r = await thumbDocumento(doc.id).catch(() => null)
    if (r?.url && r.url !== url) setUrl(r.url)
    else { setUrl(null); setFalhou(true) }
  }
  if (url) return (
    <div className="absolute inset-0 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover object-top" onError={aoFalhar} />
    </div>
  )
  if (trechos?.length) return <CardFolhaPrevia trechos={trechos} />
  return <div className="flex h-full items-center justify-center"><Icone className="h-10 w-10 text-neutral-300" /></div>
}

/** Fallback da miniatura: folha A4 (794px) escalada à largura do card, borda-a-borda. */
function CardFolhaPrevia({ trechos }: { trechos: { tipo: string; texto: string }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.28)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const medir = () => { const w = el.clientWidth; if (w > 10) setScale(w / 794) }
    medir(); const ro = new ResizeObserver(medir); ro.observe(el); return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-white">
      <div style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="pointer-events-none">
        <div className="bg-white px-16 py-14 text-[15px] leading-relaxed text-neutral-900" style={{ width: 794 }}>
          {trechos.map((t, i) => {
            if (t.tipo === 'titulo') return <h2 key={i} className="mb-2 mt-4 text-2xl font-bold first:mt-0">{t.texto}</h2>
            if (t.tipo === 'capitulo') return <h3 key={i} className="mb-1 mt-3 text-lg font-semibold text-neutral-600">{t.texto}</h3>
            return <p key={i} className="mb-2">{t.texto}</p>
          })}
        </div>
      </div>
    </div>
  )
}

function BadgeStatus({ s }: { s: string }) {
  const map: Record<string, { cor: string; Icone: typeof CircleCheck; txt: string }> = {
    publicado: { cor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', Icone: CircleCheck, txt: 'Publicado' },
    rascunho: { cor: 'text-amber-600 dark:text-amber-400 bg-amber-500/10', Icone: CircleDashed, txt: 'Rascunho' },
    arquivado: { cor: 'text-muted-foreground bg-muted', Icone: Archive, txt: 'Arquivado' },
  }
  const v = map[s] ?? map.rascunho
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${v.cor}`}><v.Icone className="h-3 w-3" />{v.txt}</span>
}

export function BibliotecaClient() {
  const searchParams = useSearchParams()
  const [categoria, setCategoria] = useState<Categoria>(searchParams.get('tab') === 'modelos' ? 'modelo_caderno' : 'conteudo')
  const ehModelo = categoria === 'modelo_caderno'
  const [pastaAtual, setPastaAtual] = useState<string | null>(null)
  const [pastas, setPastas] = useState<PastaConteudo[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [previas, setPrevias] = useState<Record<string, { tipo: string; texto: string }[]>>({})
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [breadcrumb, setBreadcrumb] = useState<PastaConteudo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [view, setView] = useState<'grid' | 'lista'>('grid')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<StatusFiltro>('todos')
  const [importAberto, setImportAberto] = useState(false)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [, start] = useTransition()

  async function carregar(pastaId: string | null, cat: Categoria = categoria) {
    setCarregando(true)
    try {
      const r = await listarArvore(pastaId, cat)
      if (!r.ok) { toast.error(r.error || 'Falha ao carregar.'); return }
      setPastas(r.pastas); setDocs(r.documentos); setPrevias(r.previas || {}); setThumbs(r.thumbs || {}); setBreadcrumb(r.breadcrumb); setPastaAtual(pastaId)
    } catch (e) {
      toast.error('Falha ao carregar a Biblioteca.')
    } finally {
      setCarregando(false)
    }
  }
  // A coleção (Conteúdos × Modelos) vem do ?tab= do menu lateral — sincroniza ao navegar.
  useEffect(() => {
    const cat: Categoria = searchParams.get('tab') === 'modelos' ? 'modelo_caderno' : 'conteudo'
    setCategoria((prev) => (prev === cat ? prev : cat))
    setBusca(''); setFiltro('todos')
  }, [searchParams])

  useEffect(() => { carregar(null, categoria) /* eslint-disable-next-line */ }, [categoria])

  const docsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return docs
      .filter((d) => filtro === 'todos' || d.status === filtro)
      .filter((d) => !q || d.titulo.toLowerCase().includes(q))
  }, [docs, busca, filtro])

  async function novaPasta() {
    const nome = await pedirTexto({ titulo: 'Nova pasta', placeholder: 'Nome da pasta', confirmar: 'Criar' })
    if (!nome) return
    const r = await criarPasta(nome, pastaAtual, categoria)
    if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Pasta criada.'); carregar(pastaAtual)
  }
  async function excluirPasta(p: PastaConteudo) {
    if (!(await confirmar({ titulo: 'Excluir pasta?', mensagem: `"${p.nome}" — os documentos voltam para a raiz.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await removerPasta(p.id); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Pasta excluída.'); carregar(pastaAtual)
  }
  async function renomear(p: PastaConteudo) {
    const nome = await pedirTexto({ titulo: 'Renomear pasta', valorInicial: p.nome, confirmar: 'Salvar' })
    if (!nome) return
    const r = await renomearPasta(p.id, nome); if (!r.ok) return toast.error(r.error || 'Falha.')
    carregar(pastaAtual)
  }
  // ── Ações do documento (menu de 3 pontos) ──
  async function editarDocOffice(d: Doc) {
    try {
      const r = await abrirEdicaoDocx(d.id)
      if (!r.ok || !r.versaoId) return toast.error(r.error || 'Edição no editor disponível só para .docx.')
      window.location.href = `/admin/biblioteca/editar/${r.versaoId}`
    } catch (e: any) {
      toast.error('Falha ao abrir o editor: ' + (e?.message || 'erro desconhecido'))
    }
  }
  async function baixarDoc(d: Doc) {
    const r = await urlDownloadDocumento(d.id)
    if (!r.ok || !r.url) return toast.error(r.error || 'Falha ao gerar o link.')
    window.open(r.url, '_blank')
  }
  async function renomearDoc(d: Doc) {
    const titulo = await pedirTexto({ titulo: 'Renomear documento', valorInicial: d.titulo, confirmar: 'Salvar' })
    if (!titulo) return
    const r = await renomearDocumento(d.id, titulo); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Renomeado.'); carregar(pastaAtual)
  }
  async function moverDoc(d: Doc, pastaId: string | null) {
    const r = await moverDocumento(d.id, pastaId); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Documento movido.'); carregar(pastaAtual)
  }
  async function arquivarDoc(d: Doc) {
    if (!(await confirmar({ titulo: 'Arquivar documento?', mensagem: `"${d.titulo}" deixa de aparecer para os alunos.`, confirmar: 'Arquivar', destrutivo: true }))) return
    const r = await removerDocumento(d.id); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Documento arquivado.'); carregar(pastaAtual)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{ehModelo ? 'Modelos de Caderno (OnlyOffice)' : 'Biblioteca de Conteúdos'}</h1>
        <p className="text-sm text-muted-foreground">{ehModelo ? 'Modelos de caderno em .docx, editados 100% no OnlyOffice — organização em Drive (pastas).' : 'Documentos jurídicos versionados — os grifos e anotações sobrevivem às edições.'}</p>
      </div>

      {/* Barra: breadcrumb + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-sm">
          <button onClick={() => carregar(null)} className={`rounded-md px-2 py-1 hover:bg-muted ${pastaAtual === null ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>Início</button>
          {breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button onClick={() => carregar(b.id)} className={`rounded-md px-2 py-1 hover:bg-muted ${pastaAtual === b.id ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{b.nome}</button>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={novaPasta} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"><FolderPlus className="h-4 w-4" />Nova pasta</button>
          <button onClick={() => setImportAberto(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"><Upload className="h-4 w-4" />{ehModelo ? 'Novo modelo (.docx)' : 'Importar documento'}</button>
        </div>
      </div>

      {/* Busca + filtros + view */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar documentos…" className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
        </div>
        <div className="flex items-center gap-1">
          {(['todos', 'publicado', 'rascunho', 'arquivado'] as StatusFiltro[]).map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${filtro === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{f}</button>
          ))}
        </div>
        <div className="flex items-center rounded-lg border p-0.5">
          <button onClick={() => setView('grid')} aria-label="Grade" className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setView('lista')} aria-label="Lista" className={`rounded-md p-1.5 ${view === 'lista' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><ListIcon className="h-4 w-4" /></button>
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando…</div>
      ) : (
        <div className="space-y-5">
          {/* Pastas */}
          {pastas.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pastas</div>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))' }}>
                {pastas.map((p) => (
                  <div key={p.id} className="group flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow">
                    <button onClick={() => carregar(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Folder className="h-5 w-5" /></span>
                      <span className="truncate text-sm font-medium" title={p.nome}>{p.nome}</span>
                    </button>
                    <MenuPasta onRenomear={() => renomear(p)} onExcluir={() => excluirPasta(p)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documentos */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ehModelo ? 'Modelos' : 'Documentos'}</div>
            {docsFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-14 text-center text-sm text-muted-foreground">
                {ehModelo ? 'Nenhum modelo aqui. Crie um a partir de um .docx — você edita no OnlyOffice.' : 'Nenhum documento aqui. Clique em Importar documento para começar.'}
              </div>
            ) : view === 'grid' ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,240px),1fr))' }}>
                {docsFiltrados.map((d) => {
                  const Icone = ICONE_TIPO[d.tipo_origem] ?? FileText
                  return (
                    <div key={d.id} className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                      <button onClick={() => setDetalheId(d.id)} className="block w-full text-left">
                        {/* Miniatura: folha A4 inteira, borda-a-borda — igual aos Modelos de Caderno. */}
                        <div className="relative aspect-[3/4] overflow-hidden border-b bg-neutral-100 dark:bg-neutral-800">
                          <CardThumb doc={d} thumbUrl={thumbs[d.id]} trechos={previas[d.id]} />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.04] to-transparent" />
                          <div className="absolute left-2 top-2"><BadgeStatus s={d.status} /></div>
                        </div>
                        {/* Rodapé: ícone + título + tipo */}
                        <div className="flex items-center gap-2.5 p-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icone className="h-4 w-4" /></span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold leading-tight" title={d.titulo}>{d.titulo}</div>
                            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{d.tipo_origem}</div>
                          </div>
                        </div>
                      </button>
                      <div className="absolute right-2 top-2">
                        <MenuDoc d={d} categoria={categoria} onAbrir={() => setDetalheId(d.id)} onEditarOffice={() => editarDocOffice(d)} onBaixar={() => baixarDoc(d)} onRenomear={() => renomearDoc(d)} onMover={(p) => moverDoc(d, p)} onArquivar={() => arquivarDoc(d)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-4 py-2.5 font-semibold">Documento</th><th className="px-4 py-2.5 text-center font-semibold">Tipo</th><th className="px-4 py-2.5 text-center font-semibold">Status</th><th className="w-10" /></tr>
                  </thead>
                  <tbody>
                    {docsFiltrados.map((d) => {
                      const Icone = ICONE_TIPO[d.tipo_origem] ?? FileText
                      return (
                        <tr key={d.id} onClick={() => setDetalheId(d.id)} className="group cursor-pointer border-b last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-2.5"><span className="flex items-center gap-2"><Icone className="h-4 w-4 text-muted-foreground" /><span className="truncate font-medium" title={d.titulo}>{d.titulo}</span></span></td>
                          <td className="px-4 py-2.5 text-center text-xs uppercase text-muted-foreground">{d.tipo_origem}</td>
                          <td className="px-4 py-2.5 text-center"><BadgeStatus s={d.status} /></td>
                          <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <MenuDoc d={d} categoria={categoria} onAbrir={() => setDetalheId(d.id)} onEditarOffice={() => editarDocOffice(d)} onBaixar={() => baixarDoc(d)} onRenomear={() => renomearDoc(d)} onMover={(p) => moverDoc(d, p)} onArquivar={() => arquivarDoc(d)} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {importAberto && <ImportDialog pastaId={pastaAtual} categoria={categoria} onFechar={() => setImportAberto(false)} onPronto={() => { setImportAberto(false); carregar(pastaAtual) }} />}
      {detalheId && <DetalheDialog documentoId={detalheId} onFechar={() => setDetalheId(null)} onMudou={() => carregar(pastaAtual)} />}
    </div>
  )
}

function MenuPasta({ onRenomear, onExcluir }: { onRenomear: () => void; onExcluir: () => void }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fechar); return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto((v) => !v)} aria-label="Ações da pasta" className={`cursor-pointer rounded-md p-1 text-muted-foreground transition hover:bg-muted ${aberto ? 'opacity-100 bg-muted' : 'opacity-0 group-hover:opacity-100'}`}><MoreVertical className="h-4 w-4" /></button>
      {aberto && (
        <div className="absolute right-0 top-8 z-20 w-36 origin-top-right overflow-hidden rounded-lg border bg-card py-1 text-sm shadow-lg duration-150 animate-in fade-in zoom-in-95 slide-in-from-top-1">
          <button onClick={() => { setAberto(false); onRenomear() }} className="block w-full cursor-pointer px-3 py-1.5 text-left transition-colors hover:bg-muted">Renomear</button>
          <button onClick={() => { setAberto(false); onExcluir() }} className="block w-full cursor-pointer px-3 py-1.5 text-left text-destructive transition-colors hover:bg-destructive/10">Excluir</button>
        </div>
      )}
    </div>
  )
}

function ItemMenu({ onClick, icon: Icone, children, destrutivo }: { onClick: () => void; icon: typeof FileText; children: React.ReactNode; destrutivo?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${destrutivo ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-muted'}`}>
      <Icone className="h-4 w-4 shrink-0 opacity-70" />{children}
    </button>
  )
}

/** Menu de 3 pontos do documento (estilo Drive): abrir/editar/baixar/renomear/mover/arquivar. */
function MenuDoc({ d, categoria, onAbrir, onEditarOffice, onBaixar, onRenomear, onMover, onArquivar }: {
  d: Doc; categoria: Categoria
  onAbrir: () => void; onEditarOffice: () => void; onBaixar: () => void; onRenomear: () => void; onMover: (pastaId: string | null) => void; onArquivar: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [tela, setTela] = useState<'raiz' | 'mover'>('raiz')
  const [pastas, setPastas] = useState<{ id: string; nome: string; pai_id: string | null }[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setAberto(false); setTela('raiz') } }
    document.addEventListener('mousedown', fechar); return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])
  const fecha = (fn: () => void) => () => { setAberto(false); setTela('raiz'); fn() }
  async function abrirMover() { setTela('mover'); if (!pastas) setPastas(await listarPastasConteudo(categoria)) }
  // profundidade p/ indentar a árvore de pastas
  const prof = (id: string | null, ps: typeof pastas): number => { let n = 0, cur = id; const byId = new Map((ps ?? []).map((p) => [p.id, p])); while (cur && byId.get(cur)) { n++; cur = byId.get(cur)!.pai_id } return n }

  return (
    <div className="relative" ref={ref}>
      <button onClick={(e) => { e.stopPropagation(); setAberto((v) => !v); setTela('raiz') }} aria-label="Ações do documento" className={`cursor-pointer rounded-md p-1 backdrop-blur-sm transition hover:bg-muted focus-visible:opacity-100 ${aberto ? 'bg-muted text-foreground opacity-100' : 'bg-card/70 text-muted-foreground opacity-0 group-hover:opacity-100'}`}><MoreVertical className="h-4 w-4" /></button>
      {aberto && (
        <div className="absolute right-0 top-8 z-30 w-52 origin-top-right overflow-hidden rounded-xl border bg-card py-1 text-sm shadow-xl duration-150 animate-in fade-in zoom-in-95 slide-in-from-top-1" onClick={(e) => e.stopPropagation()}>
          {tela === 'raiz' ? (
            <>
              <ItemMenu icon={Info} onClick={fecha(onAbrir)}>Informações / versões</ItemMenu>
              {d.tipo_origem === 'docx' && <ItemMenu icon={Pencil} onClick={fecha(onEditarOffice)}>Editar no OnlyOffice</ItemMenu>}
              <ItemMenu icon={Download} onClick={fecha(onBaixar)}>Baixar</ItemMenu>
              <ItemMenu icon={FileText} onClick={fecha(onRenomear)}>Renomear</ItemMenu>
              <button onClick={abrirMover} className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-muted"><FolderInput className="h-4 w-4 shrink-0 opacity-70" />Mover para…<ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" /></button>
              <div className="my-1 border-t" />
              <ItemMenu icon={Trash2} onClick={fecha(onArquivar)} destrutivo>Arquivar</ItemMenu>
            </>
          ) : (
            <>
              <button onClick={() => setTela('raiz')} className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 text-left font-medium text-muted-foreground transition-colors hover:bg-muted"><ChevronLeft className="h-3.5 w-3.5" />Mover para</button>
              <div className="my-1 border-t" />
              <div className="max-h-56 overflow-y-auto">
                <ItemMenu icon={Folder} onClick={fecha(() => onMover(null))}>Raiz</ItemMenu>
                {pastas === null ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando…</div>
                ) : pastas.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Sem pastas.</div>
                ) : pastas.map((p) => (
                  <button key={p.id} onClick={fecha(() => onMover(p.id))} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted" style={{ paddingLeft: 12 + prof(p.pai_id, pastas) * 12 }}>
                    <Folder className="h-4 w-4 shrink-0 opacity-70" /><span className="truncate">{p.nome}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Overlay({ children, onFechar, largura = 'max-w-lg' }: { children: React.ReactNode; onFechar: () => void; largura?: string }) {
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [onFechar])
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className={`w-full ${largura} max-h-[88vh] overflow-auto rounded-2xl border bg-card p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

const INP = 'h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30'
const FILE_INPUT = 'block w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground file:transition-opacity hover:file:opacity-90'

function ImportDialog({ pastaId, categoria, onFechar, onPronto }: { pastaId: string | null; categoria: Categoria; onFechar: () => void; onPronto: () => void }) {
  const ehModelo = categoria === 'modelo_caderno'
  const [titulo, setTitulo] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!titulo.trim() || !arquivo) { toast.error('Preencha o título e escolha um arquivo.'); return }
    setEnviando(true)
    try {
      const dataBase64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(arquivo) })
      const r = await importarDocumento({ titulo, pastaId, nomeArquivo: arquivo.name, mime: arquivo.type, dataBase64, categoria })
      if (!r.ok) { toast.error(r.error || 'Falha ao importar.'); setEnviando(false); return }
      toast.success(`Importado — ${r.trechos ?? 0} trechos estruturados.`); onPronto()
    } catch (e) { toast.error('Falha ao ler o arquivo.'); setEnviando(false) }
  }

  return (
    <Overlay onFechar={onFechar}>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{ehModelo ? 'Novo modelo de caderno (.docx)' : 'Importar documento'}</h2><button onClick={onFechar} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
      <div className="space-y-3">
        <Campo rotulo="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={INP} placeholder={ehModelo ? 'Ex.: Modelo de diagnóstico AGU' : 'Ex.: Lei Seca — Direito Constitucional'} /></Campo>
        <p className="text-xs text-muted-foreground">A origem é registrada automaticamente com a sua conta.</p>
        <Campo rotulo={ehModelo ? 'Arquivo .docx (editável no OnlyOffice)' : 'Arquivo (.docx, .pdf ou .html)'}>
          <input type="file" accept={ehModelo ? '.docx' : '.docx,.pdf,.html,.htm'} onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className={FILE_INPUT} />
        </Campo>
        {ehModelo && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">O modelo é editado 100% no OnlyOffice. Use .docx para poder editar depois.</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onFechar} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
        <button onClick={enviar} disabled={enviando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">{enviando && <Loader2 className="h-4 w-4 animate-spin" />}Importar</button>
      </div>
    </Overlay>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{rotulo}</span>{children}</label>
}

type AbaDetalhe = 'versoes' | 'detalhes'

function DetalheDialog({ documentoId, onFechar, onMudou }: { documentoId: string; onFechar: () => void; onMudou: () => void }) {
  const [dados, setDados] = useState<Awaited<ReturnType<typeof detalheDocumento>> | null>(null)
  const [novaVersao, setNovaVersao] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aba, setAba] = useState<AbaDetalhe>('versoes')
  const [vis, setVis] = useState<Awaited<ReturnType<typeof dadosVisualizacao>> | null>(null)

  async function recarregar() { setDados(await detalheDocumento(documentoId)) }
  useEffect(() => { recarregar(); setVis(null); dadosVisualizacao(documentoId).then(setVis).catch(() => setVis({ ok: false, error: 'Falha ao carregar.' })) }, [documentoId])
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [onFechar])
  // Pré-aquece o script do OnlyOffice assim que o visualizador abre (em paralelo com dadosVisualizacao) —
  // o api.js já fica baixado/carregado quando o VisualizadorOffice precisar criar o editor.
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082'
    const src = `${base}/web-apps/apps/api/documents/api.js`
    if (document.querySelector(`script[src="${src}"]`)) return
    const s = document.createElement('script'); s.src = src; s.async = true; document.body.appendChild(s)
  }, [])

  async function enviarVersao(publicar: boolean) {
    if (!novaVersao) { toast.error('Escolha um arquivo.'); return }
    setOcupado(true)
    try {
      const dataBase64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(novaVersao) })
      const r = await publicarNovaVersao({ documentoId, nomeArquivo: novaVersao.name, mime: novaVersao.type, dataBase64, publicar })
      if (!r.ok) { toast.error(r.error || 'Falha.'); setOcupado(false); return }
      const rc = r.reconc
      toast.success(`Nova versão — ${rc?.carregados ?? 0} trechos mantidos, ${rc?.novos ?? 0} novos. Anotações: ${rc?.anotacoes?.alteradas ?? 0} alteradas, ${rc?.anotacoes?.orfas ?? 0} órfãs.`)
      setNovaVersao(null); await recarregar(); dadosVisualizacao(documentoId).then(setVis).catch(() => {}); onMudou()
    } catch { toast.error('Falha ao ler o arquivo.') } finally { setOcupado(false) }
  }
  async function publicar(versaoId: string) {
    setOcupado(true); const r = await publicarDocumento(documentoId, versaoId); setOcupado(false)
    if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Versão publicada.'); await recarregar(); onMudou()
  }
  async function excluir() {
    if (!(await confirmar({ titulo: 'Arquivar documento?', mensagem: 'Ele deixa de aparecer para os alunos.', confirmar: 'Arquivar', destrutivo: true }))) return
    const r = await removerDocumento(documentoId); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Documento arquivado.'); onMudou(); onFechar()
  }
  async function editarNoOffice() {
    setOcupado(true); const r = await abrirEdicaoDocx(documentoId); setOcupado(false)
    if (!r.ok || !r.versaoId) return toast.error(r.error || 'Falha ao abrir o editor.')
    window.location.href = `/admin/biblioteca/editar/${r.versaoId}`
  }

  const doc = dados && dados.ok ? dados.doc : null
  const Icone = doc ? (ICONE_TIPO[doc.tipo_origem] ?? FileText) : FileText
  const ABAS: { k: AbaDetalhe; rotulo: string; Icone: typeof Layers }[] = [
    { k: 'versoes', rotulo: 'Versões', Icone: Layers },
    { k: 'detalhes', rotulo: 'Detalhes', Icone: Info },
  ]

  // Visualizador em tela cheia (estilo Modelos de Caderno): folha no centro + lateral direita com as informações.
  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-neutral-900/80 backdrop-blur-sm duration-200 animate-in fade-in">
      {/* Barra superior escura */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 bg-neutral-950/90 px-3 text-neutral-100">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={onFechar} aria-label="Fechar" className="cursor-pointer rounded-full p-2 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-primary/25 text-primary-foreground"><Icone className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{doc?.titulo ?? 'Documento'}</p>
            <p className="truncate text-[11px] uppercase leading-tight tracking-wide text-neutral-400">{doc?.tipo_origem ?? ''}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => baixarDocDireto(documentoId)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-200 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white"><Download className="h-4 w-4" />Baixar</button>
          {doc?.tipo_origem === 'docx' && <button onClick={editarNoOffice} disabled={ocupado} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"><ExternalLink className="h-4 w-4" />Abrir no editor</button>}
        </div>
      </div>

      {/* Corpo: folha (centro) + informações (direita) */}
      {!dados ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-neutral-300"><Loader2 className="h-5 w-5 animate-spin" />Carregando…</div>
      ) : !dados.ok ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-rose-300">{dados.error}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* VISUALIZAÇÃO FIEL — o .docx renderizado no OnlyOffice (modo leitura), com blocos/cores reais. */}
          <div className="min-w-0 flex-1 bg-neutral-200 dark:bg-neutral-900">
            {!vis ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Abrindo visualização…</div>
            ) : !vis.ok ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">{vis.error || 'Não foi possível visualizar.'}</div>
            ) : vis.tipoOrigem === 'html' ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">Documento HTML — use “Baixar” para abrir.</div>
            ) : (
              <VisualizadorOffice key={vis.versaoId} versaoId={vis.versaoId!} documentUrl={vis.documentUrl!} onlyofficeUrl={vis.onlyofficeUrl!} chave={vis.chave!} titulo={doc!.titulo} fileType={vis.fileType!} />
            )}
          </div>

          {/* INFORMAÇÕES — lateral direita */}
          <aside className="flex w-[360px] max-w-[85vw] shrink-0 flex-col border-l bg-card">
            <div className="border-b p-4">
              <h2 className="truncate text-base font-semibold leading-tight" title={doc!.titulo}>{doc!.titulo}</h2>
              <div className="mt-1.5 flex items-center gap-2"><BadgeStatus s={doc!.status} /><span className="text-xs uppercase tracking-wide text-muted-foreground">{doc!.tipo_origem}</span></div>
            </div>

            {/* Abas (linha / sublinhado) */}
            <div className="flex items-center gap-1 border-b px-3">
              {ABAS.map(({ k, rotulo, Icone: Ic }) => (
                <button key={k} onClick={() => setAba(k)} className={`flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${aba === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                  <Ic className="h-4 w-4" />{rotulo}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {aba === 'versoes' && (
                <div className="space-y-5 p-4">
                  <div>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico de edições</div>
                    {/* Timeline: cada versão é um evento de edição (upload/editor/restauração). */}
                    <ol className="relative space-y-3 border-l pl-5">
                      {dados.versoes.map((v) => {
                        const ev = EVENTO_VERSAO[v.origem] ?? EVENTO_VERSAO.upload
                        const atual = doc!.versao_atual_id === v.id
                        return (
                          <li key={v.id} className="relative">
                            <span className={`absolute -left-[26px] top-0.5 grid h-5 w-5 place-items-center rounded-full ring-4 ring-card ${atual ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><ev.Icone className="h-3 w-3" /></span>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">v{v.numero}</span>
                              <span className="text-xs text-muted-foreground">{ev.rotulo}</span>
                              <StatusConv s={v.status_conversao} />
                              {atual && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Versão atual</span>}
                              {!atual && <button onClick={() => publicar(v.id)} disabled={ocupado} className="cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium transition hover:bg-muted disabled:opacity-60">Tornar atual</button>}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />{formatBrt(v.criada_em) ?? '—'}</div>
                          </li>
                        )
                      })}
                    </ol>
                  </div>

                  <div className="rounded-xl border bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nova versão</div>
                    <input type="file" accept=".docx,.pdf,.html,.htm" onChange={(e) => setNovaVersao(e.target.files?.[0] ?? null)} className={FILE_INPUT} />
                    <p className="mt-2 text-xs text-muted-foreground">A reconciliação carrega os uids da versão anterior — grifos sobrevivem; mudanças viram aviso.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => enviarVersao(false)} disabled={ocupado || !novaVersao} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted disabled:opacity-60">{ocupado && <Loader2 className="h-4 w-4 animate-spin" />}Enviar (rascunho)</button>
                      <button onClick={() => enviarVersao(true)} disabled={ocupado || !novaVersao} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60">Enviar e publicar</button>
                    </div>
                  </div>
                </div>
              )}

              {aba === 'detalhes' && (
                <div className="space-y-6 p-4 text-sm">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informações</div>
                    <div className="rounded-xl border px-4">
                      <LinhaDetalhe rotulo="Título" valor={doc!.titulo} />
                      <LinhaDetalhe rotulo="Tipo" valor={doc!.tipo_origem.toUpperCase()} />
                      <LinhaDetalhe rotulo="Status" valor={<BadgeStatus s={doc!.status} />} />
                      <LinhaDetalhe rotulo="Origem" valor={doc!.fonte || '—'} />
                      <LinhaDetalhe rotulo="Licença" valor={doc!.licenca || '—'} />
                      <LinhaDetalhe rotulo="Versões" valor={String(dados.versoes.length)} />
                      <LinhaDetalhe rotulo="Criado em" valor={formatBrt(doc!.criado_em) ?? '—'} />
                      <LinhaDetalhe rotulo="Atualizado em" valor={formatBrt(doc!.atualizado_em) ?? '—'} />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Link2 className="h-3.5 w-3.5" />Onde é usado</div>
                    {dados.vinculos.length === 0 ? (
                      <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">Este documento ainda não está vinculado a nenhum produto (desafio, trilha, caderno…).</div>
                    ) : (
                      <div className="space-y-1.5">
                        {dados.vinculos.map((vc) => (
                          <div key={vc.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Link2 className="h-3.5 w-3.5" /></span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{PRODUTO_LABEL[vc.produto_tipo] ?? vc.produto_tipo}</div>
                              <div className="truncate text-[11px] text-muted-foreground" title={vc.produto_ref_id}>{vc.modo === 'fixada' ? 'Versão fixada' : 'Sempre a versão atual'} · ref {vc.produto_ref_id.slice(0, 8)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé: arquivar */}
            <div className="border-t p-3">
              <button onClick={excluir} className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10"><Trash2 className="h-4 w-4" />Arquivar documento</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

async function baixarDocDireto(documentoId: string) {
  const r = await urlDownloadDocumento(documentoId)
  if (!r.ok || !r.url) return toast.error(r.error || 'Falha ao gerar o link.')
  window.open(r.url, '_blank')
}

/** Render FIEL do documento no OnlyOffice (modo leitura) — a MESMA renderização do editor/Modelos,
 *  só-leitura. Mostra o .docx com blocos/cores reais (não os trechos em texto). */
function VisualizadorOffice({ versaoId, documentUrl, onlyofficeUrl, chave, titulo, fileType }: {
  versaoId: string; documentUrl: string; onlyofficeUrl: string; chave: string; titulo: string; fileType: string
}) {
  const montado = useRef(false)
  const [erro, setErro] = useState<string | null>(null)
  const elId = `oo-view-${versaoId}`
  useEffect(() => {
    if (montado.current) return
    montado.current = true
    const scriptSrc = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
    const criar = () => {
      try {
        if (!window.DocsAPI) { setErro('OnlyOffice carregou, mas DocsAPI não existe.'); return }
        const key = `${versaoId}_view_${chave}`.replace(/[^a-z0-9_-]/gi, '')
        new window.DocsAPI.DocEditor(elId, {
          documentType: fileType === 'pdf' ? 'pdf' : 'word',
          document: { fileType, key, title: `${titulo}.${fileType}`, url: documentUrl, permissions: { edit: false, download: true } },
          editorConfig: { lang: 'pt', mode: 'view', user: { id: 'admin', name: 'Admin' }, customization: { hideRightMenu: true, compactHeader: true, toolbarNoTabs: true } },
          width: '100%', height: '100%',
        })
      } catch (e) { setErro((e as Error).message) }
    }
    const existente = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement | null
    if (existente && window.DocsAPI) { criar(); return }
    if (existente) { existente.addEventListener('load', criar); return }
    const s = document.createElement('script')
    s.src = scriptSrc; s.async = true; s.onload = criar
    s.onerror = () => setErro('Não carregou o OnlyOffice. Confira NEXT_PUBLIC_ONLYOFFICE_URL.')
    document.body.appendChild(s)
  }, [versaoId, documentUrl, onlyofficeUrl, chave, titulo, fileType, elId])
  if (erro) return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-400">{erro}</div>
  return <div id={elId} className="h-full w-full" />
}

// Rótulos/ícones por origem de versão (o "histórico de edições") e por tipo de produto vinculado.
const EVENTO_VERSAO: Record<string, { rotulo: string; Icone: typeof Upload }> = {
  upload: { rotulo: 'Importado (upload)', Icone: Upload },
  edicao_editor: { rotulo: 'Editado no OnlyOffice', Icone: Pencil },
  restauracao: { rotulo: 'Versão restaurada', Icone: RotateCcw },
}
const PRODUTO_LABEL: Record<string, string> = {
  desafio: 'Desafio', trilha: 'Trilha', aula: 'Aula', pasta: 'Pasta',
  simulado: 'Simulado', curso: 'Curso', caderno: 'Caderno', modelo_caderno: 'Modelo de caderno',
}

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 truncate text-right font-medium">{valor}</span>
    </div>
  )
}

function StatusConv({ s }: { s: string }) {
  const map: Record<string, string> = { ok: 'text-emerald-600 dark:text-emerald-400', pendente: 'text-muted-foreground', processando: 'text-sky-600 dark:text-sky-400', revisao_necessaria: 'text-amber-600 dark:text-amber-400', erro: 'text-destructive' }
  const label: Record<string, string> = { ok: 'estruturado', pendente: 'pendente', processando: 'processando', revisao_necessaria: 'revisar', erro: 'erro' }
  return <span className={`text-[11px] ${map[s] ?? 'text-muted-foreground'}`}>· {label[s] ?? s}</span>
}
