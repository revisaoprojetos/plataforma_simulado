'use client'

// BANCO (editar) — fiel ao Banco.png. Esquerda: card Título + Classificação padrão, depois as
// Questões (segmentado Todas/Objetivas/Discursivas + lista). Direita: stats (questões / usos em quiz),
// ONDE É USADO, IMPORTAR e ações. Data layer reusado (renomear/duplicar/excluir/classificação/import).

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, ChevronRight, Upload, Plus, Download, Copy, Pencil, Trash2, Loader2, Save, Link2,
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { QuestoesTabelaBase, type QuestaoLinha } from '@/components/admin/questoes-tabela-base'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'
import { removerQuestoes, renomearBanco, duplicarBanco, excluirBanco } from '@/app/admin/banco-questoes/actions'
import { salvarClassificacaoPadrao } from '../actions'
import { codigoQuestao } from '@/lib/codigo-questao'
import { formatBrt } from '@/lib/brt'
import { ImportarQuestoesModal } from '../importar-questoes-modal'

export type QuestaoDetalheRow = QuestaoLinha
export type OpcoesCadastro = {
  disciplinas: { id: string; nome: string }[]
  assuntos: { id: string; nome: string }[]
  bancas: { id: string; nome: string }[]
  orgaos: { id: string; nome: string }[]
}
type ClassSel = { disciplinaId: string; assuntoId: string; bancaId: string; orgaoId: string }
type Aba = 'todas' | 'objetivas' | 'discursivas'

const BASE = '/admin/conteudos/materiais/questoes'

