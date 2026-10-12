'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { FolderPlus, FilePlus2, Folder, FileCode2, Pencil, Trash2, ChevronRight, ChevronLeft, X, Loader2, Save, FolderInput, BadgeCheck, ImagePlus } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { prepararSelosLeitura, codigoCurto } from '@/lib/leitura/selos'
import {
  carregarBiblioteca, salvarItem, excluirItem, moverItem, criarPastaBib, renomearPastaBib, excluirPastaBib, importarSelosPadrao, uploadImagemBib,
  type Tipo, type BibItem, type BibPasta,
} from '@/app/admin/leitura/biblioteca/actions'

/** Prévia: injeta o HTML imperativamente (React NÃO gerencia os filhos) e converte os selos
 * (<span data-selo>/tags) na imagem oficial. Imperativo p/ a mutação span→img não ser desfeita
 * pelo React ao re-renderizar (ex.: ao fechar o editor) — senão o preview "sumia". */
function Preview({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = html || ''
    try { prepararSelosLeitura(el) } catch { /* ignore */ }
  }, [html])
  return <div ref={ref} className={cn('leitura-prosa', className)} />
}

type Carga = { ok: boolean; itens: BibItem[]; pastas: BibPasta[]; error?: string }

export function BibliotecaClient({ conteudo, tags }: { conteudo: Carga; tags: Carga }) {
  const [aba, setAba] = useState<Tipo>('conteudo')
  const [dados, setDados] = useState<Record<Tipo, Carga>>({ conteudo, tag: tags })
  const cur = dados[aba]

  const recarregar = async (tipo: Tipo) => { const r = await carregarBiblioteca(tipo); setDados((d) => ({ ...d, [tipo]: r })) }

  return (
    <div className="mt-5">
      <div className="mb-4 flex gap-1 border-b">
        {(['conteudo', 'tag'] as Tipo[]).map((t) => (
          <button key={t} onClick={() => setAba(t)} className={cn(
            '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            aba === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
          )}>
            {t === 'conteudo' ? 'Conteúdos' : 'Tags'}
          </button>
        ))}
      </div>
      {!cur.ok ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{cur.error ?? 'Erro ao carregar.'}</div>
      ) : (
        <Navegador key={aba} tipo={aba} carga={cur} onMudou={() => recarregar(aba)} />
      )}
    </div>
  )
}

