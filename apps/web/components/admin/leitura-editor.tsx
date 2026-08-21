'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Save, Loader2, Eye, EyeOff, Upload, ClipboardPaste, PenLine, FileText,
  Bold, Italic, Underline, Heading, List, Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { atualizarDocumento, type Documento } from '@/app/admin/leitura/actions'
import { salvarConteudoHtml, importarDocx } from '@/app/admin/leitura/upload-actions'

const CORES = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
type Modo = 'colar' | 'word' | 'editor'

export function LeituraEditor({ documento, htmlAtual, podeEditar }: { documento: Documento; htmlAtual: string; podeEditar: boolean }) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(documento.titulo)
  const [descricao, setDescricao] = useState(documento.descricao ?? '')
  const [cor, setCor] = useState(documento.cor ?? CORES[5])
  const [publicado, setPublicado] = useState(documento.publicado)
  const [desafioAtivo, setDesafioAtivo] = useState(documento.desafio_ativo)
  const [exigeFim, setExigeFim] = useState(documento.desafio_exige_fim)
  const [tempoMin, setTempoMin] = useState(documento.desafio_tempo_min ?? 0)
  const [savingMeta, startMeta] = useTransition()

  const [modo, setModo] = useState<Modo>('colar')
  const [htmlColar, setHtmlColar] = useState('')
  const [savingConteudo, setSavingConteudo] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function salvarMeta() {
    startMeta(async () => {
      const r = await atualizarDocumento(documento.id, {
        titulo, descricao: descricao || null, cor, publicado,
        desafio_ativo: desafioAtivo, desafio_exige_fim: exigeFim, desafio_tempo_min: tempoMin > 0 ? tempoMin : null,
      })
      if (r.ok) { toast.success('Documento salvo'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao salvar.')
    })
  }

  async function processarConteudo(html: string) {
    if (!html.trim()) { toast.error('Cole ou envie algum conteúdo.'); return }
    setSavingConteudo(true)
    const r = await salvarConteudoHtml(documento.id, html)
    setSavingConteudo(false)
    if (r.ok) { toast.success(`Conteúdo processado (${r.artigos ?? 0} seções detectadas)`); setHtmlColar(''); router.refresh() }
    else toast.error(r.error ?? 'Erro ao processar.')
  }

  function importarWord(file: File) {
    if (!/\.docx$/i.test(file.name)) { toast.error('Envie um arquivo .docx'); return }
    const reader = new FileReader()
    reader.onload = async () => {
      setSavingConteudo(true)
      const r = await importarDocx(documento.id, String(reader.result), file.name)
      setSavingConteudo(false)
      if (r.ok) { toast.success(`Word importado (${r.artigos ?? 0} seções detectadas)`); router.refresh() }
      else toast.error(r.error ?? 'Erro ao importar.')
    }
    reader.readAsDataURL(file)
  }

  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); editorRef.current?.focus() }

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/leitura" className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Documentos
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{titulo || 'Documento'}</h1>
        </div>
        {podeEditar && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPublicado((p) => !p)} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors', publicado ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground')}>
              {publicado ? <><Eye className="h-4 w-4" /> Publicado</> : <><EyeOff className="h-4 w-4" /> Rascunho</>}
            </button>
            <button onClick={salvarMeta} disabled={savingMeta} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {savingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Esquerda: configurações + entrada de conteúdo */}
        <div className="space-y-5">
          {/* Dados */}
          <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">Dados do documento</p>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Título</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Descrição</label>
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className="w-full resize-none rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Cor do card</label>
              <div className="flex flex-wrap gap-1.5">
                {CORES.map((cc) => (
                  <button key={cc} onClick={() => setCor(cc)} className={cn('h-7 w-7 rounded-full border-2 transition', cor === cc ? 'border-foreground' : 'border-transparent')} style={{ background: cc }} aria-label={cc} />
                ))}
              </div>
            </div>
          </div>

          {/* Desafio */}
          <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-amber-500" /> Desafio de leitura</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={desafioAtivo} onChange={(e) => setDesafioAtivo(e.target.checked)} className="h-4 w-4 rounded border" />
              Rastrear conclusão (aparece no relatório e na gamificação)
            </label>
            <label className={cn('flex items-center gap-2 text-sm', !desafioAtivo && 'opacity-40')}>
              <input type="checkbox" disabled={!desafioAtivo} checked={exigeFim} onChange={(e) => setExigeFim(e.target.checked)} className="h-4 w-4 rounded border" />
              Exigir ler até o fim (100%) para concluir
            </label>
            <div className={cn('flex items-center gap-2 text-sm', !desafioAtivo && 'opacity-40')}>
              <span>Tempo mínimo de leitura:</span>
              <input type="number" min={0} disabled={!desafioAtivo} value={tempoMin} onChange={(e) => setTempoMin(Math.max(0, Number(e.target.value) || 0))} className="w-16 rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring" />
              <span className="text-muted-foreground">min</span>
            </div>
          </div>

          {/* Conteúdo */}
          {podeEditar && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" /> Conteúdo</p>
              <div className="mb-3 flex gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
                {([['colar', 'Colar HTML', ClipboardPaste], ['word', 'Word (.docx)', Upload], ['editor', 'Editor', PenLine]] as const).map(([m, label, Icon]) => (
                  <button key={m} onClick={() => setModo(m)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors', modo === m ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>

              {modo === 'colar' && (
                <div className="space-y-2">
                  <textarea value={htmlColar} onChange={(e) => setHtmlColar(e.target.value)} rows={8} placeholder="Cole aqui o HTML do documento (ex.: lei com artigos)…" className="w-full resize-y rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring" />
                  <button onClick={() => processarConteudo(htmlColar)} disabled={savingConteudo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                    {savingConteudo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Processar e salvar
                  </button>
                </div>
              )}

              {modo === 'word' && (
                <div className="space-y-2">
                  <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarWord(f); e.target.value = '' }} />
                  <button onClick={() => fileRef.current?.click()} disabled={savingConteudo} className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50">
                    {savingConteudo ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                    Enviar arquivo .docx (Word)
                  </button>
                </div>
              )}

              {modo === 'editor' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
                    {([['bold', Bold], ['italic', Italic], ['underline', Underline]] as const).map(([cmd, Icon]) => (
                      <button key={cmd} onClick={() => exec(cmd)} className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Icon className="h-4 w-4" /></button>
                    ))}
                    <button onClick={() => exec('formatBlock', 'h2')} className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground" title="Título"><Heading className="h-4 w-4" /></button>
                    <button onClick={() => exec('insertUnorderedList')} className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground" title="Lista"><List className="h-4 w-4" /></button>
                  </div>
                  <div ref={editorRef} contentEditable suppressContentEditableWarning className="min-h-[220px] rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-ring [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-bold [&_ul]:ml-5 [&_ul]:list-disc" />
                  <button onClick={() => processarConteudo(editorRef.current?.innerHTML ?? '')} disabled={savingConteudo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                    {savingConteudo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar conteúdo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Direita: prévia do conteúdo salvo */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-sm font-semibold">Prévia</p>
              <span className="text-xs text-muted-foreground">{documento.artigos ?? 0} seções detectadas</span>
            </div>
            {htmlAtual ? (
              <div
                className="leitura-prosa max-h-[70vh] overflow-auto px-5 py-4 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1"
                dangerouslySetInnerHTML={{ __html: htmlAtual }}
              />
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">Sem conteúdo ainda. Cole o HTML, importe um Word ou use o editor.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