export function BancoDetalhe({
  banco, questoes, usosEmQuiz, opcoes, classPadraoInicial,
}: {
  banco: { id: string; nome: string; tipo: 'objetiva' | 'discursiva'; cor: string | null; criadoEm: string | null }
  questoes: QuestaoDetalheRow[]
  usosEmQuiz: number
  opcoes: OpcoesCadastro
  classPadraoInicial: ClassSel
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [importOpen, setImportOpen] = React.useState(false)
  const cor = banco.cor ?? '#6d28d9'

  // Título (nome do banco) — salva ao sair do campo, se mudou.
  const [titulo, setTitulo] = React.useState(banco.nome)
  const [salvandoTitulo, startTitulo] = React.useTransition()
  React.useEffect(() => { setTitulo(banco.nome) }, [banco.nome])
  function salvarTitulo() {
    const nome = titulo.trim()
    if (!nome || nome === banco.nome) { setTitulo(banco.nome); return }
    startTitulo(async () => {
      const r = await renomearBanco(banco.id, nome)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar o título.'); setTitulo(banco.nome); return }
      toast.success('Título salvo.'); router.refresh()
    })
  }

  // Classificação padrão (escolhe DO CADASTRO).
  const [cls, setCls] = React.useState<ClassSel>(classPadraoInicial)
  const [salvandoCls, startCls] = React.useTransition()
  const clsMudou = JSON.stringify(cls) !== JSON.stringify(classPadraoInicial)
  function salvarCls() {
    startCls(async () => {
      const r = await salvarClassificacaoPadrao(banco.id, cls)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar.'); return }
      toast.success('Classificação padrão salva.'); router.refresh()
    })
  }

  // Segmento Todas/Objetivas/Discursivas.
  const [aba, setAba] = React.useState<Aba>('todas')
  const questoesFiltradas = aba === 'todas' ? questoes : aba === 'discursivas' ? questoes.filter((q) => q.tipo === 'discursiva') : questoes.filter((q) => q.tipo !== 'discursiva')

  function renomear() {
    startTransition(async () => {
      const nome = await pedirTexto({ titulo: 'Renomear banco', label: 'Nome do banco', valorInicial: banco.nome })
      if (nome == null) return
      const r = await renomearBanco(banco.id, nome)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao renomear.'); return }
      toast.success('Banco renomeado.'); router.refresh()
    })
  }
  function duplicar() {
    startTransition(async () => {
      const r = await duplicarBanco(banco.id)
      if (!r.ok || !r.id) { toast.error(r.error ?? 'Erro ao duplicar.'); return }
      toast.success('Banco duplicado.'); router.push(`${BASE}/${r.id}`)
    })
  }
  function excluir() {
    startTransition(async () => {
      const ok = await confirmar({ titulo: 'Excluir banco', mensagem: `Enviar "${banco.nome}" para a lixeira? As questões não são apagadas.`, destrutivo: true, confirmar: 'Excluir' })
      if (!ok) return
      const r = await excluirBanco(banco.id)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao excluir.'); return }
      toast.success('Banco enviado para a lixeira.'); router.push(BASE)
    })
  }

  function exportarCsv() {
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const cab = ['Código', 'Enunciado', 'Tipo', 'Disciplina', 'Assunto', 'Assunto específico', 'Banca', 'Órgão', 'Ano', 'Status']
    const linhas = questoes.map((q) => [
      codigoQuestao(q.id), q.enunciado, q.tipo === 'discursiva' ? 'Discursiva' : (q.formato === 'certo_errado' ? 'Certo/Errado' : 'Múltipla'),
      q.disciplina, q.assunto, q.assuntoDetalhe, q.banca, q.orgao, q.ano, q.status,
    ].map(esc).join(','))
    const csv = '﻿' + [cab.join(','), ...linhas].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `banco-${banco.nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="w-full space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href={BASE} aria-label="Voltar" title="Voltar" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-card text-foreground transition-colors hover:bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
        <span aria-hidden className="h-5 w-px bg-border" />
        <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
          <Link href={BASE} className="font-semibold text-muted-foreground hover:text-foreground">Bancos de questões</Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="truncate font-semibold text-foreground">{banco.nome}</span>
        </nav>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Banco de questões{banco.tipo === 'discursiva' ? ' · Discursiva' : ''}</p>
          <h1 className="text-2xl font-bold tracking-tight">{banco.nome}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{questoes.length} {questoes.length === 1 ? 'questão' : 'questões'}</span>
            {banco.criadoEm && <span>Atualizado em {formatBrt(banco.criadoEm)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"><Upload className="h-4 w-4" /> Importar CSV</button>
          <Link href="/admin/questoes/nova" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"><Plus className="h-4 w-4" /> Adicionar questão</Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {/* Card: Título + Classificação padrão */}
          <div className="rounded-2xl border bg-card px-5">
            <div className="grid gap-6 border-b py-5 sm:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">Título</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Nome do banco. Aparece ao montar quiz e simulado.</p>
              </div>
              <div className="relative">
                <input
                  value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={salvarTitulo}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="h-11 w-full rounded-xl border bg-background px-3.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {salvandoTitulo && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
            </div>
            <div className="grid gap-6 py-5 sm:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">Classificação padrão</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Preenche as questões novas deste banco.</p>
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <CampoCadastro label="Disciplina" value={cls.disciplinaId} onChange={(v) => setCls({ ...cls, disciplinaId: v })} opcoes={opcoes.disciplinas} />
                  <CampoCadastro label="Assunto" value={cls.assuntoId} onChange={(v) => setCls({ ...cls, assuntoId: v })} opcoes={opcoes.assuntos} />
                  <CampoCadastro label="Órgão" value={cls.orgaoId} onChange={(v) => setCls({ ...cls, orgaoId: v })} opcoes={opcoes.orgaos} />
                  <CampoCadastro label="Banca" value={cls.bancaId} onChange={(v) => setCls({ ...cls, bancaId: v })} opcoes={opcoes.bancas} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Link href="/admin/conteudos/classificacao" className="text-xs font-medium text-primary hover:underline">Gerenciar cadastro →</Link>
                  <button type="button" onClick={salvarCls} disabled={!clsMudou || salvandoCls} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                    {salvandoCls ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Questões */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold tracking-tight text-foreground">Questões</h2>
              <div className="flex items-center gap-2">
                <AdicionarQuestoesDialog bancoId={banco.id} disciplinas={opcoes.disciplinas} />
                <Segmented aba={aba} onChange={setAba} />
              </div>
            </div>
            {questoesFiltradas.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                {questoes.length === 0 ? 'Nenhuma questão neste banco. Use “Adicionar questão” (do acervo) ou importe um CSV.' : 'Nenhuma questão nesse filtro.'}
              </div>
            ) : (
              <QuestoesTabelaBase
                questoes={questoesFiltradas}
                titulo={banco.nome}
                cor={cor}
                semCabecalho
                editHrefBase="/admin/questoes"
                onRemover={(ids) => removerQuestoes(banco.id, ids)}
              />
            )}
            <Link href="/admin/questoes/nova" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed py-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5">
              <Plus className="h-4 w-4" /> Adicionar questão
            </Link>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat valor={questoes.length} label="questões" />
            <Stat valor={usosEmQuiz} label="usos em quiz" />
          </div>

          <div className="space-y-2 rounded-2xl border bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Onde é usado</div>
            {usosEmQuiz > 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">Este banco é usado em {usosEmQuiz} {usosEmQuiz === 1 ? 'conteúdo' : 'conteúdos'} (quiz/simulado/aula).</p>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">Ainda não está em nenhum quiz, simulado ou aula. Para usar, crie um conteúdo do tipo Quiz e escolha este banco.</p>
            )}
          </div>

          <div className="space-y-2 rounded-2xl border bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Importar</div>
            <p className="text-xs leading-relaxed text-muted-foreground">Use o modelo CSV para trazer muitas questões de uma vez. As colunas de classificação são opcionais.</p>
            <button type="button" onClick={() => setImportOpen(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"><Upload className="h-4 w-4" /> Importar CSV</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <AcaoItem icon={Download} label="Exportar CSV" onClick={exportarCsv} disabled={questoes.length === 0} />
            <AcaoItem icon={Link2} label="Copiar link" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}${BASE}/${banco.id}`).then(() => toast.success('Link copiado.')).catch(() => toast.error('Não foi possível copiar o link.')) }} />
            <AcaoItem icon={Copy} label="Duplicar banco" onClick={duplicar} disabled={pending} />
            <AcaoItem icon={Pencil} label="Renomear" onClick={renomear} disabled={pending} />
            <AcaoItem icon={Trash2} label="Excluir" onClick={excluir} disabled={pending} destrutivo />
          </div>
        </aside>
      </div>

      {/* Importar CSV neste banco */}
      <ImportarQuestoesModal open={importOpen} onOpenChange={setImportOpen} bancoId={banco.id} bancoNome={banco.nome} onImported={() => router.refresh()} />
    </div>
  )
}

