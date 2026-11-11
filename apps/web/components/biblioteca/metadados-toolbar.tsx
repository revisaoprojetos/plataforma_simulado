'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Columns3, Filter, FileSpreadsheet, FileText, Download, Upload, Loader2, Check, X, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CAMPOS_META, CAMPOS_MULTI, listaMulti, normTexto, type CampoMeta, type Metadados } from '@/lib/conteudo/metadados'

// COLUNAS + FILTROS + PLANILHA (import/export) da lista da Biblioteca. Presentacional: o estado vive no
// BibliotecaClient (colunas/filtros) e a planilha fala com as rotas /api/admin/biblioteca/planilha/*.

export type ColunaLista = 'tipo' | 'status' | CampoMeta | 'atualizado_em'
export const COLUNAS_LISTA: { k: ColunaLista; rot: string }[] = [
  { k: 'tipo', rot: 'Tipo' },
  { k: 'status', rot: 'Status' },
  ...CAMPOS_META.map((c) => ({ k: c.k as ColunaLista, rot: c.rot })),
  { k: 'atualizado_em', rot: 'Data de atualização' },
]
export type ColunasLista = Record<ColunaLista, boolean>
const PADRAO: ColunasLista = {
  tipo: true, status: true, disciplina: true, assunto_especifico: false, tribunal: true,
  informativo: false, ano: true, estado_origem: false, selos: true, atualizado_em: true,
}
const LS_KEY = 'bib:colunas:v1'

/** Colunas visíveis da lista — preferência por navegador (localStorage, tolerante a falha). */
export function useColunasLista(): [ColunasLista, (c: ColunasLista) => void] {
  const [colunas, setColunas] = useState<ColunasLista>(PADRAO)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) setColunas({ ...PADRAO, ...(JSON.parse(raw) as Partial<ColunasLista>) })
    } catch { /* sem storage → padrão */ }
  }, [])
  const salvar = (c: ColunasLista) => {
    setColunas(c)
    try { localStorage.setItem(LS_KEY, JSON.stringify(c)) } catch { /* no-op */ }
  }
  return [colunas, salvar]
}

// ── Filtros ──
export type FiltrosMeta = Partial<Record<CampoMeta, string>>
const VAZIO = '__vazio__'
const FILTRAVEIS: CampoMeta[] = ['disciplina', 'assunto_especifico', 'tribunal', 'informativo', 'ano', 'estado_origem', 'selos']

function valoresDe(m: Metadados | undefined, k: CampoMeta): string[] {
  const v = m?.[k]
  if (v == null || v === '') return []
  return CAMPOS_MULTI.includes(k) ? listaMulti(v) : [String(v)]
}

export function passaFiltrosMeta(m: Metadados | undefined, f: FiltrosMeta): boolean {
  for (const k of Object.keys(f) as CampoMeta[]) {
    const alvo = f[k]
    if (!alvo) continue
    const vals = valoresDe(m, k)
    if (alvo === VAZIO) { if (vals.length) return false; continue }
    if (!vals.some((v) => normTexto(v) === normTexto(alvo))) return false
  }
  return true
}

// ── Planilha: resultado do import ──
interface ResultadoImport {
  ok: boolean; error?: string
  totalLinhas: number; atualizados: number; semAlteracao: number
  ignorados: { linha: number; titulo: string; motivo: string }[]
}