function Navegador({ tipo, carga, onMudou }: { tipo: Tipo; carga: Carga; onMudou: () => void }) {
  const [pastaAtual, setPastaAtual] = useState<string | null>(null)
  const [editando, setEditando] = useState<Partial<BibItem> | null>(null) // null = fechado; {} = novo
  const [pend, start] = useTransition()

  const filhasPasta = useMemo(() => carga.pastas.filter((p) => (p.pai_id ?? null) === pastaAtual), [carga.pastas, pastaAtual])
  const itensPasta = useMemo(() => carga.itens.filter((i) => (i.pasta_id ?? null) === pastaAtual), [carga.itens, pastaAtual])
  const porId = useMemo(() => new Map(carga.pastas.map((p) => [p.id, p])), [carga.pastas])

  const trilha = useMemo(() => {
    const t: BibPasta[] = []
    let id = pastaAtual
    while (id) { const p = porId.get(id); if (!p) break; t.unshift(p); id = p.pai_id }
    return t
  }, [pastaAtual, porId])

  const novaPasta = () => start(async () => {
    const nome = window.prompt('Nome da nova pasta:')?.trim(); if (!nome) return
    const r = await criarPastaBib(tipo, nome, pastaAtual); if (!r.ok) return void toast.error(r.error ?? 'Erro')
    toast.success('Pasta criada.'); onMudou()
  })
  const renomearPasta = (p: BibPasta) => start(async () => {
    const nome = window.prompt('Renomear pasta:', p.nome)?.trim(); if (!nome || nome === p.nome) return
    const r = await renomearPastaBib(p.id, nome); if (!r.ok) return void toast.error(r.error ?? 'Erro')
    toast.success('Pasta renomeada.'); onMudou()
  })
  const excluirPasta = (p: BibPasta) => start(async () => {
    if (!(await confirmar({ titulo: 'Excluir pasta', mensagem: `Excluir "${p.nome}"? As subpastas e itens voltam à raiz.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await excluirPastaBib(p.id); if (!r.ok) return void toast.error(r.error ?? 'Erro')
    toast.success('Pasta excluída.'); onMudou()
  })
  const removerItem = (i: BibItem) => start(async () => {
    if (!(await confirmar({ titulo: 'Excluir item', mensagem: `Excluir "${i.nome}"?`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await excluirItem(i.id); if (!r.ok) return void toast.error(r.error ?? 'Erro')
    toast.success('Item excluído.'); onMudou()
  })
  const seedSelos = () => start(async () => {
    const r = await importarSelosPadrao(); if (!r.ok) return void toast.error(r.error ?? 'Erro')
    toast.success(`${r.criados ?? 0} selo(s) importado(s).`); onMudou()
  })

  return (
    <div>
      {/* Toolbar + trilha */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {pastaAtual && (
            <button
              onClick={() => setPastaAtual(porId.get(pastaAtual)?.pai_id ?? null)}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-sm font-medium text-foreground hover:bg-muted">
              <ChevronLeft className="h-4 w-4" /> Voltar
            </button>
          )}
          <button className="font-semibold text-foreground hover:underline" onClick={() => setPastaAtual(null)}>Raiz</button>
          {trilha.map((p) => (
            <span key={p.id} className="flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5" /><button className="hover:underline" onClick={() => setPastaAtual(p.id)}>{p.nome}</button></span>
          ))}
        </div>
        <div className="flex gap-2">
          {tipo === 'tag' && <button onClick={seedSelos} disabled={pend} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"><BadgeCheck className="h-4 w-4" /> Importar selos</button>}
          <button onClick={novaPasta} disabled={pend} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"><FolderPlus className="h-4 w-4" /> Nova pasta</button>
          <button onClick={() => setEditando({})} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"><FilePlus2 className="h-4 w-4" /> {tipo === 'conteudo' ? 'Novo bloco' : 'Nova tag'}</button>
        </div>
      </div>

      {/* Grid: pastas + itens */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filhasPasta.map((p) => (
          <div key={p.id} className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
            <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setPastaAtual(p.id)}>
              <Folder className="h-6 w-6 shrink-0" style={{ color: p.cor || 'var(--muted-foreground)' }} />
              <span className="truncate font-semibold">{p.nome}</span>
            </button>
            <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
              <button title="Renomear" onClick={() => renomearPasta(p)} className="rounded p-1 hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
              <button title="Excluir" onClick={() => excluirPasta(p)} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {itensPasta.map((i) => (
          <div key={i.id} className="group rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setEditando(i)}>
                <FileCode2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{i.nome}</span>
                  {tipo === 'tag' && i.slug
                    ? <code className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{`<${codigoCurto(i.slug)}>`}</code>
                    : i.descricao && <span className="block truncate text-xs text-muted-foreground">{i.descricao}</span>}
                </span>
              </button>
              <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button title="Editar" onClick={() => setEditando(i)} className="rounded p-1 hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                <button title="Excluir" onClick={() => removerItem(i)} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <Preview html={i.html} className="mt-3 flex max-h-24 flex-wrap items-center gap-1 overflow-hidden rounded-lg border bg-muted/20 p-2 text-[11px]" />
          </div>
        ))}
        {!filhasPasta.length && !itensPasta.length && (
          <div className="col-span-full rounded-2xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">Pasta vazia. Crie uma pasta ou um {tipo === 'conteudo' ? 'bloco' : 'tag'}.</div>
        )}
      </div>

      {editando && <EditorItem tipo={tipo} item={editando} pastaAtual={pastaAtual} pastas={carga.pastas} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); onMudou() }} />}
    </div>
  )
}

function EditorItem({ tipo, item, pastaAtual, pastas, onFechar, onSalvo }: { tipo: Tipo; item: Partial<BibItem>; pastaAtual: string | null; pastas: BibPasta[]; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(item.nome ?? '')
  const [descricao, setDescricao] = useState(item.descricao ?? '')
  const [html, setHtml] = useState(item.html ?? '')
  const [slug, setSlug] = useState(item.slug ?? '')
  const [pastaId, setPastaId] = useState<string | null>(item.id ? item.pasta_id ?? null : pastaAtual)
  const [pend, start] = useTransition()
  const [subindo, setSubindo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const salvar = () => start(async () => {
    if (!nome.trim()) return void toast.error('Dê um nome.')
    const r = await salvarItem(tipo, { id: item.id, nome, descricao, html, slug, pastaId })
    if (!r.ok) return void toast.error(r.error ?? 'Erro ao salvar.')
    toast.success('Salvo.'); onSalvo()
  })

  const importarImagem = async (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return void toast.error('Selecione um arquivo de imagem.')
    if (file.size > 5 * 1024 * 1024) return void toast.error('Imagem muito grande (máx. 5 MB).')
    setSubindo(true)
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file)
      })
      const r = await uploadImagemBib(dataUrl)
      if (!r.ok || !r.url) return void toast.error(r.error ?? 'Falha ao subir a imagem.')
      const tag = `<img src="${r.url}" alt="${(nome || 'imagem').replace(/"/g, '')}" />`
      setHtml((h) => (h.trim() ? `${h}\n${tag}` : tag))
      toast.success('Imagem adicionada ao HTML.')
    } catch {
      toast.error('Não foi possível ler a imagem.')
    } finally {
      setSubindo(false); if (fileRef.current) fileRef.current.value = ''
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <b className="text-base">{item.id ? 'Editar' : 'Novo'} {tipo === 'conteudo' ? 'bloco' : 'tag'}</b>
          <button onClick={onFechar} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid flex-1 gap-4 overflow-auto p-5 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm"><span className="mb-1 block font-medium">Nome</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Descrição <span className="text-muted-foreground">(opcional)</span></span>
              <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" /></label>
            {tipo === 'tag' && (
              <label className="block text-sm"><span className="mb-1 block font-medium">Código da tag <span className="text-muted-foreground">(opcional)</span></span>
                <div className="flex items-stretch rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/40">
                  <span className="grid select-none place-items-center border-r px-2 font-mono text-sm text-muted-foreground">&lt;</span>
                  <input value={slug} onChange={(e) => setSlug(e.target.value.replace(/[<>\s]/g, '').toLowerCase())} placeholder="rg" className="w-full bg-transparent px-2 py-2 font-mono text-sm outline-none" />
                  <span className="grid select-none place-items-center border-l px-2 font-mono text-sm text-muted-foreground">&gt;</span>
                </div>
                <span className="mt-1 block text-xs text-muted-foreground">No conteúdo, digite <code className="rounded bg-muted px-1 font-mono">{slug ? `<${slug}>` : '<rg>'}</code> que vira o selo automaticamente.</span></label>
            )}
            <label className="block text-sm"><span className="mb-1 flex items-center gap-1.5 font-medium"><FolderInput className="h-3.5 w-3.5" /> Pasta</span>
              <select value={pastaId ?? ''} onChange={(e) => setPastaId(e.target.value || null)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
                <option value="">Raiz</option>
                {pastas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select></label>
            <div className="block text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">HTML</span>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={subindo}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60">
                  {subindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Importar imagem
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => importarImagem(e.target.files?.[0])} />
              </div>
              <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={12} spellCheck={false} placeholder={tipo === 'tag' ? '<rg>  (ou o HTML do selo)' : '<div> … </div>'} className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
            </div>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">Prévia</span>
            <Preview html={html} className="min-h-[200px] rounded-lg border bg-background p-3 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onFechar} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button onClick={salvar} disabled={pend} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
