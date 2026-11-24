'use client'

/**
 * "Substituir arquivos" em lote (Biblioteca › barra de seleção).
 * Cada documento selecionado recebe uma NOVA VERSÃO (mesma action do "Trocar arquivo" individual:
 * `publicarNovaVersao` → versão + reconciliação de grifos + versão atual). Os arquivos arrastados são
 * casados automaticamente com os documentos (por nome ou por ordem) e o admin pode ajustar par a par
 * (modo avançado: arquivo individual por documento, remover, reatribuir, publicar ou deixar como rascunho).
 */

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, FileText, Loader2, RotateCcw, UploadCloud, Wand2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { publicarNovaVersao } from '@/app/admin/biblioteca/actions'

export interface DocSubst { id: string; titulo: string; versao: number | null }
type Estado = 'pendente' | 'enviando' | 'ok' | 'erro'
type Modo = 'nome' | 'ordem'

const TAM_MAX = 100 * 1024 * 1024

function lerDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    r.readAsDataURL(f)
  })
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const tokens = (s: string) => new Set(semAcento(s.replace(/\.[a-z0-9]{2,5}$/i, '')).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1))
const natural = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
const fmtMb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function pontuar(titulo: string, arquivo: string): number {
  const a = tokens(titulo), b = tokens(arquivo)
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const jacc = inter / (a.size + b.size - inter)
  const cont = inter / Math.min(a.size, b.size)
  return Math.max(jacc, cont * 0.9)
}

/** Casa arquivos com documentos. `nome`: melhor pontuação (≥ 0,5), 1↔1; `ordem`: ordem natural de ambos. */
function casar(docs: DocSubst[], arquivos: File[], modo: Modo): { pares: Record<string, File | null>; sobras: File[] } {
  const pares: Record<string, File | null> = Object.fromEntries(docs.map((d) => [d.id, null]))
  if (modo === 'ordem') {
    const ds = [...docs].sort((x, y) => natural(x.titulo, y.titulo))
    const fs = [...arquivos].sort((x, y) => natural(x.name, y.name))
    ds.forEach((d, i) => { pares[d.id] = fs[i] ?? null })
    return { pares, sobras: fs.slice(ds.length) }
  }
  const cand: { d: string; f: number; s: number }[] = []
  docs.forEach((d) => arquivos.forEach((f, i) => { const s = pontuar(d.titulo, f.name); if (s >= 0.5) cand.push({ d: d.id, f: i, s }) }))
  cand.sort((x, y) => y.s - x.s)
  const usadosD = new Set<string>(), usadosF = new Set<number>()
  for (const c of cand) {
    if (usadosD.has(c.d) || usadosF.has(c.f)) continue
    pares[c.d] = arquivos[c.f]; usadosD.add(c.d); usadosF.add(c.f)
  }
  return { pares, sobras: arquivos.filter((_, i) => !usadosF.has(i)) }
}

