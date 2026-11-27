'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, Loader2, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CelulaDocumento, ColunaMatriz, DocSeletor, DocsSeletorResposta, LinhaMatriz, ParteSeletor } from '@/lib/cronograma/matriz-gerador-tipos'
import { ehTipoVideoaula } from '@/lib/cronograma/matriz-gerador-tipos'
import { gravarMatrizApi, lerMatrizApi } from './matriz-api'

const MODOS: { v: string; r: string; campo?: { k: string; r: string } }[] = [
  { v: '', r: 'Herdado (regra da área)' },
  { v: 'por_pagina', r: 'Por página', campo: { k: 'min_por_pagina', r: 'min por página' } },
  { v: 'por_palavras', r: 'Por palavras', campo: { k: 'palavras_por_min', r: 'palavras por min' } },
  { v: 'por_artigo', r: 'Por artigo', campo: { k: 'min_por_artigo', r: 'min por artigo' } },
  { v: 'por_caracteres', r: 'Por caracteres', campo: { k: 'caracteres_por_min', r: 'caracteres por min' } },
  { v: 'fixo', r: 'Tempo fixo', campo: { k: 'minutos_fixo', r: 'minutos' } },
  { v: 'manual', r: 'Manual (sem cálculo)' },
]
const SEL = 'h-9 rounded-md border bg-background px-2 text-sm'

export interface AlvoSeletor { linha: LinhaMatriz; coluna: ColunaMatriz; celula: CelulaDocumento }

/** Seletor (documento da Biblioteca → parte → rótulo/visibilidade → regras) de UMA célula da matriz. */
export function SeletorDialog({ conjuntoId, alvo, podeEditar, onClose, onFeito }: {
  conjuntoId: string; alvo: AlvoSeletor | null; podeEditar: boolean; onClose: () => void; onFeito: () => void
}) {
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-full sm:max-w-4xl">
        {alvo && <Corpo key={`${alvo.linha.chave}|${alvo.coluna.tipo}`} conjuntoId={conjuntoId} alvo={alvo} podeEditar={podeEditar} onClose={onClose} onFeito={onFeito} />}
      </DialogContent>
    </Dialog>
  )
}

