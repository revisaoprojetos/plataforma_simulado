'use client'

// Importar CSV (Estúdio) — modal fiel ao mockup Importar.png. NÃO reusa o ImportarQuestoesTab de
// produção (denso): esta é a versão enxuta do Estúdio. Por baixo roda nas ACTIONS REAIS
// analisarQuestoesImport / confirmarImportQuestoes (banco-questoes/actions.ts). Backend-first: o
// parse/dedupe acontece no servidor; aqui só a prévia, a seleção e a confirmação.

import * as React from 'react'
import { toast } from 'sonner'
import {
  FileText, Upload, X, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, ChevronDown,
  AlertTriangle, Loader2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { analisarQuestoesImport, confirmarImportQuestoes } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport, AnaliseImport } from '@/app/admin/banco-questoes/import-types'

const PAGE_SIZES = [5, 10, 25, 50]

export function ImportarQuestoesModal({
  open, onOpenChange, bancoId, bancoNome, onImported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  bancoId: string | null
  bancoNome?: string | null
  onImported?: (res: { criadas: number; jaExistiam: number; vinculadas: number }) => void
}) {
  const [nomeArquivo, setNomeArquivo] = React.useState<string | null>(null)
  const [analise, setAnalise] = React.useState<AnaliseImport | null>(null)
  const [erroArquivo, setErroArquivo] = React.useState<string | null>(null)
  const [sel, setSel] = React.useState<Record<number, boolean>>({})
  const [ps, setPs] = React.useState(5)
  const [pg, setPg] = React.useState(0)
  const [analisando, startAnalise] = React.useTransition()
  const [importando, startImport] = React.useTransition()

  // Reset ao reabrir.
  React.useEffect(() => {
    if (!open) return
    setNomeArquivo(null); setAnalise(null); setErroArquivo(null); setSel({}); setPs(5); setPg(0)
  }, [open])

  const questoes = analise?.ok ? (analise.questoes ?? []) : []
  const resumo = analise?.resumo ?? { total: 0, novas: 0, jaExistem: 0, comErro: 0 }
  const prontas = resumo.total - resumo.comErro // novas + já existentes (sem erro)
  const comErro = resumo.comErro

  // Índices das questões SEM erro (as únicas importáveis).
  const idxProntas = React.useMemo(() => questoes.map((q, i) => ({ q, i })).filter(({ q }) => !q.erro).map(({ i }) => i), [questoes])
  const selecionadasProntas = idxProntas.filter((i) => sel[i])
  // Sem marcação explícita → importa todas as prontas (comportamento do mockup: "Importar N").
  const nParaImportar = selecionadasProntas.length > 0 ? selecionadasProntas.length : prontas

  async function escolherArquivo(file: File) {
    setNomeArquivo(file.name); setErroArquivo(null); setSel({}); setPg(0)
    const fd = new FormData()
    fd.append('arquivo', file)
    startAnalise(async () => {
      const r = await analisarQuestoesImport(fd)
      if (!r.ok) { setAnalise(null); setErroArquivo(r.error ?? 'Não foi possível ler o arquivo.'); return }
      setAnalise(r)
    })
  }

  function importar() {
    if (!questoes.length || nParaImportar === 0) return
    // Importa as prontas marcadas; se nenhuma marcada, importa TODAS as prontas.
    const base = selecionadasProntas.length > 0
      ? selecionadasProntas.map((i) => questoes[i])
      : questoes.filter((q) => !q.erro)
    startImport(async () => {
      const r = await confirmarImportQuestoes(bancoId, base as QuestaoImport[])
      if (!r.ok) { toast.error(r.error ?? 'Falha ao importar.'); return }
      const partes = [
        r.criadas ? `${r.criadas} criada(s)` : null,
        r.jaExistiam ? `${r.jaExistiam} já existia(m)` : null,
      ].filter(Boolean).join(' · ')
      toast.success(`Importação concluída${partes ? ` — ${partes}` : ''}.`)
      onImported?.({ criadas: r.criadas ?? 0, jaExistiam: r.jaExistiam ?? 0, vinculadas: r.vinculadas ?? 0 })
      onOpenChange(false)
    })
  }

  function baixarModelo() {
    const cab = 'banco_nome,questao_enunciado,alternativa_texto,alternativa_correta,questao_explicacao'
    const ex1 = '"Responsabilidade civil – PGE/RS","Sobre a responsabilidade civil, é correto afirmar:","haverá obrigação de reparar o dano, independentemente de culpa...",1,"Art. 927, parágrafo único, do CC."'
    const ex0 = '"Responsabilidade civil – PGE/RS","Sobre a responsabilidade civil, é correto afirmar:","a indenização mede-se pela gravidade da culpa, e não pela extensão do dano.",0,'
    const csv = '﻿' + [cab, ex1, ex0].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'modelo-questoes.csv'; a.click(); URL.revokeObjectURL(url)
  }

  // Paginação da prévia.
  const totalPaginas = Math.max(1, Math.ceil(questoes.length / ps))
  const pagina = Math.min(pg, totalPaginas - 1)
  const inicio = pagina * ps
  const visiveis = questoes.slice(inicio, inicio + ps)

  // Banner de erro (primeira linha com problema).
  const primeiroErro = questoes.find((q) => q.erro)
  const bannerErro = comErro > 0 && primeiroErro
    ? `A linha ${primeiroErro.linha} ${textoErro(primeiroErro.erro)}. Corrija no arquivo ou importe só as prontas${comErro > 1 ? ` (${comErro} linhas com erro)` : ''}.`
    : null

  function bancoDaLinha(q: QuestaoImport) {
    // QuestaoImport não carrega banco_nome (o data layer não o expõe). Fallback: banco de destino,
    // senão a classificação da própria linha (disciplina/banca).
    return (bancoNome && bancoNome.trim()) || q.disciplina || q.banca || '—'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="w-[min(860px,calc(100vw-2rem))] max-w-[min(860px,calc(100vw-2rem))] gap-0 p-0 sm:max-w-[min(860px,calc(100vw-2rem))]">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Bancos de questões › Importar{bancoNome ? ` · ${bancoNome}` : ' banco'}</div>
            <DialogTitle className="mt-0.5 text-lg font-bold tracking-tight">Importar CSV</DialogTitle>
          </div>
          <button
            type="button" aria-label="Fechar" onClick={() => onOpenChange(false)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[78vh] space-y-4 overflow-y-auto px-6 pb-6 pt-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Colunas: banco_nome, questao_enunciado, alternativa_texto, alternativa_correta (1 correta, 0 incorreta), questao_explicacao (opcional).
            Discursiva: uma linha só, sem alternativa. Até 30.000 linhas.
          </p>

          {/* Arquivo */}
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                {analisando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{nomeArquivo ?? 'Nenhum arquivo enviado'}</div>
                <div className="text-xs text-muted-foreground">{nomeArquivo ? (analisando ? 'Lendo o arquivo…' : 'Arquivo enviado') : 'Escolha um arquivo .csv'}</div>
              </div>
            </div>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
              <Upload className="h-4 w-4" /> {nomeArquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) escolherArquivo(f) }} />
            </label>
          </div>

          {erroArquivo && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{erroArquivo}</span>
            </div>
          )}

          {analise?.ok && (
            <>
              {/* 3 stat cards */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard valor={resumo.total} label="questões no arquivo" />
                <StatCard valor={prontas} label="prontas" />
                <StatCard valor={comErro} label="com erro" alerta={comErro > 0} />
              </div>

              {/* Prévia */}
              <div className="space-y-2">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-semibold text-foreground">{questoes.length} itens</span>
                  <span className="text-muted-foreground">· marque uma ou mais linhas para agir em lote</span>
                </div>

                <div className="overflow-hidden rounded-xl border">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: '2.75rem' }} /><col style={{ width: '3.5rem' }} /><col />
                      <col style={{ width: '10rem' }} /><col style={{ width: '4.25rem' }} /><col style={{ width: '6.5rem' }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2.5 text-left">
                          <input
                            type="checkbox" aria-label="Selecionar todas as prontas desta página"
                            className="h-4 w-4 accent-[var(--brand-primary,var(--primary))]"
                            checked={visiveis.length > 0 && visiveis.every((q, k) => q.erro || sel[inicio + k])}
                            onChange={(e) => {
                              const n = { ...sel }
                              visiveis.forEach((q, k) => { if (!q.erro) n[inicio + k] = e.target.checked })
                              setSel(n)
                            }}
                          />
                        </th>
                        <th className="px-2 py-2.5 text-left font-medium">Linha</th>
                        <th className="px-3 py-2.5 text-left font-medium">Enunciado</th>
                        <th className="px-3 py-2.5 text-left font-medium">Banco</th>
                        <th className="px-2 py-2.5 text-left font-medium">Alter.</th>
                        <th className="px-3 py-2.5 text-left font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map((q, k) => {
                        const idx = inicio + k
                        const marcada = !!sel[idx]
                        return (
                          <tr
                            key={q.linha}
                            className={cn(
                              'border-b border-l-2 transition-colors last:border-b-0',
                              marcada ? 'border-l-primary bg-primary/5' : 'border-l-transparent',
                              q.erro ? 'bg-destructive/5' : 'hover:bg-muted/40',
                            )}
                          >
                            <td className="px-3 py-3 align-top">
                              <input
                                type="checkbox" aria-label={`Selecionar linha ${q.linha}`}
                                className="h-4 w-4 accent-[var(--brand-primary,var(--primary))] disabled:opacity-40"
                                disabled={!!q.erro} checked={marcada}
                                onChange={(e) => setSel({ ...sel, [idx]: e.target.checked })}
                              />
                            </td>
                            <td className="px-2 py-3 align-top tabular-nums text-muted-foreground">{q.linha}</td>
                            <td className="px-3 py-3 align-top">
                              <div className="line-clamp-2 font-semibold text-foreground" title={q.enunciado}>{q.enunciado || '—'}</div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="line-clamp-2 text-muted-foreground" title={bancoDaLinha(q)}>{bancoDaLinha(q)}</div>
                            </td>
                            <td className="px-2 py-3 align-top tabular-nums text-foreground">{q.tipo === 'discursiva' ? '—' : q.alternativas.length}</td>
                            <td className="px-3 py-3 align-top">
                              {q.erro
                                ? <span className="inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold text-destructive" title={q.erro}>Erro</span>
                                : q.jaExiste
                                  ? <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">Já existe</span>
                                  : <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Ok</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Rodapé da prévia: contagem + por página + paginação */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>
                    Mostrando <b className="text-foreground">{questoes.length === 0 ? 0 : inicio + 1}–{Math.min(questoes.length, inicio + ps)}</b> de <b className="text-foreground">{questoes.length}</b> · {totalPaginas} {totalPaginas === 1 ? 'página' : 'páginas'}
                  </span>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                        {ps} por página <ChevronDown className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {PAGE_SIZES.map((z) => (
                          <DropdownMenuItem key={z} onClick={() => { setPs(z); setPg(0) }}>{z} por página</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="flex items-center gap-1">
                      <PagBtn onClick={() => setPg(0)} disabled={pagina <= 0} label="Primeira"><ChevronsLeft className="h-4 w-4" /></PagBtn>
                      <PagBtn onClick={() => setPg(pagina - 1)} disabled={pagina <= 0} label="Anterior"><ChevronLeft className="h-4 w-4" /></PagBtn>
                      <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground tabular-nums">{pagina + 1}</span>
                      <PagBtn onClick={() => setPg(pagina + 1)} disabled={pagina >= totalPaginas - 1} label="Próxima"><ChevronRight className="h-4 w-4" /></PagBtn>
                      <PagBtn onClick={() => setPg(totalPaginas - 1)} disabled={pagina >= totalPaginas - 1} label="Última"><ChevronsRight className="h-4 w-4" /></PagBtn>
                    </div>
                  </div>
                </div>

                {bannerErro && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{bannerErro}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Rodapé fixo */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
          <button type="button" onClick={baixarModelo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:underline">
            Baixar modelo do CSV <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancelar</button>
            <button
              type="button" onClick={importar} disabled={importando || !analise?.ok || nParaImportar === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar {nParaImportar} {nParaImportar === 1 ? 'questão' : 'questões'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ valor, label, alerta }: { valor: number; label: string; alerta?: boolean }) {
  return (
    <div className={cn(
      'rounded-xl border p-4',
      alerta ? 'border-amber-500/40 bg-amber-500/10' : 'bg-card',
    )}>
      <div className={cn('text-2xl font-bold leading-none tabular-nums', alerta ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>{valor.toLocaleString('pt-BR')}</div>
      <div className={cn('mt-1.5 text-xs font-medium', alerta ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{label}</div>
    </div>
  )
}

function PagBtn({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40">
      {children}
    </button>
  )
}

function textoErro(erro?: string | null): string {
  const e = (erro ?? '').toLowerCase()
  if (e.includes('correta')) return 'não tem nenhuma alternativa com 1 em alternativa_correta'
  if (e.includes('2 alternativas')) return 'tem menos de 2 alternativas'
  if (e.includes('enunciado')) return 'está com o enunciado vazio'
  return `tem um problema: ${erro}`
}
