'use client'

// BANCO DE QUESTÕES › índice (Estúdio). Mesmo padrão do navegador de Produtos:
// <EstudioHeader> (abas abaixo do título) + <DataTable> único + painel lateral + pílulas de filtro no servidor.
//  modo "bancos": lista de bancos → clique mostra o resumo; "Abrir banco" entra (?sel).
//  modo "banco" : questões do banco (busca/ordem/paginação no servidor) → clique mostra a prévia (?qsel).
// A página busca; aqui só interage (router.push nos searchParams). Backend-first.

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Plus, Upload, Download, BookOpen, ChevronRight, ChevronDown, Pencil, Copy, Trash2, Eye, Loader2, Home, FileQuestion, Link2, FolderInput,
} from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { MateriaisTabs } from '@/components/admin/materiais-tabs'
import { DataTable, type DataTableColumn, type DataTableRowAction, type DataTableSelection } from '@/components/admin/data-table'
import { criarBanco, renomearBanco, duplicarBanco, excluirBanco, moverBancoParaPasta } from '@/app/admin/banco-questoes/actions'
import { excluirQuestoes } from '@/app/admin/questoes/actions'
import { listarDestinosBanco, duplicarQuestoesNoBanco, moverQuestoesEntreBancos } from './actions'
import { ImportarQuestoesModal } from './importar-questoes-modal'

export type BancoRow = {
  id: string
  nome: string
  tipo: 'objetiva' | 'discursiva'
  questoes: number
  atualizadoEm: string | null
  disciplina: string | null
  banca: string | null
}
export type QuestaoPreviewLinha = {
  id: string
  numero: number
  enunciado: string
  tipo: 'objetiva' | 'discursiva'
  altCount: number
  gabarito: string | null
  prova: string | null
  ano: number | null
  dificuldade: string | null
  status: string | null
  temExplicacao: boolean
}
export type QuestaoDetalhe = {
  id: string
  numero: number
  enunciado: string
  tipo: 'objetiva' | 'discursiva'
  gabarito: string | null
  alternativas: { letra: string; texto: string; correta: boolean }[]
  explicacao: string | null
  // `cargo` não tem fonte no esquema atual → não é exibido.
  classificacao: { disciplina: string | null; assunto: string | null; prova: string | null }
}
type Filtros = { disc: string | null; banca: string | null; ano: number | null; dif: string | null; sit: string | null }

const BASE = '/admin/conteudos/materiais/questoes'
const BTN_LOTE = 'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] border bg-card px-[11px] text-[12.5px] font-bold text-foreground hover:bg-muted'
const BTN_LOTE_DEL = 'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-destructive/35 bg-card px-[11px] text-[12.5px] font-bold text-destructive'

/** Ações compartilhadas (⋮, lote e painel) dos bancos. */
type AcoesBanco = {
  pending: boolean
  abrir: (id: string) => void
  renomear: (b: BancoRow) => void
  copiarLinks: (ids: string[]) => void
  duplicar: (ids: string[]) => void
  mover: (ids: string[]) => void
  exportar: (ids: string[]) => void
  excluir: (ids: string[], nome?: string) => void
}
/** Ações compartilhadas (⋮, lote e painel) das questões do banco aberto. */
type AcoesQuestao = {
  pending: boolean
  editar: (id: string) => void
  preview: (id: string) => void
  copiarLinks: (ids: string[]) => void
  duplicar: (ids: string[]) => void
  mover: (ids: string[]) => void
  exportar: (ids: string[]) => void
  excluir: (ids: string[]) => void
}
const GRAD_PRIMARY = { background: 'linear-gradient(180deg,color-mix(in oklab,var(--primary) 85%,white),var(--primary))' }
const BTN_TOP = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border bg-card px-3.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted'
const BTN_PRIMARY = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)]'
const DIF_LABEL: Record<string, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
const SIT_LABEL: Record<string, string> = { publicada: 'Ativa', rascunho: 'Rascunho', arquivada: 'Arquivada' }
const DIF_TOM: Record<string, 'ok' | 'warn' | 'bad'> = { facil: 'ok', medio: 'warn', dificil: 'bad' }
const SIT_TOM: Record<string, 'ok' | 'warn' | 'neutro'> = { publicada: 'ok', rascunho: 'warn', arquivada: 'neutro' }

