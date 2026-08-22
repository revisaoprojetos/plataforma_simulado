'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Save, Loader2, Eye, EyeOff, Upload, ClipboardPaste, PenLine, FileText,
  Bold, Italic, Underline, Heading, List, Trophy, Highlighter, Scale, Send, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { atualizarDocumento, publicarVersao, type Documento, type Materia, type SituacaoEditorial } from '@/app/admin/leitura/actions'
import { salvarConteudoHtml, importarDocx } from '@/app/admin/leitura/upload-actions'
import { LeituraAutorAnotacoes } from '@/components/admin/leitura-autor-anotacoes'
import { LeituraQuestoesAdmin } from '@/components/admin/leitura-questoes-admin'

const CORES = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
type Modo = 'colar' | 'word' | 'editor'
const TIPOS_NORMA = ['Constituição', 'Lei', 'Lei Complementar', 'Decreto', 'Decreto-Lei', 'Medida Provisória', 'Súmula', 'Resolução', 'Portaria', 'Emenda Constitucional']
const SITUACOES: { v: SituacaoEditorial; label: string }[] = [
  { v: 'em_preparacao', label: 'Em preparação' }, { v: 'rascunho', label: 'Rascunho' }, { v: 'em_revisao', label: 'Em revisão' },
  { v: 'publicada', label: 'Publicada' }, { v: 'arquivada', label: 'Arquivada' }, { v: 'revogada', label: 'Revogada' },
]