export function BarraMetadados({
  docIds, metadados, colunas, onColunas, filtros, onFiltros, pastaId, categoria, escopoRotulo, onImportado, opcoesFiltro, acaoFinal,
}: {
  /** Botão extra no fim da barra (à direita de "Importar planilha") — ex.: o "Novo" do Drive na tela de gestão. */
  acaoFinal?: React.ReactNode
  docIds: string[]
  metadados: Record<string, Metadados>
  colunas: ColunasLista
  onColunas: (c: ColunasLista) => void
  filtros: FiltrosMeta
  onFiltros: (f: FiltrosMeta) => void
  pastaId: string | null
  categoria: string
  /** Ex.: "a pasta PDFull (e subpastas)" ou "toda a biblioteca" — descreve o escopo da planilha. */
  escopoRotulo: string
  onImportado: () => void
  /** Valores distintos dos filtros calculados NO SERVIDOR (lista paginada: o cliente não enxerga todos os docs). Omitido → deriva de docIds/metadados. */
  opcoesFiltro?: Partial<Record<CampoMeta, string[]>>
}) {
  const [menuCols, setMenuCols] = useState(false)
  const [painelFiltros, setPainelFiltros] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [dlgImport, setDlgImport] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImport | null>(null)
  const colRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuCols) return
    const onDown = (e: MouseEvent) => { if (colRef.current && !colRef.current.contains(e.target as Node)) setMenuCols(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuCols(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menuCols])

  // Valores distintos por campo (só dos docs desta pasta) → opções dos filtros.
  const opcoesLocais = useMemo(() => {
    const out: Partial<Record<CampoMeta, string[]>> = {}
    for (const k of FILTRAVEIS) {
      const set = new Map<string, string>()
      for (const id of docIds) for (const v of valoresDe(metadados[id], k)) { const n = normTexto(v); if (!set.has(n)) set.set(n, v) }
      if (set.size) out[k] = [...set.values()].sort((a, b) => (k === 'ano' ? Number(b) - Number(a) : a.localeCompare(b, 'pt-BR')))
    }
    return out
  }, [docIds, metadados])
  const opcoes = opcoesFiltro ?? opcoesLocais
  const nFiltros = Object.values(filtros).filter(Boolean).length
  const temOpcoes = Object.keys(opcoes).length > 0

  /** Pré-gera o PDF fiel (cores/fontes) dos docs do escopo; repete sozinho até zerar `restantes`. */
  async function preGerarPdfs() {
    setGerandoPdf(true)
    try {
      let falhas = 0
      for (let volta = 0; volta < 20; volta++) {
        const r = await fetch('/api/admin/biblioteca/pre-gerar-pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ categoria, pasta: pastaId }) })
        const j = await r.json().catch(() => null)
        if (!j?.ok) { toast.error(j?.error || 'Falha ao preparar os PDFs.'); return }
        falhas = j.falhas
        if (!j.restantes) { j.falhas ? toast.warning(`PDFs prontos, mas ${j.falhas} documento(s) falharam: ${(j.falhou || []).slice(0, 3).join('; ')}`) : toast.success(`PDFs prontos (${j.total} documento(s)).`); return }
      }
      toast.info(falhas ? 'Ainda há documentos pendentes — clique novamente.' : 'Ainda há documentos pendentes — clique novamente para continuar.')
    } catch { toast.error('Falha de rede ao preparar os PDFs.') } finally { setGerandoPdf(false) }
  }

  async function exportar() {
    setExportando(true)
    try {
      const qs = new URLSearchParams({ categoria }); if (pastaId) qs.set('pasta', pastaId)
      const r = await fetch(`/api/admin/biblioteca/planilha/exportar?${qs}`)
      if (!r.ok) { const j = await r.json().catch(() => null); toast.error(j?.error || 'Falha ao exportar.'); return }
      const blob = await r.blob()
      const nome = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1] || 'conteudos.xlsx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success('Planilha exportada.')
    } catch { toast.error('Falha ao exportar.') } finally { setExportando(false) }
  }

  async function importar(file: File) {
    setImportando(true); setResultado(null)
    try {
      const fd = new FormData()
      fd.set('arquivo', file); fd.set('categoria', categoria); if (pastaId) fd.set('pasta', pastaId)
      const r = await fetch('/api/admin/biblioteca/planilha/importar', { method: 'POST', body: fd })
      const j = (await r.json().catch(() => null)) as ResultadoImport | null
      setResultado(j ?? { ok: false, error: 'Resposta inválida do servidor.', totalLinhas: 0, atualizados: 0, semAlteracao: 0, ignorados: [] })
      if (j?.ok && j.atualizados > 0) onImportado()
    } catch {
      setResultado({ ok: false, error: 'Falha de rede ao enviar a planilha.', totalLinhas: 0, atualizados: 0, semAlteracao: 0, ignorados: [] })
    } finally { setImportando(false) }
  }

  const btn = 'inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Colunas */}
        <div ref={colRef} className="relative">
          <button type="button" className={btn} onClick={() => setMenuCols((v) => !v)} aria-haspopup="true" aria-expanded={menuCols}>
            <Columns3 className="h-4 w-4" /> Colunas
          </button>
          {menuCols && (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-xl border bg-popover p-1.5 shadow-lg" role="menu">
              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Colunas da lista</p>
              {COLUNAS_LISTA.map((c) => (
                <button
                  key={c.k} type="button" role="menuitemcheckbox" aria-checked={colunas[c.k]}
                  onClick={() => onColunas({ ...colunas, [c.k]: !colunas[c.k] })}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${colunas[c.k] ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                    {colunas[c.k] && <Check className="h-3 w-3" />}
                  </span>
                  {c.rot}
                </button>
              ))}
              <p className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">As colunas aparecem na visualização em lista.</p>
            </div>
          )}
        </div>

        {/* Filtros */}
        <button type="button" className={btn} onClick={() => setPainelFiltros((v) => !v)} aria-expanded={painelFiltros}>
          <Filter className="h-4 w-4" /> Filtros
          {nFiltros > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{nFiltros}</span>}
        </button>
        {nFiltros > 0 && (
          <button type="button" onClick={() => onFiltros({})} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </button>
        )}

        {/* Planilha */}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={btn} onClick={exportar} disabled={exportando} title={`Exporta os conteúdos de ${escopoRotulo} em Excel`}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar planilha
          </button>
          <button type="button" className={btn} onClick={preGerarPdfs} disabled={gerandoPdf} title={`Prepara o PDF com a formatação original (cores e fontes) de ${escopoRotulo}, para abrir rápido para o aluno`}>
            {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Preparar PDFs
          </button>
          <button type="button" className={btn} onClick={() => { setResultado(null); setDlgImport(true) }} title={`Atualiza metadados de ${escopoRotulo} a partir de uma planilha`}>
            <Upload className="h-4 w-4" /> Importar planilha
          </button>
          {acaoFinal}
        </div>
      </div>

      {painelFiltros && (
        <div className="rounded-xl border bg-card p-3">
          {temOpcoes ? (
            <div className="flex flex-wrap gap-3">
              {FILTRAVEIS.filter((k) => opcoes[k]).map((k) => (
                <label key={k} className="flex min-w-[11rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
                  {CAMPOS_META.find((c) => c.k === k)?.rot}
                  <select
                    value={filtros[k] ?? ''}
                    onChange={(e) => onFiltros({ ...filtros, [k]: e.target.value || undefined })}
                    className="h-9 rounded-lg border bg-background px-2 text-sm font-normal text-foreground"
                  >
                    <option value="">Todos</option>
                    {opcoes[k]!.map((v) => <option key={v} value={v}>{v}</option>)}
                    <option value={VAZIO}>(sem valor)</option>
                  </select>
                </label>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              Nenhum metadado preenchido nesta pasta ainda. Exporte a planilha, preencha as colunas em dourado e importe de volta.
            </p>
          )}
        </div>
      )}

      {/* Importar planilha */}
      <Dialog open={dlgImport} onOpenChange={(o) => { if (!importando) setDlgImport(o) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar planilha</DialogTitle>
            <DialogDescription>Atualiza os metadados de {escopoRotulo} a partir de uma planilha exportada pela Biblioteca.</DialogDescription>
          </DialogHeader>

          {!resultado && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 font-semibold"><TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Antes de importar</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li><strong className="text-foreground">Não altere o Título nem o Tipo</strong> dos conteúdos: a linha só é aplicada se o nome (e o tipo) forem iguais aos do sistema — senão é ignorada.</li>
                  <li>Só as colunas em <strong className="text-foreground">dourado</strong> são atualizadas (Disciplina, Assunto específico, Tribunais, Informativo, Ano, Estado de origem, Selos).</li>
                  <li>Célula vazia mantém o valor atual; escreva <code className="rounded bg-muted px-1">-</code> para apagar um valor.</li>
                </ul>
              </div>
              <input
                ref={fileRef} type="file" accept=".xlsx" hidden
                onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) importar(f) }}
              />
              <button
                type="button" onClick={() => fileRef.current?.click()} disabled={importando}
                className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:opacity-60"
              >
                {importando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                <span className="text-sm font-medium">{importando ? 'Importando…' : 'Selecionar planilha (.xlsx)'}</span>
              </button>
            </div>
          )}

          {resultado && (
            <div className="space-y-3 text-sm">
              {resultado.error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive">{resultado.error}</div>
              ) : null}
              {(resultado.ok || resultado.totalLinhas > 0) && (
                <div className="grid grid-cols-3 gap-2">
                  {[['Atualizados', resultado.atualizados, 'text-emerald-600 dark:text-emerald-400'], ['Sem alteração', resultado.semAlteracao, 'text-muted-foreground'], ['Ignorados', resultado.ignorados.length, resultado.ignorados.length ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground']].map(([rot, n, cls]) => (
                    <div key={String(rot)} className="rounded-xl border bg-card p-3 text-center">
                      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{n as number}</div>
                      <div className="text-xs text-muted-foreground">{rot as string}</div>
                    </div>
                  ))}
                </div>
              )}
              {resultado.ignorados.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linhas ignoradas</p>
                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border bg-muted/30 p-2">
                    {resultado.ignorados.slice(0, 100).map((l, i) => (
                      <li key={i} className="rounded-lg bg-card px-2.5 py-1.5 text-xs">
                        <span className="font-semibold">Linha {l.linha}</span> · <span className="text-muted-foreground">{l.titulo}</span>
                        <div className="text-amber-700 dark:text-amber-400">{l.motivo}</div>
                      </li>
                    ))}
                    {resultado.ignorados.length > 100 && <li className="px-2 py-1 text-xs text-muted-foreground">… e mais {resultado.ignorados.length - 100}.</li>}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className={btn} onClick={() => setResultado(null)}>Importar outra</button>
                <button type="button" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90" onClick={() => setDlgImport(false)}>Concluir</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
