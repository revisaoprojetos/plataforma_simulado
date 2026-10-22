'use client'

// Navegação da Biblioteca do ALUNO — MESMO visual do admin (Drive): breadcrumb, pastas (card gd-* do
// prototipo) e documentos com CAPA fiel (1ª página). Só-leitura: o aluno Abre (área de leitura/grifo) ou
// Baixa o original. Navega por pasta via server action (gate aplicado no servidor). Largura cheia.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, ChevronLeft, ChevronRight, Home, Search, FileText, FileType2, FileCode2, MoreVertical, Download, Loader2 } from 'lucide-react'
import { DrivePastaStyles } from '@/components/admin/pasta-card-drive'
import { MenuPortal, ItemMenu } from '@/components/conteudo/menu-drive'
import { navegarBibliotecaAluno } from '@/app/aluno/(portal)/biblioteca/actions'
import type { ArvoreAluno, PastaAluno, DocAluno } from '@/lib/conteudo/leitor'

const ICONE_TIPO: Record<string, typeof FileText> = { docx: FileType2, pdf: FileText, html: FileCode2 }

export function BibliotecaDrive({ inicial }: { inicial: ArvoreAluno }) {
  const [arvore, setArvore] = useState<ArvoreAluno>(inicial)
  const [carregando, setCarregando] = useState(false)
  const [busca, setBusca] = useState('')

  const ir = useCallback(async (pastaId: string | null) => {
    setCarregando(true)
    try { const r = await navegarBibliotecaAluno(pastaId); if (r) { setArvore(r); setBusca('') } }
    finally { setCarregando(false) }
  }, [])

  const bc = arvore.breadcrumb
  const docs = arvore.documentos.filter((d) => d.titulo.toLowerCase().includes(busca.trim().toLowerCase()))
  const pastas = arvore.pastas.filter((p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <div className="animate-page w-full">
      <DrivePastaStyles />

      {/* Cabeçalho */}
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><BookOpen className="h-6 w-6" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Biblioteca</h1>
          <p className="text-sm text-muted-foreground">Seus materiais de leitura — leia na plataforma e salve seus grifos.</p>
        </div>
      </div>

      {/* Breadcrumb + voltar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => ir(bc.length >= 2 ? bc[bc.length - 2].id : null)} disabled={bc.length === 0 || carregando}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-muted disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />Voltar
        </button>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
          <button onClick={() => ir(null)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Home className="h-4 w-4" />Início</button>
          {bc.map((p, i) => (
            <span key={p.id} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              <button onClick={() => ir(p.id)} className={`truncate rounded-md px-2 py-1 ${i === bc.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} title={p.nome}>{p.nome}</button>
            </span>
          ))}
        </nav>
        <div className="relative min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar neste nível…" className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando…</div>
      ) : pastas.length === 0 && docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-20 text-center text-sm text-muted-foreground">
          {busca ? 'Nada encontrado para a busca.' : 'Nenhum material liberado aqui.'}
        </div>
      ) : (
        <div className="space-y-6">
          {pastas.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pastas</div>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {pastas.map((p) => <PastaCardAluno key={p.id} pasta={p} onAbrir={() => ir(p.id)} />)}
              </div>
            </div>
          )}

          {docs.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documentos</div>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {docs.map((d) => <DocCardAluno key={d.id} doc={d} thumbUrl={arvore.thumbs[d.id]} trechos={arvore.previas[d.id]} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Card de pasta — mesmo visual gd-* do admin, só-abrir (sem menu de edição). */
function PastaCardAluno({ pasta, onAbrir }: { pasta: PastaAluno; onAbrir: () => void }) {
  return (
    <div className="gd-folder-card" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === 'Enter') onAbrir() }}>
      <span className="gd-ico-wrap">
        <svg className="gd-ico" viewBox="0 0 24 24" style={{ fill: pasta.cor || 'var(--gd-folder)' }}>
          <path d="M10 4H4c-1.1 0-2 .9-2 2v2h20c0-1.1-.9-2-2-2h-8l-2-2z" />
          <path className="gd-flap" d="M2 8v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8H2z" />
        </svg>
      </span>
      <span className="gd-name" title={pasta.nome}>{pasta.nome}</span>
      <span className="ml-auto shrink-0 pr-1 text-[11px] text-muted-foreground">{pasta.totalDocs}</span>
    </div>
  )
}

/** Card de documento — mesma miniatura (capa fiel) + rodapé do admin; MESMO menu animado (Abrir/Baixar). */
function DocCardAluno({ doc, thumbUrl, trechos }: { doc: DocAluno; thumbUrl?: string; trechos?: { tipo: string; texto: string }[] }) {
  const [aberto, setAberto] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  const Icone = ICONE_TIPO[doc.tipo_origem] ?? FileText
  const href = `/aluno/biblioteca/${doc.id}`
  const fecha = (fn: () => void) => () => { setAberto(false); fn() }

  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <Link href={href} className="block w-full text-left">
        <div className="relative aspect-[3/4] overflow-hidden border-b bg-neutral-100 dark:bg-neutral-800">
          <CardCapaAluno tipo={doc.tipo_origem} thumbUrl={thumbUrl} trechos={trechos} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.04] to-transparent" />
        </div>
        <div className="flex items-center gap-2.5 p-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icone className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight" title={doc.titulo}>{doc.titulo}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{doc.tipo_origem}</div>
          </div>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <button ref={btnRef} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAberto((v) => !v) }} aria-label="Ações do documento"
          className={`cursor-pointer rounded-md p-1 backdrop-blur-sm transition hover:bg-muted focus-visible:opacity-100 ${aberto ? 'bg-muted text-foreground opacity-100' : 'bg-card/70 text-muted-foreground opacity-0 group-hover:opacity-100'}`}>
          <MoreVertical className="h-4 w-4" />
        </button>
        {aberto && (
          <MenuPortal anchor={btnRef.current} onClose={() => setAberto(false)} largura={224}>
            <ItemMenu icon={BookOpen} onClick={fecha(() => router.push(href))}>Abrir</ItemMenu>
            <ItemMenu icon={Download} onClick={fecha(() => window.open(`/api/conteudo/baixar?doc=${encodeURIComponent(doc.id)}`, '_blank'))}>Baixar</ItemMenu>
          </MenuPortal>
        )}
      </div>
    </div>
  )
}

/** Capa fiel (1ª página) do card: PNG cacheado → fallback prévia de trechos → ícone. Presentacional. */
function CardCapaAluno({ tipo, thumbUrl, trechos }: { tipo: string; thumbUrl?: string; trechos?: { tipo: string; texto: string }[] }) {
  const [ruim, setRuim] = useState(false)
  const Icone = ICONE_TIPO[tipo] ?? FileText
  if (thumbUrl && !ruim) return (
    <div className="absolute inset-0 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover object-top" onError={() => setRuim(true)} />
    </div>
  )
  if (trechos?.length) return <CardFolhaPrevia trechos={trechos} />
  return <div className="flex h-full items-center justify-center"><Icone className="h-10 w-10 text-neutral-300" /></div>
}

/** Folha A4 (794px) escalada à largura do card — mesma prévia do admin. */
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