export function SubstituirLoteDialog({ docs, onFechar, onConcluido }: {
  docs: DocSubst[]
  onFechar: () => void
  /** ids que falharam (para manter selecionados) */
  onConcluido: (falhos: string[]) => void
}) {
  const [pares, setPares] = useState<Record<string, File | null>>(() => Object.fromEntries(docs.map((d) => [d.id, null])))
  const [sobras, setSobras] = useState<File[]>([])
  const [estado, setEstado] = useState<Record<string, { e: Estado; msg?: string }>>({})
  const [modo, setModo] = useState<Modo>('nome')
  const [publicar, setPublicar] = useState(true)
  const [avancado, setAvancado] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [rodando, setRodando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Todos os arquivos já soltos (para re-casar ao trocar o modo).
  const pool = useRef<File[]>([])

  const comArquivo = useMemo(() => docs.filter((d) => pares[d.id]), [docs, pares])
  const feitos = Object.values(estado).filter((s) => s.e === 'ok').length
  const falhas = Object.values(estado).filter((s) => s.e === 'erro').length

  function adicionar(lista: File[]) {
    const ok = lista.filter((f) => f.size > 0 && f.size <= TAM_MAX)
    if (ok.length < lista.length) toast.error('Arquivos vazios ou acima de 100 MB foram ignorados.')
    if (!ok.length) return
    // junta ao que já está atribuído/sobrando e re-casa só o que ainda está livre
    const livres = docs.filter((d) => !pares[d.id])
    const r = casar(livres, [...sobras, ...ok], modo)
    setPares((p) => ({ ...p, ...r.pares }))
    setSobras(r.sobras)
    pool.current = [...pool.current, ...ok]
  }

  function recasar(m: Modo) {
    setModo(m)
    const r = casar(docs, pool.current.length ? pool.current : [...Object.values(pares).filter(Boolean) as File[], ...sobras], m)
    setPares(r.pares); setSobras(r.sobras); setEstado({})
  }

  function atribuir(docId: string, f: File | null) {
    setPares((p) => {
      const n = { ...p }
      const anterior = n[docId]
      if (anterior) setSobras((s) => (s.includes(anterior) ? s : [...s, anterior]))
      n[docId] = f
      return n
    })
    if (f) setSobras((s) => s.filter((x) => x !== f))
    setEstado((s) => { const n = { ...s }; delete n[docId]; return n })
  }

  async function executar() {
    const alvo = comArquivo.filter((d) => estado[d.id]?.e !== 'ok')
    if (!alvo.length || rodando) return
    setRodando(true)
    const fila = [...alvo]
    const marca = (id: string, e: Estado, msg?: string) => setEstado((s) => ({ ...s, [id]: { e, msg } }))
    // 2 em paralelo: cada item carrega o arquivo inteiro em base64.
    await Promise.all(Array.from({ length: Math.min(2, fila.length) }, async () => {
      while (fila.length) {
        const d = fila.shift()!
        const f = pares[d.id]!
        marca(d.id, 'enviando')
        try {
          const dataBase64 = await lerDataUrl(f)
          const r = await publicarNovaVersao({ documentoId: d.id, nomeArquivo: f.name, mime: f.type, dataBase64, publicar })
          if (r.ok) marca(d.id, 'ok')
          else marca(d.id, 'erro', r.precisaConfirmarTeste ? `${r.error} (publique este documento individualmente para confirmar)` : r.error || 'Falha ao substituir.')
        } catch (e: any) { marca(d.id, 'erro', e?.message || 'Falha ao substituir.') }
      }
    }))
    setRodando(false)
  }

  function fechar() {
    if (rodando) return
    const falhos = docs.filter((d) => estado[d.id]?.e === 'erro' || !(estado[d.id]?.e === 'ok')).map((d) => d.id)
    if (feitos > 0) { toast.success(`${feitos} ${feitos === 1 ? 'documento substituído' : 'documentos substituídos'}${falhas ? `, ${falhas} com erro` : ''}.`); onConcluido(falhos) }
    onFechar()
  }

  const semPar = docs.length - comArquivo.length

  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar() }}>
      <DialogContent showCloseButton className="flex h-[min(88vh,760px)] max-h-[88vh] w-[min(1000px,calc(100vw-2rem))] max-w-[min(1000px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1000px,calc(100vw-2rem))]">
        <div className="border-b px-5 pt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Biblioteca › {docs.length} {docs.length === 1 ? 'documento selecionado' : 'documentos selecionados'}</p>
          <DialogTitle className="mt-1 mb-4">Substituir arquivos</DialogTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Dropzone em massa */}
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar([...e.dataTransfer.files]) }}
            onClick={() => fileRef.current?.click()}
            className={cn('flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-6 py-7 text-center transition-colors', arrastando ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:border-primary/50')}
          >
            <UploadCloud className="h-6 w-6 text-primary" aria-hidden />
            <div className="text-sm font-medium">Arraste os novos arquivos aqui ou clique para importar</div>
            <div className="text-xs text-muted-foreground">Vários de uma vez · até 100 MB cada · casamos cada arquivo com o documento de nome parecido</div>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files ?? [])]; e.currentTarget.value = ''; adicionar(l) }} />
          </div>

          {/* Opções */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <span className="text-muted-foreground">Casar por</span>
              <select value={modo} onChange={(e) => recasar(e.target.value as Modo)} disabled={rodando} className="h-8 rounded-lg border bg-background px-2 text-sm">
                <option value="nome">Nome parecido</option>
                <option value="ordem">Ordem alfabética (1º com 1º…)</option>
              </select>
            </label>
            <button type="button" onClick={() => setAvancado((v) => !v)} className="text-xs font-medium text-primary hover:underline">{avancado ? 'Ocultar avançado' : 'Avançado'}</button>
            {semPar > 0 && comArquivo.length > 0 && <span className="text-xs text-amber-600 dark:text-amber-400">{semPar} sem arquivo — serão mantidos como estão</span>}
          </div>
          {avancado && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-3 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={publicar} onChange={(e) => setPublicar(e.target.checked)} disabled={rodando} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                <span><b>Publicar a nova versão agora</b><br /><span className="text-xs text-muted-foreground">Desmarcado: cria a versão como rascunho (o aluno continua vendo a atual) e você publica depois. Os grifos dos alunos são reconciliados em ambos os casos; a versão anterior fica no histórico.</span></span>
              </label>
              <p className="text-xs text-muted-foreground">Em cada linha, use <b>Escolher</b> (ou solte um arquivo sobre ela) para substituir aquele documento diretamente por outro arquivo, independente do casamento automático.</p>
            </div>
          )}

          {/* Pares */}
          <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Documento atual</span><span>Novo arquivo</span><span className="w-24 text-right">Situação</span>
            </div>
            <div className="divide-y">
              {docs.map((d) => <LinhaPar key={d.id} doc={d} arquivo={pares[d.id] ?? null} sobras={sobras} est={estado[d.id]} travado={rodando}
                onArquivo={(f) => atribuir(d.id, f)} onSobra={(f) => atribuir(d.id, f)} />)}
            </div>
          </div>

          {sobras.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <div className="mb-1.5 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />{sobras.length} {sobras.length === 1 ? 'arquivo sem documento' : 'arquivos sem documento'}</div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {sobras.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <button type="button" onClick={() => setSobras((s) => s.filter((x) => x !== f))} className="rounded p-0.5 hover:bg-muted" aria-label="Descartar"><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">Atribua-os a um documento no seletor “Escolher” da linha correspondente, ou descarte.</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-5 py-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {rodando ? `Substituindo… ${feitos}/${comArquivo.length}` : comArquivo.length ? `${comArquivo.length} de ${docs.length} prontos${feitos ? ` · ${feitos} concluídos` : ''}${falhas ? ` · ${falhas} com erro` : ''}` : 'Importe os arquivos para começar'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fechar} disabled={rodando}>{feitos ? 'Fechar' : 'Cancelar'}</Button>
            <Button size="sm" onClick={() => void executar()} disabled={rodando || comArquivo.length === 0 || comArquivo.every((d) => estado[d.id]?.e === 'ok')}>
              {rodando ? <Loader2 className="animate-spin" /> : falhas ? <RotateCcw /> : <Wand2 />}
              {falhas && !rodando ? 'Tentar de novo' : `Substituir ${comArquivo.filter((d) => estado[d.id]?.e !== 'ok').length}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LinhaPar({ doc, arquivo, sobras, est, travado, onArquivo, onSobra }: {
  doc: DocSubst; arquivo: File | null; sobras: File[]; est?: { e: Estado; msg?: string }; travado: boolean
  onArquivo: (f: File | null) => void; onSobra: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [sobre, setSobre] = useState(false)
  const fixo = est?.e === 'ok' || est?.e === 'enviando'
  return (
    <div
      onDragOver={(e) => { if (!fixo && !travado) { e.preventDefault(); setSobre(true) } }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => { setSobre(false); if (fixo || travado) return; e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f && f.size > 0 && f.size <= TAM_MAX) onArquivo(f) }}
      className={cn('grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm', sobre && 'bg-primary/5')}
    >
      <div className="min-w-0">
        <div className="truncate font-medium" title={doc.titulo}>{doc.titulo}</div>
        {doc.versao != null && <div className="text-xs text-muted-foreground">v{doc.versao}{est?.e === 'ok' ? ` → v${doc.versao + 1}` : ''}</div>}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {arquivo ? (
          <>
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1"><div className="truncate" title={arquivo.name}>{arquivo.name}</div><div className="text-xs text-muted-foreground">{fmtMb(arquivo.size)}</div></div>
            {!fixo && !travado && <button type="button" onClick={() => onArquivo(null)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Remover arquivo"><X className="h-3.5 w-3.5" /></button>}
          </>
        ) : <span className="text-xs text-muted-foreground">— sem arquivo (mantém o atual)</span>}
        {!fixo && !travado && (
          <>
            <button type="button" onClick={() => ref.current?.click()} className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted">{arquivo ? 'Trocar' : 'Escolher'}</button>
            <input ref={ref} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) onArquivo(f) }} />
            {sobras.length > 0 && !arquivo && (
              <select aria-label="Usar arquivo importado" value="" onChange={(e) => { const f = sobras[Number(e.target.value)]; if (f) onSobra(f) }} className="h-7 max-w-[7rem] shrink-0 rounded-md border bg-background px-1 text-xs">
                <option value="">Usar…</option>
                {sobras.map((f, i) => <option key={`${f.name}-${i}`} value={i}>{f.name}</option>)}
              </select>
            )}
          </>
        )}
      </div>
      <div className="w-24 text-right text-xs">
        {est?.e === 'enviando' && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Enviando</span>}
        {est?.e === 'ok' && <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Substituído</span>}
        {est?.e === 'erro' && <span className="font-medium text-destructive" title={est.msg}>Erro<span className="block max-w-[6rem] truncate font-normal" title={est.msg}>{est.msg}</span></span>}
        {!est && <span className="text-muted-foreground">{arquivo ? 'Pronto' : '—'}</span>}
      </div>
    </div>
  )
}