export function BancosAcervo({
  modo, banco, rows, total, questoes, totalQuestoes, detalhe, filtros, disciplinasFiltro, bancasFiltro, anosFiltro,
}: {
  modo: 'bancos' | 'banco'
  banco: BancoRow | null
  rows: BancoRow[]
  total: number
  questoes: QuestaoPreviewLinha[]
  totalQuestoes: number
  detalhe: QuestaoDetalhe | null
  filtros: Filtros
  disciplinasFiltro: string[]
  bancasFiltro: string[]
  anosFiltro: number[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = React.useTransition()

  const [importOpen, setImportOpen] = React.useState(false)
  const [criar, setCriar] = React.useState<null | { nome: string; tipo: 'objetiva' | 'discursiva' }>(null)
  const [preview, setPreview] = React.useState(false)
  const [selBanco, setSelBanco] = React.useState<BancoRow | null>(null)
  const [moverBancos, setMoverBancos] = React.useState<string[] | null>(null)
  const [moverQuestoes, setMoverQuestoes] = React.useState<string[] | null>(null)

  function pushParams(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(searchParams.toString())
    mut(p)
    router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
  }
  const abrirBanco = (id: string) => router.push(`${BASE}?sel=${id}`)
  const voltarBancos = () => router.push(BASE)
  const selecionarQuestao = (id: string) => pushParams((p) => { p.set('qsel', id) })
  const setFiltro = (chave: 'disc' | 'banca' | 'ano' | 'dif' | 'sit', v: string | null) =>
    pushParams((p) => { if (v) p.set(chave, v); else p.delete(chave); p.delete('page'); p.delete('qsel') })

  function criarBancoAgora() {
    if (!criar) return
    const nome = criar.nome.trim()
    if (!nome) { toast.error('Informe um nome.'); return }
    startTransition(async () => {
      const r = await criarBanco(nome, criar.tipo)
      if (!r.ok || !r.id) { toast.error(r.error ?? 'Erro ao criar o banco.'); return }
      toast.success('Banco criado.')
      setCriar(null)
      router.push(`${BASE}/${r.id}`)
    })
  }
  function renomear(b: BancoRow) {
    startTransition(async () => {
      const nome = await pedirTexto({ titulo: 'Renomear banco', label: 'Nome do banco', valorInicial: b.nome })
      if (nome == null) return
      const r = await renomearBanco(b.id, nome)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao renomear.'); return }
      toast.success('Banco renomeado.'); router.refresh()
    })
  }
  const copiar = (texto: string, msg: string) =>
    navigator.clipboard?.writeText(texto).then(() => toast.success(msg)).catch(() => toast.error('Não foi possível copiar.'))
  const linkBanco = (id: string) => `${window.location.origin}${BASE}?sel=${id}`
  const linkQuestao = (id: string) => `${window.location.origin}${BASE}?sel=${banco?.id ?? ''}&qsel=${id}`

  function duplicarBancos(ids: string[]) {
    if (!ids.length) return
    startTransition(async () => {
      let ok = 0
      for (const id of ids) {
        const r = await duplicarBanco(id)
        if (!r.ok) { toast.error(r.error ?? 'Erro ao duplicar.'); break }
        ok++
      }
      if (ok) { toast.success(ok === 1 ? 'Banco duplicado.' : `${ok} bancos duplicados.`); router.refresh() }
    })
  }
  function excluirBancos(ids: string[], nome?: string) {
    if (!ids.length) return
    startTransition(async () => {
      const ok = await confirmar({
        titulo: ids.length === 1 ? 'Excluir banco' : 'Enviar para a Lixeira',
        mensagem: ids.length === 1 ? `Enviar "${nome ?? 'este banco'}" para a lixeira? As questões não são apagadas.` : `Enviar ${ids.length} bancos para a lixeira? As questões não são apagadas.`,
        destrutivo: true, confirmar: 'Excluir',
      })
      if (!ok) return
      for (const id of ids) {
        const r = await excluirBanco(id)
        if (!r.ok) { toast.error(r.error ?? 'Erro ao excluir.'); return }
      }
      toast.success(ids.length === 1 ? 'Banco enviado para a lixeira.' : 'Bancos enviados para a lixeira.')
      setSelBanco(null)
      if (modo === 'banco') router.push(BASE); else router.refresh()
    })
  }
  function exportarBancos(ids: string[]) {
    ids.forEach((id, i) => {
      window.setTimeout(() => {
        const a = document.createElement('a')
        a.href = `/api/admin/conteudos/questoes/export?banco=${id}`
        document.body.appendChild(a); a.click(); a.remove()
      }, i * 600)
    })
    toast.message(ids.length > 1 ? `Gerando ${ids.length} planilhas…` : 'Gerando a planilha…')
  }

  function duplicarQuestoes(ids: string[]) {
    if (!banco || !ids.length) return
    startTransition(async () => {
      const r = await duplicarQuestoesNoBanco(banco.id, ids)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao duplicar.'); if (r.count) router.refresh(); return }
      toast.success(r.count === 1 ? 'Questão duplicada.' : `${r.count} questões duplicadas.`); router.refresh()
    })
  }
  function excluirQuestoesLote(ids: string[]) {
    if (!ids.length) return
    startTransition(async () => {
      const ok = await confirmar({
        titulo: 'Excluir questão', destrutivo: true, confirmar: 'Enviar para a Lixeira',
        mensagem: `Enviar ${ids.length === 1 ? 'esta questão' : `${ids.length} questões`} para a Lixeira? Elas saem de TODOS os bancos que as usam (reversível pela Lixeira).`,
      })
      if (!ok) return
      const r = await excluirQuestoes(ids)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao excluir.'); return }
      toast.success('Enviado para a Lixeira.'); router.push(`${BASE}?sel=${banco?.id ?? ''}`); router.refresh()
    })
  }
  function exportarQuestoesCsv(ids: string[]) {
    const alvos = questoes.filter((q) => ids.includes(q.id))
    if (!alvos.length) { toast.message('Selecione questões desta página.'); return }
    const esc = (v: unknown) => { const t = String(v ?? ''); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const cab = ['Nº', 'Enunciado', 'Tipo', 'Gabarito', 'Prova', 'Ano', 'Dificuldade', 'Situação']
    const linhas = alvos.map((q) => [q.numero, q.enunciado, q.tipo === 'discursiva' ? 'Discursiva' : 'Objetiva', q.gabarito, q.prova, q.ano,
      q.dificuldade ? (DIF_LABEL[q.dificuldade] ?? q.dificuldade) : '', q.status ? (SIT_LABEL[q.status] ?? q.status) : ''].map(esc).join(','))
    const blob = new Blob(['﻿' + [cab.join(','), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `questoes-${(banco?.nome ?? 'banco').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
  }

  const acoesBanco: AcoesBanco = {
    pending, abrir: abrirBanco, renomear,
    copiarLinks: (ids) => copiar(ids.map(linkBanco).join('\n'), ids.length === 1 ? 'Link copiado.' : `${ids.length} links copiados.`),
    duplicar: duplicarBancos, mover: (ids) => setMoverBancos(ids), exportar: exportarBancos, excluir: excluirBancos,
  }
  const acoesQuestao: AcoesQuestao = {
    pending,
    editar: (id) => router.push(`/admin/questoes/${id}/editar`),
    preview: (id) => { selecionarQuestao(id); setPreview(true) },
    copiarLinks: (ids) => copiar(ids.map(linkQuestao).join('\n'), ids.length === 1 ? 'Link copiado.' : `${ids.length} links copiados.`),
    duplicar: duplicarQuestoes, mover: (ids) => setMoverQuestoes(ids), exportar: exportarQuestoesCsv, excluir: excluirQuestoesLote,
  }

  function exportar() {
    const p = new URLSearchParams()
    for (const k of ['q', 'disc', 'banca', 'ano', 'dif', 'sit', 'sort', 'dir']) { const v = searchParams.get(k); if (v) p.set(k, v) }
    if (modo === 'banco' && banco) p.set('banco', banco.id)
    const a = document.createElement('a')
    a.href = `/api/admin/conteudos/questoes/export${p.toString() ? `?${p}` : ''}`
    document.body.appendChild(a); a.click(); a.remove()
    toast.message('Gerando a planilha…')
  }

  const acoes = (
    <>
      <button type="button" onClick={exportar} aria-label="Exportar planilha (XLSX)" title="Exportar planilha (XLSX)"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted"><Download className="h-4 w-4" /></button>
      <button type="button" onClick={() => setImportOpen(true)} className={BTN_TOP}><Upload className="h-[15px] w-[15px]" />{modo === 'banco' ? 'Importar CSV' : 'Importar'}</button>
      {modo === 'bancos' ? (
        <button type="button" onClick={() => setCriar({ nome: '', tipo: 'objetiva' })} style={GRAD_PRIMARY} className={BTN_PRIMARY}><Plus className="h-[15px] w-[15px]" />Adicionar banco</button>
      ) : (
        <Link href="/admin/questoes/nova" style={GRAD_PRIMARY} className={BTN_PRIMARY}><Plus className="h-[15px] w-[15px]" />Adicionar questão</Link>
      )}
    </>
  )

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <EstudioHeader titulo="Banco de questões" acoes={acoes} subtabs={<MateriaisTabs />} />

      {modo === 'banco' && banco && (
        <div className="flex items-center gap-3 rounded-[14px] border bg-card px-3 py-2.5">
          <button type="button" onClick={voltarBancos} aria-label="Todos os bancos"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary"><Home className="h-4 w-4" /></button>
          <span className="h-[22px] w-px bg-border" />
          <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
            <button type="button" onClick={voltarBancos} className="font-semibold text-muted-foreground hover:text-foreground">Bancos de questões</button>
            <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
            <span className="font-extrabold text-foreground">{banco.nome}</span>
          </nav>
          <Link href={`${BASE}/${banco.id}`} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[10px] border bg-card px-3 text-[12.5px] font-bold text-foreground hover:bg-muted">
            <Pencil className="h-3.5 w-3.5" />Editar banco
          </Link>
        </div>
      )}

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {modo === 'bancos' ? (
          <ListaBancos
            rows={rows} total={total} filtros={filtros} disciplinasFiltro={disciplinasFiltro} bancasFiltro={bancasFiltro}
            sel={selBanco} onSel={setSelBanco} ac={acoesBanco}
          />
        ) : (
          <ListaQuestoes
            questoes={questoes} total={totalQuestoes} filtros={filtros} detalhe={detalhe}
            disciplinasFiltro={disciplinasFiltro} bancasFiltro={bancasFiltro} anosFiltro={anosFiltro}
            onSel={selecionarQuestao} ac={acoesQuestao} setFiltro={setFiltro}
          />
        )}

        <aside className="flex flex-col gap-4 rounded-[20px] border bg-card p-5 xl:sticky xl:top-4">
          {modo === 'bancos' ? (
            selBanco ? (
              <PainelBanco b={selBanco} ac={acoesBanco} onEditar={() => router.push(`${BASE}/${selBanco.id}`)} />
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">Clique num banco para ver o resumo. Use “Abrir banco” para ver as questões.</div>
            )
          ) : detalhe ? (
            <PainelQuestao detalhe={detalhe} ac={acoesQuestao} />
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">Selecione uma questão à esquerda para ver a prévia.</div>
          )}
        </aside>
      </div>

      <ImportarQuestoesModal open={importOpen} onOpenChange={setImportOpen} bancoId={banco?.id ?? null} bancoNome={banco?.nome} onImported={() => router.refresh()} />
      {detalhe && preview && <PreviewDialog detalhe={detalhe} onClose={() => setPreview(false)} />}

      {moverBancos && (
        <MoverDialog
          titulo={moverBancos.length === 1 ? 'Mover banco' : `Mover ${moverBancos.length} bancos`}
          rotulo="Pasta de destino" modo="pasta" excluirId={null}
          onClose={() => setMoverBancos(null)}
          onConfirmar={async (destino) => {
            for (const id of moverBancos) {
              const r = await moverBancoParaPasta(id, destino)
              if (!r.ok) { toast.error(r.error ?? 'Erro ao mover.'); return false }
            }
            toast.success('Movido.'); setMoverBancos(null); router.refresh(); return true
          }}
        />
      )}
      {moverQuestoes && banco && (
        <MoverDialog
          titulo={moverQuestoes.length === 1 ? 'Mover para outro banco' : `Mover ${moverQuestoes.length} questões`}
          rotulo="Banco de destino" modo="banco" excluirId={banco.id}
          onClose={() => setMoverQuestoes(null)}
          onConfirmar={async (destino) => {
            if (!destino) { toast.error('Escolha o banco de destino.'); return false }
            const r = await moverQuestoesEntreBancos(banco.id, destino, moverQuestoes)
            if (!r.ok) { toast.error(r.error ?? 'Erro ao mover.'); return false }
            toast.success('Movido.'); setMoverQuestoes(null); router.push(`${BASE}?sel=${banco.id}`); router.refresh(); return true
          }}
        />
      )}

      {criar && (
        <Dialog open onOpenChange={(o) => { if (!o) setCriar(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle>Adicionar banco</DialogTitle>
            <p className="pt-1 text-sm text-muted-foreground">O nome aparece ao montar quiz e simulado.</p>
            <div className="space-y-4 pt-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-foreground">Nome do banco</span>
                <input autoFocus value={criar.nome} onChange={(e) => setCriar({ ...criar, nome: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') criarBancoAgora() }}
                  placeholder="Ex.: Responsabilidade civil – PGE/RS"
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-foreground">Tipo</span>
                <Select value={criar.tipo} onValueChange={(v) => setCriar({ ...criar, tipo: (v === 'discursiva' ? 'discursiva' : 'objetiva') })} items={{ objetiva: 'Objetiva', discursiva: 'Discursiva' }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="objetiva">Objetiva</SelectItem>
                    <SelectItem value="discursiva">Discursiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setCriar(null)} className="rounded-lg border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancelar</button>
              <button onClick={criarBancoAgora} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Criar banco
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ───────────────────────────── Lista de bancos (DataTable) ─────────────────────────────
function ListaBancos({
  rows, total, filtros, disciplinasFiltro, bancasFiltro, sel, onSel, ac,
}: {
  rows: BancoRow[]; total: number; filtros: Filtros; disciplinasFiltro: string[]; bancasFiltro: string[]
  sel: BancoRow | null; onSel: (b: BancoRow) => void; ac: AcoesBanco
}) {
  const onAbrir = ac.abrir
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const setFiltro = (chave: 'disc' | 'banca', v: string | null) => {
    const p = new URLSearchParams(searchParams.toString())
    if (v) p.set(chave, v); else p.delete(chave)
    p.delete('page')
    router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
  }

  const columns: DataTableColumn<BancoRow>[] = [
    {
      key: 'banco', header: 'Banco', truncate: false,
      render: (b) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0">
            <b className="block truncate text-[13.5px] leading-[1.35] text-foreground">{b.nome}</b>
            <span className="block truncate text-xs leading-normal text-muted-foreground">
              {[b.tipo === 'discursiva' ? 'Discursiva' : 'Objetiva', b.disciplina, b.banca].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
      ),
    },
    { key: 'questoes', header: 'Questões', width: '6.5rem', render: (b) => <b className="text-[13px] tabular-nums text-foreground">{b.questoes.toLocaleString('pt-BR')}</b> },
    {
      key: 'atualizacao', header: 'Atualização', width: '9rem', truncate: false,
      render: (b) => <span className="text-[12.5px] text-foreground">{formatBrt(b.atualizadoEm) ?? '—'}</span>,
    },
    {
      key: 'abrir', header: '', width: '6rem', align: 'right', truncate: false,
      render: (b) => sel?.id === b.id ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir(b.id) }}
          className="inline-flex h-[30px] items-center gap-1 whitespace-nowrap rounded-[9px] border border-primary/30 bg-primary/10 px-2.5 text-xs font-extrabold text-primary">Abrir<ChevronRight className="h-[13px] w-[13px]" /></button>
      ) : null,
    },
  ]

  // Menu ⋮ fiel ao designer (MAPA › Banco de questões) + genérico (Editar · Copiar link · Duplicar · Mover · Exportar · Excluir).
  const rowActions = (b: BancoRow): DataTableRowAction[] => [
    { label: 'Ver questões', icon: <ChevronRight className="h-4 w-4" />, onClick: () => onAbrir(b.id) },
    { label: 'Adicionar questão', icon: <Plus className="h-4 w-4" />, href: '/admin/questoes/nova' },
    { label: 'Editar banco', icon: <Pencil className="h-4 w-4" />, href: `${BASE}/${b.id}` },
    { label: 'Renomear banco', icon: <Pencil className="h-4 w-4" />, disabled: ac.pending, onClick: () => ac.renomear(b) },
    { label: 'Copiar link', icon: <Link2 className="h-4 w-4" />, onClick: () => ac.copiarLinks([b.id]) },
    { label: 'Duplicar', icon: <Copy className="h-4 w-4" />, disabled: ac.pending, onClick: () => ac.duplicar([b.id]) },
    { label: 'Mover', icon: <FolderInput className="h-4 w-4" />, onClick: () => ac.mover([b.id]) },
    { label: 'Exportar CSV', icon: <Download className="h-4 w-4" />, onClick: () => ac.exportar([b.id]) },
    { label: 'Excluir banco', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, disabled: ac.pending, onClick: () => ac.excluir([b.id], b.nome) },
  ]

  return (
    <DataTable<BancoRow>
      rows={rows} total={total} columns={columns} getRowId={(b) => b.id}
      searchable searchPlaceholder="Pesquise pelo título do banco"
      filters={(
        <>
          <FiltroPill label="Disciplina" valorAtual={filtros.disc} opcoes={disciplinasFiltro.map((v) => ({ value: v, label: v }))} onPick={(v) => setFiltro('disc', v)} />
          <FiltroPill label="Banca" valorAtual={filtros.banca} opcoes={bancasFiltro.map((v) => ({ value: v, label: v }))} onPick={(v) => setFiltro('banca', v)} />
        </>
      )}
      rowActions={rowActions}
      bulkActions={(s) => <BulkBancos s={s} ac={ac} />}
      onRowClick={onSel} activeRowId={sel?.id ?? null} rowHeight="h-16"
      nomeSingular="banco" nomePlural="bancos"
      empty={<span className="inline-flex flex-col items-center gap-2"><BookOpen className="h-6 w-6 opacity-50" />{total === 0 && !filtros.disc && !filtros.banca ? 'Nenhum banco ainda. Clique em “Adicionar banco”.' : 'Nenhum banco com esses filtros.'}</span>}
    />
  )
}

// ───────────────────────────── Lista de questões do banco (DataTable) ─────────────────────────────
function ListaQuestoes({
  questoes, total, filtros, detalhe, disciplinasFiltro, bancasFiltro, anosFiltro, onSel, ac, setFiltro,
}: {
  questoes: QuestaoPreviewLinha[]; total: number; filtros: Filtros; detalhe: QuestaoDetalhe | null
  disciplinasFiltro: string[]; bancasFiltro: string[]; anosFiltro: number[]
  onSel: (id: string) => void; ac: AcoesQuestao
  setFiltro: (c: 'disc' | 'banca' | 'ano' | 'dif' | 'sit', v: string | null) => void
}) {
  const columns: DataTableColumn<QuestaoPreviewLinha>[] = [
    { key: 'numero', header: 'Nº', sortable: true, width: '4.5rem', render: (x) => <span className="font-mono text-xs tabular-nums text-muted-foreground">{String(x.numero).padStart(2, '0')}</span> },
    {
      key: 'questao', header: 'Questão', truncate: false,
      render: (x) => (
        <div className="min-w-0">
          <div className="line-clamp-2 text-[13.5px] font-bold leading-[1.35] text-foreground">{x.enunciado || '—'}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip tom="neutro">{x.tipo === 'discursiva' ? 'Discursiva' : `Objetiva · ${x.altCount} alternativas`}</Chip>
            {x.gabarito && <Chip tom="ok">Gabarito {x.gabarito}</Chip>}
            {x.prova && <Chip tom="info">{x.prova}</Chip>}
            {x.temExplicacao && <Chip tom="brand">Com explicação</Chip>}
          </div>
        </div>
      ),
    },
    {
      key: 'dificuldade', header: 'Dificuldade', sortable: true, width: '8rem', truncate: false,
      render: (x) => x.dificuldade && DIF_LABEL[x.dificuldade] ? <Chip tom={DIF_TOM[x.dificuldade]}>{DIF_LABEL[x.dificuldade]}</Chip> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'situacao', header: 'Situação', width: '7.5rem', truncate: false,
      render: (x) => x.status && SIT_LABEL[x.status] ? <Chip tom={SIT_TOM[x.status]}>{SIT_LABEL[x.status]}</Chip> : <span className="text-muted-foreground">—</span>,
    },
  ]
  // Menu ⋮ fiel ao designer (MAPA › Banco de questões › questão) + genérico.
  const rowActions = (x: QuestaoPreviewLinha): DataTableRowAction[] => [
    { label: 'Editar questão', icon: <Pencil className="h-4 w-4" />, onClick: () => ac.editar(x.id) },
    { label: 'Copiar link', icon: <Link2 className="h-4 w-4" />, onClick: () => ac.copiarLinks([x.id]) },
    { label: 'Pré-visualizar', icon: <Eye className="h-4 w-4" />, onClick: () => ac.preview(x.id) },
    { label: 'Duplicar', icon: <Copy className="h-4 w-4" />, disabled: ac.pending, onClick: () => ac.duplicar([x.id]) },
    { label: 'Mover para outro banco', icon: <FolderInput className="h-4 w-4" />, onClick: () => ac.mover([x.id]) },
    { label: 'Exportar', icon: <Download className="h-4 w-4" />, onClick: () => ac.exportar([x.id]) },
    { label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, disabled: ac.pending, onClick: () => ac.excluir([x.id]) },
  ]
  return (
    <DataTable<QuestaoPreviewLinha>
      rows={questoes} total={total} columns={columns} getRowId={(x) => x.id}
      defaultSort={{ key: 'numero', dir: 'asc' }}
      searchable searchPlaceholder="Pesquise pelo enunciado da questão"
      filters={(
        <>
          <FiltroPill label="Disciplina" valorAtual={filtros.disc} opcoes={disciplinasFiltro.map((v) => ({ value: v, label: v }))} onPick={(v) => setFiltro('disc', v)} />
          <FiltroPill label="Banca" valorAtual={filtros.banca} opcoes={bancasFiltro.map((v) => ({ value: v, label: v }))} onPick={(v) => setFiltro('banca', v)} />
          <FiltroPill label="Ano" valorAtual={filtros.ano == null ? null : String(filtros.ano)} opcoes={anosFiltro.map((a) => ({ value: String(a), label: String(a) }))} onPick={(v) => setFiltro('ano', v)} />
          <FiltroPill label="Dificuldade" valorAtual={filtros.dif} opcoes={Object.entries(DIF_LABEL).map(([value, label]) => ({ value, label }))} onPick={(v) => setFiltro('dif', v)} />
          <FiltroPill label="Situação" valorAtual={filtros.sit} opcoes={Object.entries(SIT_LABEL).map(([value, label]) => ({ value, label }))} onPick={(v) => setFiltro('sit', v)} />
        </>
      )}
      rowActions={rowActions}
      bulkActions={(s) => <BulkQuestoes s={s} ac={ac} />}
      onRowClick={(x) => onSel(x.id)} activeRowId={detalhe?.id ?? null} rowHeight="h-20"
      nomeSingular="questão" nomePlural="questões"
      empty={<span className="inline-flex flex-col items-center gap-2"><FileQuestion className="h-6 w-6 opacity-50" />Nenhuma questão encontrada. Importe um CSV ou use “Adicionar questão”.</span>}
    />
  )
}

// ───────────────────────────── Ações em lote ─────────────────────────────
function BulkBancos({ s, ac }: { s: DataTableSelection; ac: AcoesBanco }) {
  const ids = s.ids
  const bloqueado = s.allMatching || ids.length === 0
  const aviso = () => toast.message('Desmarque “selecionar todos” e escolha os bancos da página.')
  const run = (fn: (i: string[]) => void) => () => (bloqueado ? aviso() : fn(ids))
  return (
    <>
      <button type="button" onClick={run(ac.copiarLinks)} className={BTN_LOTE}><Link2 className="h-3.5 w-3.5" />Copiar links</button>
      <button type="button" onClick={run(ac.duplicar)} disabled={ac.pending} className={BTN_LOTE}><Copy className="h-3.5 w-3.5" />Duplicar</button>
      <button type="button" onClick={run(ac.mover)} className={BTN_LOTE}><FolderInput className="h-3.5 w-3.5" />Mover</button>
      <button type="button" onClick={run(ac.exportar)} className={BTN_LOTE}><Download className="h-3.5 w-3.5" />Exportar</button>
      <button type="button" onClick={() => (bloqueado ? aviso() : ac.excluir(ids))} disabled={ac.pending} className={BTN_LOTE_DEL}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
    </>
  )
}
function BulkQuestoes({ s, ac }: { s: DataTableSelection; ac: AcoesQuestao }) {
  const ids = s.ids
  const bloqueado = s.allMatching || ids.length === 0
  const aviso = () => toast.message('Desmarque “selecionar todos” e escolha as questões da página.')
  const run = (fn: (i: string[]) => void) => () => (bloqueado ? aviso() : fn(ids))
  return (
    <>
      <button type="button" onClick={run(ac.copiarLinks)} className={BTN_LOTE}><Link2 className="h-3.5 w-3.5" />Copiar links</button>
      <button type="button" onClick={run(ac.duplicar)} disabled={ac.pending} className={BTN_LOTE}><Copy className="h-3.5 w-3.5" />Duplicar</button>
      <button type="button" onClick={run(ac.mover)} className={BTN_LOTE}><FolderInput className="h-3.5 w-3.5" />Mover</button>
      <button type="button" onClick={run(ac.exportar)} className={BTN_LOTE}><Download className="h-3.5 w-3.5" />Exportar</button>
      <button type="button" onClick={run(ac.excluir)} disabled={ac.pending} className={BTN_LOTE_DEL}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
    </>
  )
}

// ───────────────────────────── Mover (diálogo) ─────────────────────────────
// modo "pasta": destino = pasta do cadastro (ou raiz). modo "banco": destino = outro banco.
function MoverDialog({ titulo, rotulo, modo, excluirId, onClose, onConfirmar }: {
  titulo: string; rotulo: string; modo: 'pasta' | 'banco'; excluirId: string | null
  onClose: () => void; onConfirmar: (destinoId: string | null) => Promise<boolean>
}) {
  const [itens, setItens] = React.useState<{ id: string; nome: string }[] | null>(null)
  const [destino, setDestino] = React.useState<string>('')
  const [salvando, setSalvando] = React.useState(false)
  React.useEffect(() => {
    let vivo = true
    listarDestinosBanco(excluirId).then((r) => { if (vivo) setItens(modo === 'pasta' ? r.pastas : r.bancos) }).catch(() => { if (vivo) setItens([]) })
    return () => { vivo = false }
  }, [modo, excluirId])
  const items = { ...(modo === 'pasta' ? { '': 'Raiz (sem pasta)' } : {}), ...Object.fromEntries((itens ?? []).map((i) => [i.id, i.nome])) }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{titulo}</DialogTitle>
        <div className="space-y-1.5 pt-3">
          <span className="block text-sm font-medium text-foreground">{rotulo}</span>
          {itens === null ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : (
            <Select value={destino} onValueChange={(v) => setDestino(v ?? '')} items={items}>
              <SelectTrigger><SelectValue placeholder={modo === 'pasta' ? 'Escolha a pasta' : 'Escolha o banco'} /></SelectTrigger>
              <SelectContent>
                {modo === 'pasta' && <SelectItem value="">Raiz (sem pasta)</SelectItem>}
                {itens.map((i) => <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {itens !== null && itens.length === 0 && (
            <p className="text-xs text-muted-foreground">{modo === 'pasta' ? 'Nenhuma pasta cadastrada — só é possível mover para a raiz.' : 'Não há outro banco para receber as questões.'}</p>
          )}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancelar</button>
          <button disabled={salvando || itens === null || (modo === 'banco' && !destino)}
            onClick={async () => { setSalvando(true); const ok = await onConfirmar(destino || null); if (!ok) setSalvando(false) }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Mover
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────── Pílula de filtro ─────────────────────────────
function FiltroPill({ label, valorAtual, opcoes, onPick }: {
  label: string; valorAtual: string | null; opcoes: { value: string; label: string }[]; onPick: (v: string | null) => void
}) {
  const ativo = valorAtual != null
  const texto = ativo ? (opcoes.find((o) => o.value === valorAtual)?.label ?? valorAtual) : label
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('inline-flex h-9 max-w-[14rem] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold outline-none transition-colors',
        ativo ? 'border-primary bg-primary/10 text-primary' : 'border-dashed bg-card text-foreground hover:bg-muted')}>
        <span className="truncate">{texto}</span><ChevronDown className="h-[13px] w-[13px] shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] min-w-[200px] overflow-auto">
        <DropdownMenuItem onClick={() => onPick(null)} className={cn(!ativo && 'font-semibold text-primary')}>Todos</DropdownMenuItem>
        {opcoes.length > 0 && <DropdownMenuSeparator />}
        {opcoes.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem opções disponíveis.</div>}
        {opcoes.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onPick(o.value)} className={cn(o.value === valorAtual && 'font-semibold text-primary')}>{o.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ───────────────────────────── Painel do banco ─────────────────────────────
function PainelBanco({ b, ac, onEditar }: { b: BancoRow; ac: AcoesBanco; onEditar: () => void }) {
  const pending = ac.pending
  const acao = 'flex h-[38px] items-center gap-2 rounded-[11px] border px-3 text-left text-[12.5px] font-bold leading-tight text-foreground hover:bg-muted disabled:opacity-60'
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <b className="block text-[13.5px] leading-[1.35] text-foreground">{b.nome}</b>
          <span className="block text-xs leading-normal text-muted-foreground">{b.tipo === 'discursiva' ? 'Banco discursivo' : 'Banco objetivo'}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-[3px] rounded-[18px] border bg-card px-[18px] py-4">
          <b className="text-[26px] font-extrabold leading-tight tracking-[-0.04em] text-foreground">{b.questoes.toLocaleString('pt-BR')}</b>
          <span className="text-[12.5px] font-bold text-foreground">{b.questoes === 1 ? 'questão' : 'questões'}</span>
        </div>
        <div className="flex flex-col gap-[3px] rounded-[18px] border bg-card px-[18px] py-4">
          <b className="text-[15px] font-extrabold leading-tight text-foreground">{formatBrt(b.atualizadoEm)?.split(' ')[0] ?? '—'}</b>
          <span className="text-[12.5px] font-bold text-foreground">atualização</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <b className="text-[11px] font-extrabold tracking-[.16em] text-muted-foreground">CLASSIFICAÇÃO PADRÃO</b>
        <LinhaClass label="Disciplina" valor={b.disciplina} />
        <LinhaClass label="Banca" valor={b.banca} />
      </div>
      <button type="button" onClick={() => ac.abrir(b.id)} style={GRAD_PRIMARY}
        className="inline-flex h-9 items-center gap-2 rounded-[11px] px-3.5 text-[13px] font-extrabold text-primary-foreground"><BookOpen className="h-[15px] w-[15px]" />Abrir banco</button>
      <Link href="/admin/questoes/nova" className="inline-flex h-9 items-center justify-center gap-2 rounded-[11px] border bg-card px-3.5 text-[13px] font-bold text-foreground hover:bg-muted"><Plus className="h-[15px] w-[15px]" />Adicionar questão</Link>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={acao} onClick={onEditar}><Pencil className="h-[15px] w-[15px] shrink-0 text-primary" />Editar</button>
        <button type="button" className={acao} onClick={() => ac.renomear(b)} disabled={pending}><Pencil className="h-[15px] w-[15px] shrink-0 text-primary" />Renomear</button>
        <button type="button" className={acao} onClick={() => ac.copiarLinks([b.id])}><Link2 className="h-[15px] w-[15px] shrink-0 text-primary" />Copiar link</button>
        <button type="button" className={acao} onClick={() => ac.duplicar([b.id])} disabled={pending}><Copy className="h-[15px] w-[15px] shrink-0 text-primary" />Duplicar</button>
        <button type="button" className={acao} onClick={() => ac.mover([b.id])}><FolderInput className="h-[15px] w-[15px] shrink-0 text-primary" />Mover</button>
        <button type="button" className={acao} onClick={() => ac.exportar([b.id])}><Download className="h-[15px] w-[15px] shrink-0 text-primary" />Exportar CSV</button>
        <button type="button" className={acao} onClick={() => ac.excluir([b.id], b.nome)} disabled={pending}><Trash2 className="h-[15px] w-[15px] shrink-0 text-primary" />Excluir</button>
      </div>
    </>
  )
}

// ───────────────────────────── Painel da questão ─────────────────────────────
function PainelQuestao({ detalhe, ac }: { detalhe: QuestaoDetalhe; ac: AcoesQuestao }) {
  const c = detalhe.classificacao
  const acao = 'flex h-[38px] items-center gap-2 rounded-[11px] border px-3 text-left text-[12.5px] font-bold leading-tight text-foreground hover:bg-muted disabled:opacity-60'
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">Questão {detalhe.numero}</span>
        <Chip tom="neutro">{detalhe.tipo === 'discursiva' ? 'Discursiva' : 'Objetiva'}</Chip>
        {detalhe.gabarito && <Chip tom="ok">Gabarito {detalhe.gabarito}</Chip>}
      </div>
      <p className="text-sm font-bold leading-relaxed text-foreground">{detalhe.enunciado || '—'}</p>
      {detalhe.tipo !== 'discursiva' && detalhe.alternativas.length > 0 && (
        <div className="space-y-2">
          {detalhe.alternativas.map((a, i) => (
            <div key={i} className={cn('flex gap-2.5 rounded-xl border p-2.5', a.correta ? 'border-emerald-500 bg-emerald-500/10' : 'bg-card')}>
              <span className={cn('text-xs font-bold', a.correta ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}>{a.letra}</span>
              <span className="text-xs leading-relaxed text-foreground">{a.texto}</span>
            </div>
          ))}
        </div>
      )}
      {detalhe.explicacao && (
        <div className="space-y-2 border-t pt-4">
          <b className="text-[11px] font-extrabold tracking-[.16em] text-muted-foreground">EXPLICAÇÃO</b>
          <p className="text-xs leading-relaxed text-muted-foreground">{detalhe.explicacao}</p>
        </div>
      )}
      <div className="space-y-1 border-t pt-4">
        <b className="text-[11px] font-extrabold tracking-[.16em] text-muted-foreground">CLASSIFICAÇÃO</b>
        <LinhaClass label="Disciplina" valor={c.disciplina} />
        <LinhaClass label="Assunto" valor={c.assunto} />
        <LinhaClass label="Prova" valor={c.prova} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/questoes/${detalhe.id}/editar`} style={GRAD_PRIMARY}
          className="inline-flex h-9 items-center gap-2 rounded-[11px] px-3.5 text-[13px] font-extrabold text-primary-foreground"><Pencil className="h-[15px] w-[15px]" />Editar questão</Link>
        <button type="button" onClick={() => ac.preview(detalhe.id)}
          className="inline-flex h-9 items-center gap-2 rounded-[11px] border bg-card px-3.5 text-[13px] font-bold text-foreground hover:bg-muted"><Eye className="h-[15px] w-[15px]" />Pré-visualizar</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={acao} onClick={() => ac.copiarLinks([detalhe.id])}><Link2 className="h-[15px] w-[15px] shrink-0 text-primary" />Copiar link</button>
        <button type="button" className={acao} onClick={() => ac.duplicar([detalhe.id])} disabled={ac.pending}><Copy className="h-[15px] w-[15px] shrink-0 text-primary" />Duplicar</button>
        <button type="button" className={acao} onClick={() => ac.mover([detalhe.id])}><FolderInput className="h-[15px] w-[15px] shrink-0 text-primary" />Mover</button>
        <button type="button" className={acao} onClick={() => ac.exportar([detalhe.id])}><Download className="h-[15px] w-[15px] shrink-0 text-primary" />Exportar</button>
        <button type="button" className={acao} onClick={() => ac.excluir([detalhe.id])} disabled={ac.pending}><Trash2 className="h-[15px] w-[15px] shrink-0 text-primary" />Excluir</button>
      </div>
      <div className="space-y-2 border-t pt-4">
        <b className="text-[11px] font-extrabold tracking-[.16em] text-muted-foreground">IMPORTAR CSV</b>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Colunas: banco_nome, questao_enunciado, alternativa_texto, alternativa_correta (1 ou 0), questao_explicacao. Discursiva: uma linha, sem alternativa. Até 30.000 linhas.
        </p>
      </div>
    </>
  )
}

function LinhaClass({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t py-2 text-[13px] first:border-t-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-bold text-foreground">{valor ?? '—'}</span>
    </div>
  )
}

function Chip({ children, tom }: { children: React.ReactNode; tom: 'neutro' | 'ok' | 'warn' | 'bad' | 'info' | 'brand' }) {
  const cls = {
    neutro: 'bg-muted text-muted-foreground',
    ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    bad: 'bg-destructive/10 text-destructive',
    info: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    brand: 'bg-primary/10 text-primary',
  }[tom]
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold', cls)}>{children}</span>
}

// ───────────────────────────── Pré-visualizar (modal) ─────────────────────────────
function PreviewDialog({ detalhe, onClose }: { detalhe: QuestaoDetalhe; onClose: () => void }) {
  const c = detalhe.classificacao
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="w-[min(680px,calc(100vw-2rem))] max-w-[min(680px,calc(100vw-2rem))] sm:max-w-[min(680px,calc(100vw-2rem))]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">Questão {detalhe.numero}</span>
          <Chip tom="neutro">{detalhe.tipo === 'discursiva' ? 'Discursiva' : 'Objetiva'}</Chip>
          {detalhe.gabarito && <Chip tom="ok">Gabarito {detalhe.gabarito}</Chip>}
        </div>
        <DialogTitle className="sr-only">Pré-visualização da questão</DialogTitle>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pt-1">
          <p className="text-sm font-semibold leading-relaxed text-foreground">{detalhe.enunciado || '—'}</p>
          {detalhe.tipo !== 'discursiva' && detalhe.alternativas.length > 0 && (
            <div className="space-y-2">
              {detalhe.alternativas.map((a, i) => (
                <div key={i} className={cn('flex gap-3 rounded-xl border p-3', a.correta ? 'border-emerald-500 bg-emerald-500/10' : 'bg-card')}>
                  <span className={cn('text-sm font-bold', a.correta ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}>{a.letra}</span>
                  <span className="text-sm leading-relaxed text-foreground">{a.texto}</span>
                </div>
              ))}
            </div>
          )}
          {detalhe.explicacao && (
            <div className="space-y-1.5 border-t pt-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Explicação</div>
              <p className="text-sm leading-relaxed text-muted-foreground">{detalhe.explicacao}</p>
            </div>
          )}
          <div className="space-y-1 border-t pt-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Classificação</div>
            <LinhaClass label="Disciplina" valor={c.disciplina} />
            <LinhaClass label="Assunto" valor={c.assunto} />
            <LinhaClass label="Prova" valor={c.prova} />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2 border-t pt-4">
          <button onClick={onClose} className="rounded-lg border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Fechar</button>
          <Link href={`/admin/questoes/${detalhe.id}/editar`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
            <Pencil className="h-4 w-4" /> Editar questão
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}
