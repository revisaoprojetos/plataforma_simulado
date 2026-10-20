'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, Loader2, SlidersHorizontal, RotateCcw, FolderOpen, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { obterDisciplinasDoSimulado, aplicarPreviaSimulado, resetarPrevia } from './previa-actions'
import { SimuladoPickerDialog } from './simulado-picker-dialog'

declare global { interface Window { DocsAPI?: any } }

type Disc = { nome: string; total: number; assuntos: string; acertos: number }

export function PreviaLab({ id, onlyofficeUrl, wopiHost, docVersao }: { id: string; onlyofficeUrl: string; wopiHost: string; docVersao: string }) {
  const [simId, setSimId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [pickerAberto, setPickerAberto] = useState(false)
  const [discs, setDiscs] = useState<Disc[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  // Chave começa na VERSÃO DO .docx (mtime) → o OnlyOffice re-busca o template atual quando ele é editado
  // (com chave estática 'base' ele servia o render antigo do cache). Cada aplicação troca pra outra versão.
  const [version, setVersion] = useState(docVersao)
  const [recarregando, setRecarregando] = useState(false)
  const [recolhida, setRecolhida] = useState(false)

  const editorRef = useRef<any>(null)
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const questoesRef = useRef<{ disciplina: string; assunto: string; pilar: string; ordem: number }[]>([])

  // (Re)cria o editor OnlyOffice em modo leitura apontando pra /preview. A chave muda por versão → o
  // Document Server rebaixa o cache e rebaixa o .docx recém-preenchido.
  const criarEditor = useCallback((ver: string) => {
    if (!window.DocsAPI) return
    try { editorRef.current?.destroyEditor?.() } catch { /* ok */ }
    const key = `${id}_pv_${ver}`.replace(/[^a-z0-9_-]/gi, '')
    editorRef.current = new window.DocsAPI.DocEditor('oo-previa', {
      documentType: 'word',
      document: { fileType: 'docx', key, title: `${id} · prévia.docx`, url: `${wopiHost}/api/teste/docs/${id}/preview`, permissions: { edit: false, download: true } },
      editorConfig: { lang: 'pt', mode: 'view', user: { id: 'admin', name: 'Admin (teste)' } },
      events: { onDocumentReady: () => setRecarregando(false) },
      width: '100%', height: '100%',
    })
  }, [id, wopiHost])

  // AGUARDA limpar qualquer prévia antiga deste doc (senão a base abre com dados de simulado de outra
  // sessão) e SÓ ENTÃO carrega o api.js e abre o editor — garante que a base mostre o template ATUAL.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      await resetarPrevia(id).catch(() => {})
      if (!vivo) return
      const src = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
      const done = () => { if (vivo) setPronto(true) }
      if (window.DocsAPI) { done(); return }
      const existente = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
      if (existente) { existente.addEventListener('load', done); if (window.DocsAPI) done(); return }
      const s = document.createElement('script')
      s.src = src; s.async = true
      s.onload = done
      s.onerror = () => { if (vivo) setErro(`Não carregou ${src}. Suba o OnlyOffice.`) }
      document.body.appendChild(s)
    })()
    return () => { vivo = false }
  }, [id, onlyofficeUrl])

  // (Re)cria o editor sempre que a versão muda (base = versão do .docx + cada aplicação dos reguladores).
  useEffect(() => { if (pronto) criarEditor(version) }, [pronto, version, criarEditor])

  // Aplica (debounced) o estado dos reguladores → grava os dados → recarrega a prévia.
  const aplicar = useCallback((t: string, ds: Disc[]) => {
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(async () => {
      setRecarregando(true)
      try {
        const r = await aplicarPreviaSimulado(id, { simuladoTitulo: t, disciplinas: ds.map((d) => ({ nome: d.nome, acertos: d.acertos, total: d.total })), questoes: questoesRef.current })
        if (r.erro) { setErro(r.erro); setRecarregando(false) }
        else setVersion(r.version)
      } catch (e) { setErro(`Falha ao aplicar: ${(e as Error).message}`); setRecarregando(false) }
    }, 450)
  }, [id])

  async function selecionar(sid: string, tituloSel: string) {
    setSimId(sid)
    if (!sid) { setDiscs([]); setTitulo(''); questoesRef.current = []; resetarPrevia(id).then(() => setVersion(docVersao)); return }
    setCarregando(true); setErro(null)
    try {
      const r = await obterDisciplinasDoSimulado(sid)
      setTitulo(tituloSel)
      if (r.erro) { setErro(r.erro); setDiscs([]); questoesRef.current = []; return }
      questoesRef.current = r.questoes || []
      const novas: Disc[] = (r.disciplinas || []).map((d) => ({ ...d, acertos: Math.round(d.total * 0.7) }))
      setDiscs(novas)
      if (!novas.length) setErro('Esse simulado não tem questões com disciplina.')
      else aplicar(tituloSel, novas)
    } catch (e) { setErro(`Falha ao carregar: ${(e as Error).message}`) }
    finally { setCarregando(false) }
  }

  function resetarAcertos() {
    if (!simId) return
    const novas = discs.map((d) => ({ ...d, acertos: Math.round(d.total * 0.7) }))
    setDiscs(novas); aplicar(titulo, novas)
  }

  function setAcerto(i: number, val: number) {
    setDiscs((prev) => {
      const n = prev.map((d, j) => (j === i ? { ...d, acertos: Math.max(0, Math.min(val, d.total)) } : d))
      aplicar(titulo, n)
      return n
    })
  }

  const totAcertos = discs.reduce((s, d) => s + Math.min(d.acertos, d.total), 0)
  const totQ = discs.reduce((s, d) => s + d.total, 0)
  const totPct = totQ ? Math.round((totAcertos / totQ) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        <Link href={`/admin/teste/onlyoffice/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar ao editor</Link>
        <span className="text-sm font-semibold">Laboratório da prévia · <span className="font-mono text-xs text-muted-foreground">{id}</span></span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <Eye className="h-3.5 w-3.5" /> Somente leitura — não altera o template
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Barra lateral — reguladores (recolhível) */}
        <aside className={`flex shrink-0 flex-col border-r bg-card transition-[width] duration-200 ${recolhida ? 'w-11' : 'w-80'}`}>
          {recolhida ? (
            <button onClick={() => setRecolhida(false)} aria-label="Mostrar reguladores" title="Mostrar reguladores" className="flex h-12 items-center justify-center border-b text-muted-foreground transition-colors hover:text-primary">
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          ) : (
          <>
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">Reguladores da prévia</span>
            <button onClick={() => setRecolhida(true)} aria-label="Recolher reguladores" title="Recolher" className="ml-auto shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto"><div className="space-y-4 p-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Simulado da plataforma</label>
              <button onClick={() => setPickerAberto(true)} className="flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary">
                <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                <span className={`min-w-0 flex-1 truncate ${titulo ? 'font-medium' : 'text-muted-foreground'}`}>{titulo || 'Selecionar simulado…'}</span>
              </button>
              {simId ? (
                <button onClick={() => selecionar('', '')} className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /> voltar ao exemplo estático</button>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted-foreground">Escolha um simulado para puxar as disciplinas reais e regular os acertos.</p>
              )}
            </div>

            {carregando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando disciplinas…</div>}
            {erro && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">{erro}</div>}

            {!!discs.length && (
              <>
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-medium">Nota geral</span>
                  <span className="font-mono"><b className="text-primary">{totAcertos}</b>/{totQ} · <b>{totPct}%</b></span>
                </div>

                <div className="space-y-3">
                  {discs.map((d, i) => (
                    <div key={d.nome} className="rounded-xl border bg-background p-3">
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold leading-tight">{d.nome}</span>
                        <span className="shrink-0 font-mono text-xs"><b className="text-primary">{Math.min(d.acertos, d.total)}</b>/{d.total} · {d.total ? Math.round((Math.min(d.acertos, d.total) / d.total) * 100) : 0}%</span>
                      </div>
                      <input type="range" min={0} max={d.total} value={Math.min(d.acertos, d.total)} onChange={(e) => setAcerto(i, Number(e.target.value))} className="w-full" style={{ accentColor: 'var(--brand-primary, #1a367c)' }} />
                      <div className="mt-1 flex items-center justify-between">
                        <button onClick={() => setAcerto(i, 0)} className="text-[11px] text-muted-foreground hover:text-foreground">0</button>
                        <button onClick={() => setAcerto(i, d.total)} className="text-[11px] text-muted-foreground hover:text-foreground">tudo</button>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={resetarAcertos} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary">
                  <RotateCcw className="h-3.5 w-3.5" /> Resetar acertos (70%)
                </button>
              </>
            )}
          </div></div>
          </>
          )}
        </aside>

        {/* Prévia OnlyOffice — o nó #oo-previa é SEMPRE o 1º filho e ESTÁVEL (o OnlyOffice domina o DOM
            dele). Overlays vêm DEPOIS e por cima (absolute) — nunca inserir nada ANTES de #oo-previa,
            senão o React tenta insertBefore num nó que o OnlyOffice já alterou → NotFoundError. */}
        <div className="relative min-h-0 flex-1">
          <div id="oo-previa" className="absolute inset-0 h-full w-full" />
          {recarregando && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando prévia…
            </div>
          )}
          {erro && !pronto && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-8">
              <div className="max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{erro}</div>
            </div>
          )}
        </div>
      </div>

      {pickerAberto && (
        <SimuladoPickerDialog
          onClose={() => setPickerAberto(false)}
          onSelect={(sid, t) => { setPickerAberto(false); selecionar(sid, t) }}
        />
      )}
    </div>
  )
}