function Segmented({ aba, onChange }: { aba: Aba; onChange: (a: Aba) => void }) {
  const itens: { k: Aba; label: string }[] = [
    { k: 'todas', label: 'Todas' }, { k: 'objetivas', label: 'Objetivas' }, { k: 'discursivas', label: 'Discursivas' },
  ]
  return (
    <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
      {itens.map((i) => (
        <button key={i.k} type="button" onClick={() => onChange(i.k)}
          className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            aba === i.k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

function CampoCadastro({ label, value, onChange, opcoes }: { label: string; value: string; onChange: (v: string) => void; opcoes: { id: string; nome: string }[] }) {
  const items = { '': `— Nenhum(a) —`, ...Object.fromEntries(opcoes.map((o) => [o.id, o.nome])) }
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')} items={items}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="">— Nenhum(a) —</SelectItem>
          {opcoes.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function Stat({ valor, label }: { valor: number; label: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-2xl font-bold leading-none tabular-nums">{valor.toLocaleString('pt-BR')}</p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

function AcaoItem({ icon: Icon, label, onClick, disabled, destrutivo }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; disabled?: boolean; destrutivo?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn('flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-left text-xs font-semibold transition-colors disabled:opacity-40',
        destrutivo ? 'text-foreground hover:bg-destructive/10 hover:text-destructive' : 'text-foreground hover:bg-muted')}>
      <Icon className={cn('h-4 w-4 shrink-0', destrutivo ? 'text-destructive' : 'text-primary')} /> {label}
    </button>
  )
}