export function LeituraEditor({ documento, htmlAtual, podeEditar, materias = [], podePublicar = false, publicadaVersao = 1, temRascunhoPendente = false, versaoEdicao }: {
  documento: Documento; htmlAtual: string; podeEditar: boolean; materias?: Materia[]; podePublicar?: boolean; publicadaVersao?: number; temRascunhoPendente?: boolean; versaoEdicao?: number
}) {
  const versaoAutoria = versaoEdicao ?? documento.versao
  const router = useRouter()
  const [pubOpen, setPubOpen] = useState(false)
  const [pubTipo, setPubTipo] = useState('alteracao')
  const [pubDesc, setPubDesc] = useState('')
  const [publicando, setPublicando] = useState(false)
  const [titulo, setTitulo] = useState(documento.titulo)
  const [descricao, setDescricao] = useState(documento.descricao ?? '')
  const [cor, setCor] = useState(documento.cor ?? CORES[5])
  const [publicado, setPublicado] = useState(documento.publicado)
  const [desafioAtivo, setDesafioAtivo] = useState(documento.desafio_ativo)
  const [exigeFim, setExigeFim] = useState(documento.desafio_exige_fim)
  const [tempoMin, setTempoMin] = useState(documento.desafio_tempo_min ?? 0)
  // Metadados de lei (A1)
  const [materiaId, setMateriaId] = useState(documento.materia_id ?? '')
  const [tipoNorma, setTipoNorma] = useState(documento.tipo_norma ?? '')
  const [numero, setNumero] = useState(documento.numero ?? '')
  const [ano, setAno] = useState(documento.ano ?? ('' as number | ''))
  const [tituloOficial, setTituloOficial] = useState(documento.titulo_oficial ?? '')
  const [ementa, setEmenta] = useState(documento.ementa ?? '')
  const [esfera, setEsfera] = useState(documento.esfera ?? '')
  const [fonteOficial, setFonteOficial] = useState(documento.fonte_oficial ?? '')
  const [situacao, setSituacao] = useState<SituacaoEditorial>(documento.situacao_editorial ?? 'em_preparacao')
  const [savingMeta, startMeta] = useTransition()

  const [modo, setModo] = useState<Modo>('colar')
  const [htmlColar, setHtmlColar] = useState('')
  const [savingConteudo, setSavingConteudo] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const htmlFileRef = useRef<HTMLInputElement>(null)

  // Lê um arquivo .html/.htm como texto e processa (mesmo caminho do colar).
  function enviarArquivoHtml(file: File) {
    if (!/\.(html?|txt)$/i.test(file.name) && file.type !== 'text/html') { toast.error('Envie um arquivo .html'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Arquivo muito grande (máx. 5 MB).'); return }
    const reader = new FileReader()
    reader.onload = () => { const txt = String(reader.result ?? ''); setHtmlColar(txt); processarConteudo(txt) }
    reader.readAsText(file)
  }

  function salvarMeta() {
    startMeta(async () => {
      const r = await atualizarDocumento(documento.id, {
        titulo, descricao: descricao || null, cor, publicado,
        desafio_ativo: desafioAtivo, desafio_exige_fim: exigeFim, desafio_tempo_min: tempoMin > 0 ? tempoMin : null,
        materia_id: materiaId || null, tipo_norma: tipoNorma || null, numero: numero || null, ano: ano === '' ? null : Number(ano),
        titulo_oficial: tituloOficial || null, ementa: ementa || null, esfera: esfera || null, fonte_oficial: fonteOficial || null,
        situacao_editorial: situacao,
      })
      if (r.ok) { toast.success('Documento salvo'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao salvar.')
    })
  }

  function publicar() {
    setPublicando(true)
    ;(async () => {
      const r = await publicarVersao(documento.id, { tipo: pubTipo, descricao: pubDesc || undefined })
      setPublicando(false)
      if (r.ok) { toast.success(`Versão ${r.versao} publicada`); setPubOpen(false); setPubDesc(''); router.refresh() }
      else toast.error(r.error ?? 'Erro ao publicar.')
    })()
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

  // Ao abrir a aba "Editor", carrega o conteúdo salvo (permite editar em vez de recomeçar do zero).
  useEffect(() => {
    if (modo === 'editor' && editorRef.current && !editorRef.current.innerHTML.trim() && htmlAtual) {
      editorRef.current.innerHTML = htmlAtual
    }
  }, [modo, htmlAtual])

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/leitura" className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Documentos
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{titulo || 'Documento'}</h1>
          {temRascunhoPendente
            ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">Rascunho não publicado</span>
            : <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Publicada v{publicadaVersao}</span>}
        </div>
        {podeEditar && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPublicado((p) => !p)} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors', publicado ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground')}>
              {publicado ? <><Eye className="h-4 w-4" /> Visível</> : <><EyeOff className="h-4 w-4" /> Oculto</>}
            </button>
            <button onClick={salvarMeta} disabled={savingMeta} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-muted disabled:opacity-50">
              {savingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </button>
            {podePublicar && temRascunhoPendente && (
              <button onClick={() => setPubOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
                <Send className="h-4 w-4" /> Publicar versão
              </button>
            )}
          </div>
        )}
      </div>

      {/* Publicar versão — relatório de atualização */}
      {pubOpen && podePublicar && (
        <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/[0.03] p-4">
          <p className="text-sm font-semibold">Publicar nova versão</p>
          <p className="text-xs text-muted-foreground">Cria uma versão imutável e passa a ser a que os alunos leem. Anotações/progresso são reancorados.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={pubTipo} onChange={(e) => setPubTipo(e.target.value)} className="h-9 rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
              <option value="nova_lei">Inclusão (nova lei)</option>
              <option value="alteracao">Alteração</option>
              <option value="revogacao">Revogação</option>
              <option value="correcao_editorial">Correção editorial</option>
            </select>
            <input value={pubDesc} onChange={(e) => setPubDesc(e.target.value)} placeholder="Resumo da atualização (aparece no relatório)…" className="min-w-52 flex-1 rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
            <button onClick={publicar} disabled={publicando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publicar
            </button>
            <button onClick={() => setPubOpen(false)} className="rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Cancelar</button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Esquerda: entrada de conteúdo (ação principal) + configurações */}
        <div className="space-y-5">
          {/* Conteúdo — ação principal, no topo */}
          {podeEditar && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" /> Conteúdo da lei</p>
              <p className="mb-3 text-xs text-muted-foreground">Envie um arquivo <span className="font-medium text-foreground">.html</span> ou <span className="font-medium text-foreground">.docx</span>, cole o HTML, ou escreva no editor. O texto é processado e aparece na prévia ao lado.</p>
              <div className="mb-3 flex gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
                {([['colar', 'HTML', ClipboardPaste], ['word', 'Word', Upload], ['editor', 'Editor', PenLine]] as const).map(([m, label, Icon]) => (
                  <button key={m} onClick={() => setModo(m)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors', modo === m ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>

              {modo === 'colar' && (
                <div className="space-y-2">
                  {/* Enviar arquivo .html (clique ou arraste) */}
                  <input ref={htmlFileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivoHtml(f); e.target.value = '' }} />
                  <div
                    onClick={() => !savingConteudo && htmlFileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) enviarArquivoHtml(f) }}
                    className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-muted/30 hover:text-foreground"
                  >
                    {savingConteudo ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                    <span>Enviar arquivo <span className="font-medium text-foreground">.html</span> — clique ou arraste aqui</span>
                  </div>
                  <p className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">ou cole o HTML abaixo</p>
                  <textarea value={htmlColar} onChange={(e) => setHtmlColar(e.target.value)} rows={7} placeholder="Cole aqui o HTML da lei (com artigos, §, incisos…)" className="w-full resize-y rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring" />
                  <button onClick={() => processarConteudo(htmlColar)} disabled={savingConteudo || !htmlColar.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
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

          {/* Dados do card */}
          <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">Dados do card</p>
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

          {/* Metadados da lei (A1) — recolhível */}
          <details className="group rounded-2xl border bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <Scale className="h-4 w-4 text-primary" /> Metadados da lei
              <span className="text-xs font-normal text-muted-foreground">(matéria, tipo, número…)</span>
              <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t px-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 text-xs text-muted-foreground">Matéria
                  <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)} className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
                    <option value="">— sem matéria —</option>
                    {materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">Tipo
                  <select value={tipoNorma} onChange={(e) => setTipoNorma(e.target.value)} className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
                    <option value="">—</option>
                    {TIPOS_NORMA.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">Número
                    <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="9.868" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  </label>
                  <label className="text-xs text-muted-foreground">Ano
                    <input type="number" value={ano} onChange={(e) => setAno(e.target.value === '' ? '' : Number(e.target.value))} placeholder="1999" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  </label>
                </div>
              </div>
              <label className="block text-xs text-muted-foreground">Título oficial
                <input value={tituloOficial} onChange={(e) => setTituloOficial(e.target.value)} placeholder="Dispõe sobre o processo e julgamento da ADI e ADC…" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </label>
              <label className="block text-xs text-muted-foreground">Ementa
                <textarea value={ementa} onChange={(e) => setEmenta(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Esfera / origem
                  <input value={esfera} onChange={(e) => setEsfera(e.target.value)} placeholder="Federal" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                </label>
                <label className="text-xs text-muted-foreground">Situação editorial
                  <select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoEditorial)} className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
                    {SITUACOES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">Fonte oficial (URL)
                <input value={fonteOficial} onChange={(e) => setFonteOficial(e.target.value)} placeholder="https://planalto.gov.br/…" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </label>
            </div>
          </details>

          {/* Desafio — recolhível */}
          <details className="group rounded-2xl border bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <Trophy className="h-4 w-4 text-amber-500" /> Desafio de leitura
              {desafioAtivo && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">ativo</span>}
              <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t px-4 py-4">
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
          </details>
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

      {/* Anotações base (pré-definidas) — modo autor */}
      {podeEditar && htmlAtual && (
        <div className="space-y-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Highlighter className="h-4 w-4 text-primary" /> Grifos editoriais</h2>
            <p className="text-xs text-muted-foreground">Marque trechos por tipo (núcleo, prazo, exceção, comentário, STF/STJ/TST…). Aparecem coloridos para todos os alunos, com o "modo sem grifos".</p>
          </div>
          <LeituraAutorAnotacoes documentoId={documento.id} versao={versaoAutoria} html={htmlAtual} />
        </div>
      )}

      {/* Questões no meio da leitura (Fase 2) */}
      {podeEditar && htmlAtual && (
        <LeituraQuestoesAdmin documentoId={documento.id} versao={versaoAutoria} html={htmlAtual} />
      )}
    </div>
  )
}
