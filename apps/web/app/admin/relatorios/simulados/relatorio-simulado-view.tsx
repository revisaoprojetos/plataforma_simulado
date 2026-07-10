'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { KpiCard, Painel, Hero, BarrasH, Colunas, ListaBusca, Vazio, baixarCsv } from '@/components/admin/relatorios/viz'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import type { TipoSimulado } from '@/lib/simulado/tipo'
import { Users, CheckCircle2, Target, Trophy, Clock, Crown, Medal, ClipboardList, BookOpen, BarChart3, ListChecks, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'

export type LinhaExportSimulado = {
  posicao: number
  nome: string
  email: string
  telefone: string
  classificacao: string
  pontuacao: number | null
  acertos: number
  erros: number
  emBranco: number
  media: number
  tempoTotal: string
  mediaTempo: string
  porDisciplina: number[] // acertos por disciplina, alinhado a `disciplinas`
}

export type DadosRelatorioSimulado = {
  titulo: string
  tipo: TipoSimulado | null
  totalSessoes: number
  finalizadas: number
  notaMedia: number | null
  melhorNota: number | null
  acertoMedio: number | null
  tempoMedioMin: number | null
  porDisciplina: { nome: string; pct: number; ac: number; tt: number }[]
  porQuestao: { rotulo: string; pct: number; ac: number; tt: number }[]
  distribuicao: { faixa: string; alunos: number }[]
  ranking: { pos: number; nome: string; nota: number | null; acerto: number; tempo: string }[]
  disciplinas: string[]
  linhas: LinhaExportSimulado[]
}

// Cabeçalho na ordem pedida + uma coluna por disciplina.
const COLUNAS_FIXAS = ['Posição', 'Nome', 'E-mail', 'Telefone', 'Classificação', 'Pontuação', 'Acertos', 'Erros', 'Em branco', 'Média (%)', 'Tempo total', 'Média de tempo']

export function RelatorioSimuladoView({ d, print }: { d: DadosRelatorioSimulado; print?: boolean }) {
  const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
  const [gerando, setGerando] = useState(false)

  const cabecalho = [...COLUNAS_FIXAS, ...d.disciplinas]
  const nomeArq = (d.titulo.trim() || 'simulado').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') + '_relatorio'
  // Linha por estudante como valores tipados (números onde faz sentido) — usada no Excel e no CSV.
  const matriz = d.linhas.map((l) => [
    l.posicao, l.nome, l.email, l.telefone, l.classificacao,
    l.pontuacao, l.acertos, l.erros, l.emBranco, l.media, l.tempoTotal, l.mediaTempo, ...l.porDisciplina,
  ])

  function exportarCsv() {
    const nota1 = (n: number | null) => (n == null ? '' : n.toFixed(1).replace('.', ','))
    const linhasCsv: (string | number | null)[][] = [
      cabecalho,
      ...d.linhas.map((l) => [
        l.posicao, l.nome, l.email, l.telefone, l.classificacao,
        nota1(l.pontuacao), l.acertos, l.erros, l.emBranco, l.media, l.tempoTotal, l.mediaTempo, ...l.porDisciplina,
      ]),
    ]
    baixarCsv(nomeArq, linhasCsv)
  }

  async function exportarExcel() {
    if (gerando) return
    setGerando(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Relatório', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] })
      ws.addRow(cabecalho)
      for (const linha of matriz) ws.addRow(linha.map((v) => (v == null ? '' : v)))
      // Estilo do cabeçalho.
      const head = ws.getRow(1)
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      head.height = 24
      head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B21B6' } } })
      // Larguras: colunas de texto mais largas, numéricas estreitas.
      ws.columns.forEach((col, i) => { col.width = i === 1 ? 26 : i === 2 ? 26 : i < 5 ? 16 : 12 })
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cabecalho.length } }
      const buf = await wb.xlsx.writeBuffer()
      baixarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${nomeArq}.xlsx`)
    } catch (e) {
      console.error(e)
      toast.error('Não foi possível gerar o Excel. Tente o CSV.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="space-y-5">
      <Hero icon={<ClipboardList className="h-6 w-6" />} tom="primary" titulo={d.titulo}
        badge={<TipoSimuladoBadge tipo={d.tipo} />} subtitulo="Análise completa do simulado"
        acoes={print ? undefined : <ExportarSimulado gerando={gerando} vazio={d.linhas.length === 0} onExcel={exportarExcel} onCsv={exportarCsv} />} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Sessões" valor={d.totalSessoes} sub={`${d.finalizadas} finalizadas`} icon={<Users className="h-4 w-4" />} tom="primary" />
        <KpiCard label="Nota média" valor={nota(d.notaMedia)} sub={`melhor ${nota(d.melhorNota)}`} icon={<Trophy className="h-4 w-4" />} tom="amber" />
        <KpiCard label="Acerto médio" valor={d.acertoMedio != null ? `${d.acertoMedio}%` : '—'} icon={<Target className="h-4 w-4" />} tom="emerald" />
        <KpiCard label="Finalizadas" valor={d.finalizadas} sub={d.totalSessoes ? `${Math.round((d.finalizadas / d.totalSessoes) * 100)}% do total` : '—'} icon={<CheckCircle2 className="h-4 w-4" />} tom="sky" />
        <KpiCard label="Tempo médio" valor={d.tempoMedioMin != null ? `${d.tempoMedioMin}min` : '—'} icon={<Clock className="h-4 w-4" />} tom="violet" />
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Acerto por disciplina" sub="Verde = domínio alto · vermelho = ponto fraco" tom="emerald" icon={<BookOpen className="h-4 w-4" />}>
          <BarrasH itens={d.porDisciplina.map((x) => ({ rotulo: x.nome, valor: x.pct, sub: `${x.ac}/${x.tt}` }))} pct heat />
        </Painel>
        <Painel titulo="Distribuição de notas" sub="Estudantes por faixa de nota" tom="violet" icon={<BarChart3 className="h-4 w-4" />}>
          <Colunas itens={d.distribuicao.map((x) => ({ rotulo: x.faixa, valor: x.alunos }))} tom="violet" altura={200} formato={(n) => `${n} aluno(s)`} />
        </Painel>
      </div>

      <Painel titulo="Acerto por questão" sub="Ordenado das mais difíceis para as mais fáceis (menor acerto primeiro)" tom="amber" icon={<ListChecks className="h-4 w-4" />}>
        {d.porQuestao.length === 0 ? <Vazio>Sem respostas ainda.</Vazio> : (
          <Colunas itens={d.porQuestao.map((x) => ({ rotulo: x.rotulo, valor: x.pct }))} tom="amber" altura={220} formato={(n) => `${n}%`} />
        )}
      </Painel>

      {/* Ranking */}
      <Painel titulo="Ranking dos estudantes" sub={d.ranking.length ? `${d.ranking.length} classificado(s)` : undefined} tom="primary" icon={<Trophy className="h-4 w-4" />}>
        <ListaBusca itens={d.ranking} placeholder="Buscar estudante pelo nome…" vazio="Sem sessões finalizadas ainda." print={print}
          filtro={(r, t) => r.nome.toLowerCase().includes(t)}>
          {(r) => (
            <div key={r.pos} className={`flex items-center gap-4 rounded-xl border p-3 ${r.pos <= 3 ? 'bg-gradient-to-r from-amber-50/60 to-transparent dark:from-amber-950/20' : 'bg-card'}`}>
              <Posicao pos={r.pos} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.nome}</div>
                <div className="text-xs text-muted-foreground">{r.acerto}% de acerto · {r.tempo}</div>
              </div>
              <div className="hidden w-40 shrink-0 sm:block">
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.acerto}%` }} /></div>
              </div>
              <div className="shrink-0 border-l pl-4 text-right">
                <div className="text-xl font-bold tabular-nums text-primary">{nota(r.nota)}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">nota</div>
              </div>
            </div>
          )}
        </ListaBusca>
      </Painel>
    </div>
  )
}

function ExportarSimulado({ gerando, vazio, onExcel, onCsv }: { gerando: boolean; vazio: boolean; onExcel: () => void; onCsv: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onExcel} disabled={gerando || vazio}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">
        {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
      </button>
      <button type="button" onClick={onCsv} disabled={vazio}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted disabled:opacity-60">
        <FileText className="h-4 w-4" /> CSV
      </button>
    </div>
  )
}

function baixarBlob(blob: Blob, nomeArq: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nomeArq
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(a.href)
}

function Posicao({ pos }: { pos: number }) {
  if (pos === 1) return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-sm"><Crown className="h-5 w-5" /></span>
  if (pos === 2) return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm"><Medal className="h-5 w-5" /></span>
  if (pos === 3) return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-amber-700 text-white shadow-sm"><Medal className="h-5 w-5" /></span>
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold tabular-nums text-muted-foreground">{pos}º</span>
}