function Corpo({ conjuntoId, alvo, podeEditar, onClose, onFeito }: { conjuntoId: string; alvo: AlvoSeletor; podeEditar: boolean; onClose: () => void; onFeito: () => void }) {
  const { linha, coluna, celula } = alvo
  const video = ehTipoVideoaula(coluna.tipo) // videoaula: documento de vídeo inteiro, sem parte, sem regra de tempo
  const atual = celula.selecao
  const [q, setQ] = useState('')
  const [qAplicada, setQAplicada] = useState('')
  const [qualquerDisc, setQualquerDisc] = useState(false)
  const [qualquerCls, setQualquerCls] = useState(false)
  const [page, setPage] = useState(1)
  const [lista, setLista] = useState<DocsSeletorResposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [docId, setDocId] = useState<string | null>(atual?.documentoId ?? null)
  const [docTitulo, setDocTitulo] = useState(atual?.titulo ?? '')
  const [partes, setPartes] = useState<ParteSeletor[]>([])
  const [carregandoPartes, setCarregandoPartes] = useState(false)
  const [parteId, setParteId] = useState<string | null>(atual?.parteId ?? null)
  const [rotulo, setRotulo] = useState(atual?.rotuloAluno ?? '')
  const [visivel, setVisivel] = useState(atual?.visivelAluno ?? true)
  const ov = (atual?.regrasOverride?.tempo ?? {}) as Record<string, unknown>
  const [modo, setModo] = useState<string>(typeof ov.modo === 'string' ? ov.modo : '')
  const [valor, setValor] = useState<string>(() => { const c = MODOS.find((m) => m.v === ov.modo)?.campo; return c && typeof ov[c.k] === 'number' ? String(ov[c.k]) : '' })
  const [overrideTocado, setOverrideTocado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const r = await lerMatrizApi(conjuntoId, { acao: 'documentos', tipo: coluna.tipo, aula: linha.chave, q: qAplicada, page, pp: 8, disciplina: qualquerDisc ? 'todas' : 'conjunto', classificacao: qualquerCls ? 'todas' : 'coluna' })
    setCarregando(false)
    if (!r.ok) return toast.error(r.message ?? 'Não foi possível listar os documentos.')
    setLista(r as unknown as DocsSeletorResposta)
  }, [conjuntoId, coluna.tipo, linha.chave, qAplicada, page, qualquerDisc, qualquerCls])
  useEffect(() => { void carregar() }, [carregar])

  useEffect(() => {
    if (!docId || video) { setPartes([]); return }
    let vivo = true
    setCarregandoPartes(true)
    lerMatrizApi(conjuntoId, { acao: 'partes', documentoId: docId }).then((r) => {
      if (!vivo) return
      setCarregandoPartes(false)
      setPartes(r.ok ? ((r.partes as ParteSeletor[]) ?? []) : [])
    })
    return () => { vivo = false }
  }, [conjuntoId, docId, video])

  function escolher(d: Pick<DocSeletor, 'id' | 'titulo'>) {
    if (d.id !== docId) setParteId(null)
    setDocId(d.id)
    setDocTitulo(d.titulo)
  }

  const campo = MODOS.find((m) => m.v === modo)?.campo
  const regraAtual = celula.regra

  async function salvar() {
    if (!docId) return toast.error('Escolha um documento.')
    const corpoItem: Record<string, unknown> = {
      aula: linha.chave, tipo: coluna.tipo, documentoId: docId, parteId, rotuloAluno: rotulo.trim() || null, visivelAluno: visivel,
    }
    if (overrideTocado) {
      const n = Number(valor.replace(',', '.'))
      if (modo && campo && !(n > 0)) return toast.error('Informe um valor maior que zero para o tempo.')
      corpoItem.regrasOverride = modo ? { tempo: { modo, ...(campo ? { [campo.k]: n } : {}) }, meta: {} } : { tempo: {}, meta: {} }
    }
    setSalvando(true)
    const r = await gravarMatrizApi(conjuntoId, { operacao: 'selecionar', itens: [corpoItem] })
    setSalvando(false)
    if (!r.ok) return toast.error(r.message ?? 'Não foi possível salvar.')
    toast.success('Vínculo salvo.')
    onFeito()
  }

  async function limpar() {
    setSalvando(true)
    const r = await gravarMatrizApi(conjuntoId, { operacao: 'limpar', aulas: [linha.chave], tipos: [coluna.tipo] })
    setSalvando(false)
    if (!r.ok) return toast.error(r.message ?? 'Não foi possível limpar.')
    toast.success('Vínculo removido (volta ao automático).')
    onFeito()
  }

  const totalPaginas = useMemo(() => Math.max(1, Math.ceil((lista?.total ?? 0) / (lista?.pp ?? 8))), [lista])

  return (
    <>
      <DialogHeader>
        <DialogTitle>{coluna.nome} · {linha.titulo || (linha.chave ? `Aula ${linha.chave}` : 'Sem número de aula')}</DialogTitle>
        <DialogDescription>
          {video
            ? 'Escolha o documento de vídeo da Biblioteca. Ele aparece para o aluno junto do PDFull, de outro PDF de meta ou das questões desta mesma aula (não conta nas horas do cronograma).'
            : <>Escolha o documento da Biblioteca{coluna.classificacaoSlug ? ` (classificação ${coluna.classificacaoSlug})` : ''}, a parte e como o aluno vê. Sem escolha, vale o automático.</>}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
        {/* Documentos */}
        <div className="min-w-0 space-y-2">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQAplicada(q.trim()) }}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={video ? 'Buscar vídeo por título…' : 'Buscar por título ou disciplina…'} className="h-9 pl-8" />
            </div>
            <Button type="submit" size="sm" variant="outline">Buscar</Button>
          </form>
          {!video && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="accent-[var(--primary)]" checked={qualquerDisc} onChange={(e) => { setPage(1); setQualquerDisc(e.target.checked) }} /> Qualquer disciplina</label>
            <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="accent-[var(--primary)]" checked={qualquerCls} onChange={(e) => { setPage(1); setQualquerCls(e.target.checked) }} /> Qualquer classificação</label>
          </div>}
          <div className="min-h-[21rem] divide-y rounded-xl border">
            {carregando && !lista ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…</div>
            ) : !lista?.docs.length ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{video ? 'Nenhum vídeo publicado encontrado. Envie o vídeo na Biblioteca (tipo vídeo).' : 'Nenhum documento neste filtro. Marque “Qualquer disciplina/classificação” para ampliar.'}</div>
            ) : lista.docs.map((d) => {
              const on = d.id === docId
              return (
                <button key={d.id} type="button" onClick={() => escolher(d)} className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40 ${on ? 'bg-primary/10' : ''}`}>
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium" title={d.titulo}>{d.titulo}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[d.pasta, d.disciplina].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {d.sugerido && <Badge variant="secondary" className="text-[10px]">Sugerido</Badge>}
                    {d.classificacaoSlug && <Badge variant="outline" className="text-[10px]">{d.classificacaoSlug}</Badge>}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{(lista?.total ?? 0).toLocaleString('pt-BR')} documento(s)</span>
            <span className="flex items-center gap-1">
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={page <= 1 || carregando} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              {page}/{totalPaginas}
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={page >= totalPaginas || carregando} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </span>
          </div>
        </div>

        {/* Configuração do vínculo */}
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border bg-muted/20 p-3 text-sm">
            <div className="text-xs text-muted-foreground">Documento escolhido</div>
            <div className="font-medium">{docId ? docTitulo : <span className="text-muted-foreground">— nenhum (vale o automático{celula.auto ? `: ${celula.auto.titulo}` : ''})</span>}</div>
          </div>

          {!video && <div className="space-y-1.5">
            <Label className="text-xs">Parte do documento</Label>
            {!docId ? <p className="text-xs text-muted-foreground">Escolha um documento.</p> : carregandoPartes ? (
              <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Carregando partes…</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-auto rounded-xl border p-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" className="accent-[var(--primary)]" checked={!parteId} onChange={() => setParteId(null)} /> Documento inteiro</label>
                {partes.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" className="accent-[var(--primary)]" checked={parteId === p.id} onChange={() => setParteId(p.id)} />
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    {(p.rotuloIni || p.rotuloFim) && <span className="shrink-0 text-xs text-muted-foreground">{[p.rotuloIni, p.rotuloFim].filter(Boolean).join(' – ')}</span>}
                  </label>
                ))}
                {!partes.length && <p className="px-1 text-xs text-muted-foreground">Este documento não tem partes cadastradas.</p>}
              </div>
            )}
          </div>}

          <div className="space-y-1.5">
            <Label className="text-xs">Rótulo para o aluno (opcional)</Label>
            <Input value={rotulo} onChange={(e) => setRotulo(e.target.value)} maxLength={160} placeholder="Ex.: Parte 1 — Atos administrativos" className="h-9" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--primary)]" checked={visivel} onChange={(e) => setVisivel(e.target.checked)} /> Visível ao aluno</label>

          {!video && <div className="space-y-1.5 rounded-xl border p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Tempo (regra de uso · área Gerador)</span>
              {regraAtual && <span className="text-muted-foreground">{regraAtual.minutos != null ? `≈ ${regraAtual.minutos} min` : 'não calculável'}{regraAtual.paginas ? ` · ${regraAtual.paginas} pág.` : ''}</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              Herdado: {regraAtual ? `${MODOS.find((m) => m.v === regraAtual.modo)?.r ?? regraAtual.modo} (${regraAtual.origem === 'meta' ? 'desta aula' : regraAtual.origem === 'area' ? 'regra da área' : 'padrão'})` : '—'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className={SEL} value={modo} onChange={(e) => { setModo(e.target.value); setValor(''); setOverrideTocado(true) }} aria-label="Modo de tempo">
                {MODOS.map((m) => <option key={m.v} value={m.v}>{m.r}</option>)}
              </select>
              {campo && <Input className="h-9 w-28" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setOverrideTocado(true) }} placeholder={campo.r} aria-label={campo.r} />}
            </div>
            <p className="text-[11px] text-muted-foreground">Só ajuste quando esta aula fugir da regra da área. O cálculo é feito no servidor.</p>
          </div>}
        </div>
      </div>

      <DialogFooter>
        {atual && podeEditar && <Button type="button" variant="ghost" className="mr-auto text-destructive" onClick={limpar} disabled={salvando}><Trash2 className="mr-1 h-4 w-4" /> Limpar vínculo</Button>}
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={salvar} disabled={!podeEditar || salvando || !docId}>{salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Salvar vínculo</Button>
      </DialogFooter>
    </>
  )
}
