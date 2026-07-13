'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KpiCard, Painel, Hero, BarrasH, Colunas, ListaBusca, Vazio, baixarCsv } from '@/components/admin/relatorios/viz'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import type { TipoSimulado } from '@/lib/simulado/tipo'
import { cn } from '@/lib/utils'
import { Users, CheckCircle2, Target, Trophy, Clock, Crown, Medal, ClipboardList, BookOpen, BarChart3, ListChecks, FileSpreadsheet, FileText, Loader2, LayoutDashboard, Search, ChevronDown, Check, X, LogIn, Eye, Download, Activity, AlertTriangle, Timer, Gauge, Repeat, Lock, TrendingUp, TrendingDown, Minus } from 'lucide-react'

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

export type QuestaoDetalhe = {
  ordem: number
  disciplina: string
  tipo: string | null
  enunciado: string
  respondida: number
  acertos: number
  erros: number
  pct: number
  tempoMedioSeg: number | null
  alternativas: { texto: string; correta: boolean; escolhas: number; pctEscolha: number }[]
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
  questoes: QuestaoDetalhe[]
  engajamento: {
    atribuidos: number
    acessaram: number
    finalizaram: number
    visualizaramRelatorio: number
    baixaramRelatorio: number
  }
  porClassificacao: { chave: string; label: string; alunos: number; notaMedia: number | null; acertoMedio: number | null }[]
  dispersao: { mediana: number | null; desvio: number | null; min: number | null; max: number | null }
  histogramaAcertos: { rotulo: string; alunos: number }[]
  config: { modo: string; modoLabel: string; permiteVarias: boolean; tentativasPermitidas: string; politica: string; politicaLabel: string }
  tentativasResumo: { totalTentativas: number; mediaPorAluno: number; alunosComMaisDeUma: number }
  porAlunoTentativas: { nome: string; tentativas: number; primeiraNota: number | null; notaConsiderada: number | null; delta: number | null }[]
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
      const PURPLE = 'FF5B21B6', LIGHT = 'FFEEE9F9'
      const letra = (i: number) => String.fromCharCode(65 + i)
      const nnum = (n: number | null) => (n == null ? '—' : Number(n.toFixed(1)))
      const pctBase = (v: number, b: number) => (b > 0 ? `${Math.round((v / b) * 100)}%` : '—')

      // ── Aba 1: Dashboard (visão geral do simulado) ──
      const wsD = wb.addWorksheet('Dashboard', { views: [{ showGridLines: false }] })
      wsD.columns = [{ width: 34 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 12 }]
      const secao = (txt: string) => {
        const row = wsD.addRow([txt]); row.height = 20
        for (let c = 1; c <= 5; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } }
        row.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
        row.getCell(1).alignment = { vertical: 'middle' }
        wsD.mergeCells(row.number, 1, row.number, 5)
      }
      const thead = (cols: string[]) => {
        const row = wsD.addRow(cols); row.font = { bold: true }
        for (let c = 1; c <= cols.length; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
      }
      const branco = () => wsD.addRow([])
      const tipoLabel = d.tipo === 'discursiva' ? 'Discursiva' : d.tipo === 'objetiva' ? 'Objetiva' : d.tipo ? 'Mista' : 'Simulado'

      const tTit = wsD.addRow([d.titulo || 'Simulado']); tTit.getCell(1).font = { bold: true, size: 16 }; wsD.mergeCells(tTit.number, 1, tTit.number, 5)
      const tSub = wsD.addRow([`Relatório do simulado — ${tipoLabel}`]); tSub.getCell(1).font = { italic: true, color: { argb: 'FF777777' } }; wsD.mergeCells(tSub.number, 1, tSub.number, 5)
      branco()

      secao('Resumo')
      thead(['Indicador', 'Valor'])
      wsD.addRow(['Estudantes', d.totalSessoes])
      wsD.addRow(['Finalizaram', d.finalizadas])
      wsD.addRow(['Nota média', nnum(d.notaMedia)])
      wsD.addRow(['Melhor nota', nnum(d.melhorNota)])
      wsD.addRow(['Acerto médio (%)', d.acertoMedio ?? '—'])
      wsD.addRow(['Tempo médio (min)', d.tempoMedioMin ?? '—'])
      wsD.addRow(['Nota mediana', nnum(d.dispersao.mediana)])
      wsD.addRow(['Desvio-padrão', d.dispersao.desvio ?? '—'])
      wsD.addRow(['Menor / maior nota', `${nnum(d.dispersao.min)} / ${nnum(d.dispersao.max)}`])
      branco()

      secao('Configuração de aplicação')
      thead(['Item', 'Valor'])
      wsD.addRow(['Modo', d.config.modoLabel])
      wsD.addRow(['Tentativas permitidas', d.config.tentativasPermitidas])
      wsD.addRow(['Nota considerada', d.config.politicaLabel])
      if (d.config.permiteVarias) {
        wsD.addRow(['Total de tentativas', d.tentativasResumo.totalTentativas])
        wsD.addRow(['Média de tentativas por aluno', d.tentativasResumo.mediaPorAluno])
        wsD.addRow(['Alunos com +1 tentativa', d.tentativasResumo.alunosComMaisDeUma])
      }
      branco()

      secao('Por classificação (Passaporte × Normal)')
      thead(['Classificação', 'Alunos', 'Nota média', 'Acerto (%)'])
      if (d.porClassificacao.length === 0) wsD.addRow(['—', 0, '—', '—'])
      for (const c of d.porClassificacao) wsD.addRow([c.label, c.alunos, nnum(c.notaMedia), c.acertoMedio ?? '—'])
      branco()

      secao('Engajamento')
      thead(['Etapa', 'Alunos', '%'])
      const eg = d.engajamento
      wsD.addRow(['Atribuídos', eg.atribuidos, '100%'])
      wsD.addRow(['Acessaram', eg.acessaram, pctBase(eg.acessaram, eg.atribuidos)])
      wsD.addRow(['Finalizaram', eg.finalizaram, pctBase(eg.finalizaram, eg.acessaram)])
      wsD.addRow(['Visualizaram relatório', eg.visualizaramRelatorio, pctBase(eg.visualizaramRelatorio, eg.finalizaram)])
      wsD.addRow(['Baixaram relatório', eg.baixaramRelatorio, pctBase(eg.baixaramRelatorio, eg.finalizaram)])
      branco()

      secao('Distribuição de notas')
      thead(['Faixa', 'Alunos'])
      for (const x of d.distribuicao) wsD.addRow([x.faixa, x.alunos])
      branco()

      secao('Acerto por disciplina')
      thead(['Disciplina', 'Acertos', 'Total', '%'])
      for (const x of d.porDisciplina) wsD.addRow([x.nome, x.ac, x.tt, x.pct])
      branco()

      secao('Questões mais difíceis')
      thead(['Questão', 'Taxa de acerto (%)'])
      for (const x of [...d.porQuestao].sort((a, b) => a.pct - b.pct)) wsD.addRow([x.rotulo, x.pct])
      branco()

      secao('Ranking (Top 10)')
      thead(['Posição', 'Estudante', 'Nota', 'Acerto (%)', 'Tempo'])
      for (const rk of d.ranking.slice(0, 10)) wsD.addRow([rk.pos, rk.nome, nnum(rk.nota), rk.acerto, rk.tempo])

      // ── Aba 2: Análise por questão (base para a mentoria) ──
      const maxAlts = d.questoes.reduce((m, q) => Math.max(m, q.alternativas.length), 0)
      const cabQ: string[] = ['Nº', 'Disciplina', 'Tipo', 'Enunciado', 'Gabarito', 'Responderam', 'Em branco', 'Acertaram', 'Erraram', 'Taxa de acerto (%)', 'Dificuldade', 'Alternativa mais marcada', 'Maior distrator (errada)', 'Distribuição das alternativas', 'Tempo médio (s)']
      for (let i = 0; i < maxAlts; i++) cabQ.push(`Alt ${letra(i)} (nº)`, `Alt ${letra(i)} (%)`)

      const wsQ = wb.addWorksheet('Análise por questão', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] })
      wsQ.addRow(cabQ)
      for (const q of d.questoes) {
        const idxCorreta = q.alternativas.findIndex((a) => a.correta)
        const gab = idxCorreta >= 0 ? letra(idxCorreta) : '—'
        const emBranco = Math.max(0, d.finalizadas - q.respondida)
        const tipoTxt = q.tipo && q.tipo !== 'objetiva' ? 'Discursiva' : 'Objetiva'
        const dificuldade = q.respondida === 0 ? '—' : q.pct >= 70 ? 'Fácil' : q.pct >= 40 ? 'Média' : 'Difícil'
        let maisIdx = -1, maisVal = -1
        q.alternativas.forEach((a, i) => { if (a.escolhas > maisVal) { maisVal = a.escolhas; maisIdx = i } })
        const maisMarcada = maisIdx >= 0 && maisVal > 0 ? `${letra(maisIdx)} (${maisVal})` : '—'
        let distIdx = -1, distVal = -1
        q.alternativas.forEach((a, i) => { if (!a.correta && a.escolhas > distVal) { distVal = a.escolhas; distIdx = i } })
        const distrator = distIdx >= 0 && distVal > 0 ? `${letra(distIdx)} (${distVal})` : '—'
        const distTxt = q.alternativas.map((a, i) => `${letra(i)}) ${a.texto}${a.correta ? ' ✓' : ''} — ${a.escolhas} (${a.pctEscolha}%)`).join('\n')
        const row: (string | number)[] = [
          q.ordem, q.disciplina, tipoTxt, q.enunciado || '—', gab, q.respondida, emBranco, q.acertos, q.erros, q.pct, dificuldade, maisMarcada, distrator, distTxt, q.tempoMedioSeg ?? '',
        ]
        for (let i = 0; i < maxAlts; i++) { const a = q.alternativas[i]; row.push(a ? a.escolhas : '', a ? a.pctEscolha : '') }
        wsQ.addRow(row)
      }
      // Larguras + quebra de linha nas colunas de texto.
      wsQ.getColumn(1).width = 6
      wsQ.getColumn(2).width = 20
      wsQ.getColumn(3).width = 12
      wsQ.getColumn(4).width = 52; wsQ.getColumn(4).alignment = { wrapText: true, vertical: 'top' }
      wsQ.getColumn(5).width = 10
      for (let c = 6; c <= 11; c++) wsQ.getColumn(c).width = 15
      wsQ.getColumn(12).width = 20; wsQ.getColumn(13).width = 20
      wsQ.getColumn(14).width = 48; wsQ.getColumn(14).alignment = { wrapText: true, vertical: 'top' }
      wsQ.getColumn(15).width = 13
      for (let c = 16; c <= cabQ.length; c++) wsQ.getColumn(c).width = 11
      // Estilo do cabeçalho (por último, para prevalecer sobre a coluna).
      const headQ = wsQ.getRow(1)
      headQ.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headQ.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      headQ.height = 28
      headQ.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } } })
      wsQ.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cabQ.length } }

      // ── Aba 3: Análise por aluno ──
      const ws = wb.addWorksheet('Análise por aluno', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] })
      ws.addRow(cabecalho)
      for (const linha of matriz) ws.addRow(linha.map((v) => (v == null ? '' : v)))
      const head = ws.getRow(1)
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      head.height = 24
      head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } } })
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

  const geral = (
    <div className="space-y-5">
      {/* Configuração de aplicação */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-card px-4 py-3">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', d.config.permiteVarias ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-primary/10 text-primary')}>
          {d.config.permiteVarias ? <Repeat className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {d.config.permiteVarias ? 'Várias tentativas' : 'Tentativa única'}
        </span>
        <span className="text-xs text-muted-foreground">{d.config.modoLabel}</span>
        <span className="hidden h-3 w-px bg-border sm:block" />
        <span className="text-xs text-muted-foreground">Tentativas permitidas: <b className="text-foreground">{d.config.tentativasPermitidas}</b></span>
        {d.config.permiteVarias && (
          <>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span className="text-xs text-muted-foreground">Nota considerada: <b className="text-foreground">{d.config.politicaLabel}</b></span>
          </>
        )}
      </div>

      {/* Card grande: Matriculados × Acessaram × Finalizaram */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-2.5 border-b px-5 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-4 w-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">Estudantes no simulado</h3>
            <p className="text-xs text-muted-foreground">Matriculados × Acessaram × Finalizaram</p>
          </div>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-3">
          <FunilItem icon={<Users className="h-4 w-4" />} tom="primary" label="Matriculados" valor={d.totalSessoes} base={null} baseLabel="atribuídos ao simulado" />
          <FunilItem icon={<LogIn className="h-4 w-4" />} tom="sky" label="Acessaram" valor={d.engajamento.acessaram} base={d.totalSessoes} baseLabel="dos matriculados" />
          <FunilItem icon={<CheckCircle2 className="h-4 w-4" />} tom="emerald" label="Finalizaram" valor={d.finalizadas} base={d.totalSessoes} baseLabel="dos matriculados" />
        </div>
      </div>

      {/* KPIs de desempenho */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label="Nota média" valor={nota(d.notaMedia)} sub={`melhor ${nota(d.melhorNota)}`} icon={<Trophy className="h-4 w-4" />} tom="amber" />
        <KpiCard label="Acerto médio" valor={d.acertoMedio != null ? `${d.acertoMedio}%` : '—'} icon={<Target className="h-4 w-4" />} tom="emerald" />
        <KpiCard label="Tempo médio" valor={d.tempoMedioMin != null ? `${d.tempoMedioMin}min` : '—'} icon={<Clock className="h-4 w-4" />} tom="violet" />
      </div>

      {/* Engajamento e relatórios */}
      <Painel titulo="Engajamento e relatórios" sub={`Base: ${d.engajamento.atribuidos} estudante(s) atribuído(s) ao simulado`} tom="sky" icon={<Activity className="h-4 w-4" />}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <EngajItem icon={<LogIn className="h-4 w-4" />} tom="sky" label="Acessaram" valor={d.engajamento.acessaram} base={d.engajamento.atribuidos} baseLabel="dos atribuídos" />
          <EngajItem icon={<CheckCircle2 className="h-4 w-4" />} tom="emerald" label="Finalizaram" valor={d.engajamento.finalizaram} base={d.engajamento.acessaram} baseLabel="dos que acessaram" />
          <EngajItem icon={<Eye className="h-4 w-4" />} tom="violet" label="Visualizaram relatório" valor={d.engajamento.visualizaramRelatorio} base={d.engajamento.finalizaram} baseLabel="dos que finalizaram" />
          <EngajItem icon={<Download className="h-4 w-4" />} tom="amber" label="Baixaram relatório" valor={d.engajamento.baixaramRelatorio} base={d.engajamento.finalizaram} baseLabel="dos que finalizaram" />
        </div>
      </Painel>

      {/* Levantamento de tentativas (só quando permite várias) */}
      {d.config.permiteVarias && (
        <Painel titulo="Levantamento de tentativas" sub={`Cada aluno pode repetir · nota considerada: ${d.config.politicaLabel}`} tom="sky" icon={<Repeat className="h-4 w-4" />}>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <MiniStatN label="Total de tentativas" valor={d.tentativasResumo.totalTentativas} />
            <MiniStatN label="Média por aluno" valor={d.tentativasResumo.mediaPorAluno} />
            <MiniStatN label="Alunos com +1" valor={d.tentativasResumo.alunosComMaisDeUma} />
          </div>
          {d.porAlunoTentativas.length === 0 ? <Vazio>Sem tentativas finalizadas.</Vazio> : (
            <ListaBusca itens={d.porAlunoTentativas} placeholder="Buscar aluno…" print={print} vazio="Sem tentativas." filtro={(r, t) => r.nome.toLowerCase().includes(t)}>
              {(r) => (
                <div key={r.nome} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.tentativas} tentativa(s){r.primeiraNota != null ? ` · 1ª nota ${nota(r.primeiraNota)}` : ''}
                    </p>
                  </div>
                  {r.delta != null && r.tentativas > 1 && (
                    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', r.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : r.delta < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                      {r.delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : r.delta < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                      {r.delta > 0 ? '+' : ''}{nota(r.delta)}
                    </span>
                  )}
                  <div className="shrink-0 border-l pl-3 text-right">
                    <div className="text-lg font-bold tabular-nums text-primary">{nota(r.notaConsiderada)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">considerada</div>
                  </div>
                </div>
              )}
            </ListaBusca>
          )}
        </Painel>
      )}

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Acerto por disciplina" sub="Verde = domínio alto · vermelho = ponto fraco" tom="emerald" icon={<BookOpen className="h-4 w-4" />}>
          <BarrasH itens={d.porDisciplina.map((x) => ({ rotulo: x.nome, valor: x.pct, sub: `${x.ac}/${x.tt}` }))} pct heat />
        </Painel>
        <Painel titulo="Distribuição de notas" sub="Estudantes por faixa de nota" tom="violet" icon={<BarChart3 className="h-4 w-4" />}>
          <Colunas itens={d.distribuicao.map((x) => ({ rotulo: x.faixa, valor: x.alunos }))} tom="violet" altura={200} formato={(n) => `${n} aluno(s)`} />
        </Painel>
      </div>

      {/* Comparativo por classificação + Dispersão */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Passaporte × Normal" sub="Aproveitamento por classificação" tom="primary" icon={<Users className="h-4 w-4" />}>
          {d.porClassificacao.length === 0 ? <Vazio>Sem sessões finalizadas.</Vazio> : (
            <div className="space-y-3">
              {d.porClassificacao.map((c) => (
                <div key={c.chave} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{c.label}</span>
                    <span className="text-xs text-muted-foreground">{c.alunos} aluno(s)</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nota média</p>
                      <p className={cn('text-lg font-bold tabular-nums', c.notaMedia != null && corPct(c.notaMedia * 10))}>{c.notaMedia != null ? c.notaMedia.toFixed(1).replace('.', ',') : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Acerto médio</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${c.acertoMedio ?? 0}%` }} /></div>
                        <span className="shrink-0 text-sm font-bold tabular-nums">{c.acertoMedio != null ? `${c.acertoMedio}%` : '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Painel>

        <Painel titulo="Dispersão da turma" sub="Homogeneidade das notas (além da média)" tom="violet" icon={<Gauge className="h-4 w-4" />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Mediana" valor={d.dispersao.mediana} />
            <MiniStat label="Desvio-padrão" valor={d.dispersao.desvio} />
            <MiniStat label="Menor nota" valor={d.dispersao.min} />
            <MiniStat label="Maior nota" valor={d.dispersao.max} />
          </div>
          {d.notaMedia != null && <p className="mt-3 text-xs text-muted-foreground">Média {nota(d.notaMedia)} · {d.dispersao.desvio != null && d.dispersao.desvio <= 1 ? 'turma homogênea' : 'notas dispersas'}.</p>}
        </Painel>
      </div>

      {/* Histograma de acertos + Tempo por questão */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Histograma de acertos" sub="Alunos por nº de questões corretas" tom="sky" icon={<BarChart3 className="h-4 w-4" />}>
          {d.histogramaAcertos.length === 0 ? <Vazio>Sem dados.</Vazio> : (
            <Colunas itens={d.histogramaAcertos.map((x) => ({ rotulo: x.rotulo, valor: x.alunos }))} tom="sky" altura={200} formato={(n) => `${n} aluno(s)`} />
          )}
        </Painel>

        <Painel titulo="Tempo por questão" sub="Média de tempo gasto (mais lentas primeiro)" tom="amber" icon={<Timer className="h-4 w-4" />}>
          {(() => {
            const comTempo = d.questoes.filter((q) => q.tempoMedioSeg != null).sort((a, b) => (b.tempoMedioSeg ?? 0) - (a.tempoMedioSeg ?? 0)).slice(0, 12)
            return comTempo.length === 0
              ? <Vazio>Sem tempo registrado por questão.</Vazio>
              : <BarrasH itens={comTempo.map((q) => ({ rotulo: `Q${q.ordem}`, valor: q.tempoMedioSeg as number, sub: `${q.pct}% acerto` }))} tom="amber" formato={fmtSeg} />
          })()}
        </Painel>
      </div>

      <Painel titulo="Acerto por questão" sub="Na ordem da prova (Q1 → última) — sequência linear das questões" tom="amber" icon={<ListChecks className="h-4 w-4" />}>
        {d.porQuestao.length === 0 ? <Vazio>Sem respostas ainda.</Vazio> : (
          <Colunas itens={d.porQuestao.map((x) => ({ rotulo: x.rotulo, valor: x.pct }))} tom="amber" altura={220} formato={(n) => `${n}%`} />
        )}
      </Painel>

      {/* Questões para revisão / possível anulação */}
      <Painel titulo="Questões para revisão / possível anulação" sub="Acerto muito baixo (<20%) ou distrator mais marcado que o gabarito" tom="rose" icon={<AlertTriangle className="h-4 w-4" />}>
        {(() => {
          const criticas = d.questoes.filter((q) => q.respondida > 0).map((q) => {
            const corr = q.alternativas.find((a) => a.correta)
            const maxWrong = q.alternativas.filter((a) => !a.correta).reduce((m, a) => Math.max(m, a.escolhas), 0)
            const gabaritoSuspeito = !!corr && maxWrong > corr.escolhas
            const acertoBaixo = q.pct < 20
            return { q, gabaritoSuspeito, acertoBaixo }
          }).filter((x) => x.gabaritoSuspeito || x.acertoBaixo)
          if (criticas.length === 0) return <div className="flex items-center gap-2 py-6 text-sm font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> Nenhuma questão crítica — gabaritos e níveis de acerto consistentes.</div>
          return (
            <div className="space-y-2">
              {criticas.map(({ q, gabaritoSuspeito, acertoBaixo }) => (
                <div key={q.ordem} className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">{q.ordem}</span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">{q.enunciado || 'Sem enunciado'}</p>
                    <p className="text-xs text-muted-foreground">{q.disciplina} · {q.pct}% de acerto · {q.acertos}/{q.respondida}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {acertoBaixo && <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">Acerto muito baixo</span>}
                      {gabaritoSuspeito && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">Gabarito suspeito (distrator &gt; gabarito)</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
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

  return (
    <div className="space-y-5">
      <Hero icon={<ClipboardList className="h-6 w-6" />} tom="primary" titulo={d.titulo}
        badge={<TipoSimuladoBadge tipo={d.tipo} />} subtitulo="Análise completa do simulado"
        acoes={print ? undefined : <ExportarSimulado gerando={gerando} vazio={d.linhas.length === 0} onExcel={exportarExcel} onCsv={exportarCsv} />} />

      {print ? (
        <>
          {geral}
          <QuestoesTab questoes={d.questoes} />
        </>
      ) : (
        <Tabs defaultValue="geral" className="gap-4">
          <TabsList>
            <TabsTrigger value="geral"><LayoutDashboard className="h-[18px] w-[18px]" /> Visão geral</TabsTrigger>
            <TabsTrigger value="questoes">
              <ListChecks className="h-[18px] w-[18px]" /> Questões
              <span className="ml-1 rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">{d.questoes.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="geral">{geral}</TabsContent>
          <TabsContent value="questoes"><QuestoesTab questoes={d.questoes} /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}

const corPct = (p: number) =>
  p >= 70 ? 'text-emerald-600 dark:text-emerald-400' : p >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
const fmtSeg = (s: number) => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m > 0 ? `${m}min ${String(r).padStart(2, '0')}s` : `${r}s` }

function MiniStat({ label, valor }: { label: string; valor: number | null }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <p className="text-xl font-bold tabular-nums">{valor != null ? valor.toFixed(1).replace('.', ',') : '—'}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}

function MiniStatN({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <p className="text-xl font-bold tabular-nums">{String(valor).replace('.', ',')}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
const chipPct = (p: number) =>
  p >= 70 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : p >= 50 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'

/** Aba Questões: acertos/erros de cada questão respondida + distribuição por alternativa (base para a mentoria). */
function QuestoesTab({ questoes }: { questoes: QuestaoDetalhe[] }) {
  const [busca, setBusca] = useState('')
  const [disc, setDisc] = useState<string>('')
  const [ordenar, setOrdenar] = useState<'ordem' | 'dificeis'>('ordem')

  const disciplinas = useMemo(() => [...new Set(questoes.map((q) => q.disciplina))].sort((a, b) => a.localeCompare(b)), [questoes])

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    let arr = questoes.filter((q) =>
      (!disc || q.disciplina === disc) &&
      (!t || q.enunciado.toLowerCase().includes(t) || `q${q.ordem} questão ${q.ordem}`.includes(t)))
    arr = [...arr].sort((a, b) => ordenar === 'dificeis' ? a.pct - b.pct || a.ordem - b.ordem : a.ordem - b.ordem)
    return arr
  }, [questoes, busca, disc, ordenar])

  const respondidas = questoes.filter((q) => q.respondida > 0).length

  if (questoes.length === 0) return <Vazio>Este simulado não tem questões.</Vazio>

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nº ou enunciado…"
            className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="relative">
          <select value={disc} onChange={(e) => setDisc(e.target.value)}
            className="appearance-none rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">Todas as disciplinas</option>
            {disciplinas.map((dd) => <option key={dd} value={dd}>{dd}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="inline-flex gap-1 rounded-lg border bg-muted/40 p-0.5">
          <button type="button" onClick={() => setOrdenar('ordem')} className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition', ordenar === 'ordem' ? 'bg-card shadow-sm' : 'text-muted-foreground')}>Ordem da prova</button>
          <button type="button" onClick={() => setOrdenar('dificeis')} className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition', ordenar === 'dificeis' ? 'bg-card shadow-sm' : 'text-muted-foreground')}>Mais difíceis</button>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{respondidas}/{questoes.length} respondida(s)</span>
      </div>

      {lista.length === 0 ? <Vazio>Nenhuma questão encontrada.</Vazio> : (
        <div className="space-y-3">
          {lista.map((q) => <QuestaoCard key={q.ordem} q={q} />)}
        </div>
      )}
    </div>
  )
}

function QuestaoCard({ q }: { q: QuestaoDetalhe }) {
  const [aberto, setAberto] = useState(false)
  const semResposta = q.respondida === 0
  const objetiva = q.alternativas.length > 0

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums',
          semResposta ? 'bg-muted text-muted-foreground' : chipPct(q.pct))}>
          {q.ordem}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{q.disciplina}</span>
            {q.tipo && q.tipo !== 'objetiva' && <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Discursiva</span>}
          </div>
          <button type="button" onClick={() => setAberto((v) => !v)} className="block w-full text-left">
            <p className={cn('text-sm text-foreground/90', !aberto && 'line-clamp-2')}>{q.enunciado || <span className="italic text-muted-foreground">Sem enunciado.</span>}</p>
          </button>
        </div>
        <div className="shrink-0 text-right">
          {semResposta ? (
            <span className="text-xs text-muted-foreground">sem respostas</span>
          ) : (
            <>
              <div className={cn('text-2xl font-bold tabular-nums', corPct(q.pct))}>{q.pct}%</div>
              <div className="mt-0.5 flex items-center justify-end gap-2 text-[11px]">
                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" />{q.acertos}</span>
                <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400"><X className="h-3 w-3" />{q.erros}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Distribuição por alternativa (só objetivas com respostas) */}
      {objetiva && !semResposta && (
        <div className="space-y-1.5 border-t bg-muted/20 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Como responderam ({q.respondida})</p>
          {q.alternativas.map((a, i) => {
            const letra = String.fromCharCode(65 + i)
            return (
              <div key={i} className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5', a.correta && 'bg-emerald-500/10')}>
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold',
                  a.correta ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')}>{letra}</span>
                <span className={cn('min-w-0 flex-1 truncate text-sm', a.correta ? 'font-medium' : 'text-muted-foreground')} title={a.texto}>{a.texto || '—'}</span>
                <div className="hidden h-2 w-28 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                  <div className={cn('h-full rounded-full', a.correta ? 'bg-emerald-500' : 'bg-rose-400')} style={{ width: `${a.pctEscolha}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{a.escolhas} · {a.pctEscolha}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ENGAJ_TOM: Record<string, { chip: string; bar: string; txt: string }> = {
  primary: { chip: 'bg-primary/15 text-primary', bar: 'bg-primary', txt: 'text-primary' },
  sky: { chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', bar: 'bg-sky-500', txt: 'text-sky-600 dark:text-sky-400' },
  emerald: { chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', txt: 'text-emerald-600 dark:text-emerald-400' },
  violet: { chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', bar: 'bg-violet-500', txt: 'text-violet-600 dark:text-violet-400' },
  amber: { chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', txt: 'text-amber-600 dark:text-amber-400' },
}

function FunilItem({ icon, tom, label, valor, base, baseLabel }: { icon: React.ReactNode; tom: string; label: string; valor: number; base: number | null; baseLabel: string }) {
  const t = ENGAJ_TOM[tom] ?? ENGAJ_TOM.sky
  const pct = base != null && base > 0 ? Math.round((valor / base) * 100) : null
  return (
    <div className="bg-card p-5">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-full', t.chip)}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-4xl font-extrabold leading-none tabular-nums">{valor}</span>
        {pct != null && <span className={cn('mb-1 text-sm font-semibold', t.txt)}>{pct}%</span>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div className={cn('h-full rounded-full transition-all', t.bar)} style={{ width: `${pct ?? 100}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{pct != null ? `${pct}% ${baseLabel}` : baseLabel}</p>
    </div>
  )
}

function EngajItem({ icon, tom, label, valor, base, baseLabel }: { icon: React.ReactNode; tom: string; label: string; valor: number; base: number; baseLabel: string }) {
  const t = ENGAJ_TOM[tom] ?? ENGAJ_TOM.sky
  const pct = base > 0 ? Math.round((valor / base) * 100) : 0
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', t.chip)}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold leading-none tabular-nums">{valor}</span>
        <span className={cn('mb-0.5 text-sm font-semibold', pct > 0 ? t.txt : 'text-muted-foreground')}>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div className={cn('h-full rounded-full transition-all', t.bar)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">{pct}% {baseLabel}</p>
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
