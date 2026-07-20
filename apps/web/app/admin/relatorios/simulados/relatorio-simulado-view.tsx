'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Painel, Hero, BarrasH, Colunas, ListaBusca, Vazio, baixarCsv, heatBar } from '@/components/admin/relatorios/viz'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import type { TipoSimulado } from '@/lib/simulado/tipo'
import { cn } from '@/lib/utils'
import { Users, CheckCircle2, Target, Trophy, Clock, Crown, Medal, ClipboardList, BookOpen, BarChart3, ListChecks, FileSpreadsheet, FileText, Loader2, LayoutDashboard, Search, ChevronDown, Check, X, LogIn, Eye, Download, Activity, AlertTriangle, Timer, Gauge, Repeat, Lock, TrendingUp, TrendingDown, Minus, Shield } from 'lucide-react'

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
      const { estilizarLinhas } = await import('@/lib/relatorios/excel-kit')
      const wb = new ExcelJS.Workbook()
      const PURPLE = 'FF5B21B6', LIGHT = 'FFEEE9F9'
      const letra = (i: number) => String.fromCharCode(65 + i)
      const nnum = (n: number | null) => (n == null ? '—' : Number(n.toFixed(1)))
      const pctBase = (v: number, b: number) => (b > 0 ? `${Math.round((v / b) * 100)}%` : '—')

      // ── Aba 1: Dashboard (visão geral do simulado) ──
      const wsD = wb.addWorksheet('Dashboard', { views: [{ showGridLines: false }] })
      wsD.columns = [{ width: 36 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 12 }]
      const GRAY = 'FF374151'
      const dBorda = { style: 'thin' as const, color: { argb: 'FFE5E1F2' } }
      let zeb = 0
      const secao = (txt: string) => {
        wsD.addRow([]) // respiro antes da seção
        const row = wsD.addRow([txt]); row.height = 22
        for (let c = 1; c <= 5; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } }
        row.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
        row.getCell(1).alignment = { vertical: 'middle', indent: 1 }
        wsD.mergeCells(row.number, 1, row.number, 5)
        zeb = 0
      }
      const thead = (cols: string[]) => {
        const row = wsD.addRow(cols); row.height = 18
        row.eachCell((c, col) => {
          c.font = { bold: true, color: { argb: PURPLE } }
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
          c.border = { bottom: { style: 'thin', color: { argb: PURPLE } } }
          c.alignment = { horizontal: col === 1 ? 'left' : 'right', vertical: 'middle' }
        })
        zeb = 0
      }
      // Linha de dado: zebra + bordas finas + rótulo em negrito + valores à direita + cor no % (opcional).
      const linha = (cells: (string | number)[], pctCol?: number) => {
        const row = wsD.addRow(cells)
        const bg = zeb++ % 2 === 1 ? 'FFF7F5FC' : 'FFFFFFFF'
        row.eachCell((c, col) => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          c.border = { bottom: dBorda }
          c.alignment = { horizontal: col === 1 ? 'left' : 'right', vertical: 'middle' }
          if (col === 1) c.font = { bold: true, color: { argb: GRAY } }
        })
        if (pctCol) { const v = cells[pctCol - 1]; if (typeof v === 'number') row.getCell(pctCol).font = { bold: true, color: { argb: v >= 70 ? 'FF15803D' : v >= 40 ? 'FFB45309' : 'FFB91C1C' } } }
        return row
      }
      const tipoLabel = d.tipo === 'discursiva' ? 'Discursiva' : d.tipo === 'objetiva' ? 'Objetiva' : d.tipo ? 'Mista' : 'Simulado'

      const tTit = wsD.addRow([d.titulo || 'Simulado']); tTit.getCell(1).font = { bold: true, size: 18, color: { argb: PURPLE } }; tTit.height = 26; wsD.mergeCells(tTit.number, 1, tTit.number, 5)
      const tSub = wsD.addRow([`Relatório do simulado — ${tipoLabel}`]); tSub.getCell(1).font = { italic: true, color: { argb: 'FF777777' } }; wsD.mergeCells(tSub.number, 1, tSub.number, 5)
      const tDt = wsD.addRow([`Exportado em ${new Date().toLocaleString('pt-BR')}`]); tDt.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF999999' } }; wsD.mergeCells(tDt.number, 1, tDt.number, 5)

      secao('Resumo')
      thead(['Indicador', 'Valor'])
      linha(['Estudantes', d.totalSessoes])
      linha(['Finalizaram', d.finalizadas])
      linha(['Nota média', nnum(d.notaMedia)])
      linha(['Melhor nota', nnum(d.melhorNota)])
      linha(['Acerto médio (%)', d.acertoMedio ?? '—'], 2)
      linha(['Tempo médio (min)', d.tempoMedioMin ?? '—'])
      linha(['Nota mediana', nnum(d.dispersao.mediana)])
      linha(['Desvio-padrão', d.dispersao.desvio ?? '—'])
      linha(['Menor / maior nota', `${nnum(d.dispersao.min)} / ${nnum(d.dispersao.max)}`])

      secao('Configuração de aplicação')
      thead(['Item', 'Valor'])
      linha(['Modo', d.config.modoLabel])
      linha(['Tentativas permitidas', d.config.tentativasPermitidas])
      linha(['Nota considerada', d.config.politicaLabel])
      if (d.config.permiteVarias) {
        linha(['Total de tentativas', d.tentativasResumo.totalTentativas])
        linha(['Média de tentativas por aluno', d.tentativasResumo.mediaPorAluno])
        linha(['Alunos com +1 tentativa', d.tentativasResumo.alunosComMaisDeUma])
      }

      secao('Por classificação (Passaporte × Normal)')
      thead(['Classificação', 'Alunos', 'Nota média', 'Acerto (%)'])
      if (d.porClassificacao.length === 0) linha(['—', 0, '—', '—'])
      for (const c of d.porClassificacao) linha([c.label, c.alunos, nnum(c.notaMedia), c.acertoMedio ?? '—'], 4)

      secao('Engajamento')
      thead(['Etapa', 'Alunos', '%'])
      const eg = d.engajamento
      linha(['Atribuídos', eg.atribuidos, '100%'])
      linha(['Acessaram', eg.acessaram, pctBase(eg.acessaram, eg.atribuidos)])
      linha(['Finalizaram', eg.finalizaram, pctBase(eg.finalizaram, eg.acessaram)])
      linha(['Visualizaram relatório', eg.visualizaramRelatorio, pctBase(eg.visualizaramRelatorio, eg.finalizaram)])
      linha(['Baixaram relatório', eg.baixaramRelatorio, pctBase(eg.baixaramRelatorio, eg.finalizaram)])

      secao('Distribuição de notas')
      thead(['Faixa', 'Alunos'])
      for (const x of d.distribuicao) linha([x.faixa, x.alunos])

      secao('Acerto por disciplina')
      thead(['Disciplina', 'Acertos', 'Total', '%'])
      for (const x of d.porDisciplina) linha([x.nome, x.ac, x.tt, x.pct], 4)

      secao('Questões mais difíceis')
      thead(['Questão', 'Taxa de acerto (%)'])
      for (const x of [...d.porQuestao].sort((a, b) => a.pct - b.pct)) linha([x.rotulo, x.pct], 2)

      secao('Ranking (Top 10)')
      thead(['Posição', 'Estudante', 'Nota', 'Acerto (%)', 'Tempo'])
      for (const rk of d.ranking.slice(0, 10)) linha([rk.pos, rk.nome, nnum(rk.nota), rk.acerto, rk.tempo], 4)

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
      estilizarLinhas(wsQ, 2, wsQ.rowCount, cabQ.length) // designer: zebra + bordas

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
      estilizarLinhas(ws, 2, ws.rowCount, cabecalho.length) // designer: zebra + bordas

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
    <div className="space-y-6">
      {/* Configuração de aplicação — pílulas independentes (nada some no mobile) */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2.5">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
          d.config.permiteVarias ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary')}>
          {d.config.permiteVarias ? <Repeat className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {d.config.permiteVarias ? 'Várias tentativas' : 'Tentativa única'}
        </span>
        <ChipConfig icon={<Gauge className="h-3.5 w-3.5" />} label="Modo" valor={d.config.modoLabel} />
        <ChipConfig icon={<ListChecks className="h-3.5 w-3.5" />} label="Tentativas" valor={d.config.tentativasPermitidas} />
        {d.config.permiteVarias && <ChipConfig icon={<Trophy className="h-3.5 w-3.5" />} label="Nota considerada" valor={d.config.politicaLabel} />}
      </div>

      {/* ── Banda: Participação ── */}
      <FaixaSecao icon={<Activity className="h-3.5 w-3.5" />}>Participação</FaixaSecao>

      {/* Funil: Matriculados × Acessaram × Finalizaram */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-2.5 border-b px-5 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-4 w-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">Estudantes no simulado</h3>
            <p className="text-xs text-muted-foreground">Matriculados × Acessaram × Finalizaram</p>
          </div>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-3">
          <FunilItem icon={<Users className="h-4 w-4" />} tom="slate" label="Matriculados" valor={d.totalSessoes} base={null} baseLabel="atribuídos ao simulado" />
          <FunilItem icon={<LogIn className="h-4 w-4" />} tom="primary" label="Acessaram" valor={d.engajamento.acessaram} base={d.totalSessoes} baseLabel="dos matriculados" />
          <FunilItem icon={<CheckCircle2 className="h-4 w-4" />} tom="emerald" label="Finalizaram" valor={d.finalizadas} base={d.totalSessoes} baseLabel="dos matriculados" />
        </div>
      </div>

      {/* Engajamento e relatórios */}
      <Painel titulo="Engajamento e relatórios" sub={`Base: ${d.engajamento.atribuidos} estudante(s) atribuído(s) ao simulado`} tom="primary" icon={<Activity className="h-4 w-4" />}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <EngajItem icon={<LogIn className="h-4 w-4" />} tom="primary" label="Acessaram" valor={d.engajamento.acessaram} base={d.engajamento.atribuidos} baseLabel="dos atribuídos" />
          <EngajItem icon={<CheckCircle2 className="h-4 w-4" />} tom="emerald" label="Finalizaram" valor={d.engajamento.finalizaram} base={d.engajamento.acessaram} baseLabel="dos que acessaram" />
          <EngajItem icon={<Eye className="h-4 w-4" />} tom="primary" label="Visualizaram relatório" valor={d.engajamento.visualizaramRelatorio} base={d.engajamento.finalizaram} baseLabel="dos que finalizaram" />
          <EngajItem icon={<Download className="h-4 w-4" />} tom="amber" label="Baixaram relatório" valor={d.engajamento.baixaramRelatorio} base={d.engajamento.finalizaram} baseLabel="dos que finalizaram" />
        </div>
      </Painel>

      {/* Levantamento de tentativas (só quando permite várias) */}
      {d.config.permiteVarias && (
        <Painel titulo="Levantamento de tentativas" sub={`Cada aluno pode repetir · nota considerada: ${d.config.politicaLabel}`} tom="primary" icon={<Repeat className="h-4 w-4" />}>
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            <MiniStatN label="Total de tentativas" valor={d.tentativasResumo.totalTentativas} tom="primary" />
            <MiniStatN label="Média por aluno" valor={d.tentativasResumo.mediaPorAluno} tom="primary" />
            <MiniStatN label="Alunos com +1" valor={d.tentativasResumo.alunosComMaisDeUma} tom="amber" />
          </div>
          {d.porAlunoTentativas.length === 0 ? <Vazio>Sem tentativas finalizadas.</Vazio> : (
            <ListaBusca itens={d.porAlunoTentativas} placeholder="Buscar aluno…" print={print} vazio="Sem tentativas." filtro={(r, t) => r.nome.toLowerCase().includes(t)}>
              {(r) => (
                <div key={r.nome} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold tabular-nums text-primary">{r.tentativas}</span>
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

      {/* ── Banda: Desempenho ── */}
      <FaixaSecao icon={<BarChart3 className="h-3.5 w-3.5" />}>Desempenho</FaixaSecao>

      {/* Acerto por disciplina (estrela) */}
      <Painel titulo="Acerto por disciplina" sub="Vermelho = ponto fraco · verde = domínio" tom="primary" icon={<BookOpen className="h-4 w-4" />}>
        <BarrasH itens={d.porDisciplina.map((x) => ({ rotulo: x.nome, valor: x.pct, sub: `${x.ac}/${x.tt}` }))} pct heat />
        <LegendaHeat />
      </Painel>

      {/* Passaporte × Normal (comparação com heat) + Dispersão (régua) */}
      <div className="grid gap-4 lg:grid-cols-6">
        <Painel className="lg:col-span-4" titulo="Passaporte × Normal" sub="Aproveitamento comparado por classificação" tom="primary" icon={<Users className="h-4 w-4" />}>
          {d.porClassificacao.length === 0 ? <Vazio>Sem sessões finalizadas.</Vazio> : (
            <div className="space-y-3">
              {d.porClassificacao.map((c) => (
                <div key={c.chave} className="rounded-xl border bg-muted/20 p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      {c.chave.toLowerCase().includes('passaporte') && <Shield className="h-3.5 w-3.5 text-primary" />}
                      {c.label}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{c.alunos} aluno(s)</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="shrink-0">
                      <p className={cn('text-2xl font-bold tabular-nums', c.notaMedia != null && corPct(c.notaMedia * 10))}>
                        {c.notaMedia != null ? c.notaMedia.toFixed(1).replace('.', ',') : '—'}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">nota média</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>acerto médio</span><span className="font-bold tabular-nums text-foreground">{c.acertoMedio != null ? `${c.acertoMedio}%` : '—'}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', heatBar(c.acertoMedio ?? 0))} style={{ width: `${c.acertoMedio ?? 0}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Painel>

        <Painel className="lg:col-span-2" titulo="Dispersão da turma" sub="Homogeneidade das notas" tom="slate" icon={<Gauge className="h-4 w-4" />}>
          {d.dispersao.desvio != null && (
            <div className={cn('mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              d.dispersao.desvio <= 1 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400')}>
              {d.dispersao.desvio <= 1 ? 'Turma homogênea' : 'Notas dispersas'}
            </div>
          )}
          <ReguaDispersao min={d.dispersao.min} max={d.dispersao.max} mediana={d.dispersao.mediana} media={d.notaMedia} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="Mediana" valor={d.dispersao.mediana} />
            <MiniStat label="Desvio-padrão" valor={d.dispersao.desvio} />
          </div>
        </Painel>
      </div>

      {/* Histograma de acertos + Tempo por questão */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Histograma de acertos" sub="Alunos por nº de questões corretas" tom="slate" icon={<BarChart3 className="h-4 w-4" />}>
          {d.histogramaAcertos.length === 0 ? <Vazio>Sem dados.</Vazio> : (
            <Colunas itens={d.histogramaAcertos.map((x) => ({ rotulo: x.rotulo, valor: x.alunos }))} tom="slate" altura={200} formato={(n) => `${n} aluno(s)`} />
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

      {/* Acerto por questão — rola no mobile, degrada no print */}
      <Painel titulo="Acerto por questão" sub="Ordem da prova (Q1 → última)" tom="amber" icon={<ListChecks className="h-4 w-4" />}>
        {d.porQuestao.length === 0 ? <Vazio>Sem respostas ainda.</Vazio> : (
          <div className={print ? '' : 'overflow-x-auto pb-1'}>
            <div style={print ? undefined : { minWidth: Math.max(320, d.porQuestao.length * 38) }}>
              <Colunas itens={d.porQuestao.map((x) => ({ rotulo: x.rotulo, valor: x.pct }))} tom="amber" altura={220} formato={(n) => `${n}%`} />
            </div>
          </div>
        )}
      </Painel>

      {/* ── Banda: Qualidade & Ranking ── */}
      <FaixaSecao icon={<AlertTriangle className="h-3.5 w-3.5" />}>Qualidade &amp; Ranking</FaixaSecao>

      {/* Questões para revisão / possível anulação */}
      {(() => {
        const criticas = d.questoes.filter((q) => q.respondida > 0).map((q) => {
          const corr = q.alternativas.find((a) => a.correta)
          const maxWrong = q.alternativas.filter((a) => !a.correta).reduce((m, a) => Math.max(m, a.escolhas), 0)
          const gabaritoSuspeito = !!corr && maxWrong > corr.escolhas
          const acertoBaixo = q.pct < 20
          return { q, gabaritoSuspeito, acertoBaixo }
        }).filter((x) => x.gabaritoSuspeito || x.acertoBaixo).sort((a, b) => a.q.pct - b.q.pct)
        return (
          <Painel titulo="Questões para revisão / possível anulação" sub="Acerto muito baixo (<20%) ou distrator mais marcado que o gabarito" tom="rose" icon={<AlertTriangle className="h-4 w-4" />}
            acao={criticas.length > 0 ? <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400">{criticas.length}</span> : undefined}>
            {criticas.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Check className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Nenhuma questão crítica</p>
                  <p className="text-xs text-muted-foreground">Gabaritos e níveis de acerto consistentes.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {criticas.map(({ q, gabaritoSuspeito, acertoBaixo }) => (
                  <div key={q.ordem} className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">{q.ordem}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium">{q.enunciado || 'Sem enunciado'}</p>
                      <p className="text-xs text-muted-foreground">{q.disciplina} · {q.acertos}/{q.respondida}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {acertoBaixo && <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">Acerto muito baixo</span>}
                        {gabaritoSuspeito && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">Gabarito suspeito (distrator &gt; gabarito)</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">{q.pct}%</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">acerto</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Painel>
        )
      })()}

      {/* Ranking */}
      <Painel titulo="Ranking dos estudantes" sub={d.ranking.length ? `${d.ranking.length} classificado(s)` : undefined} tom="primary" icon={<Trophy className="h-4 w-4" />}>
        {!print && d.ranking.length >= 3 && <PodioSimulado top={d.ranking} nota={nota} />}
        <ListaBusca itens={d.ranking} placeholder="Buscar estudante pelo nome…" vazio="Sem sessões finalizadas ainda." print={print}
          filtro={(r, t) => r.nome.toLowerCase().includes(t)}>
          {(r) => (
            <div key={r.pos} className={`flex items-center gap-3 rounded-2xl border p-3 sm:gap-4 ${r.pos <= 3 ? 'bg-gradient-to-r from-amber-50/60 to-transparent dark:from-amber-950/20' : 'bg-card'}`}>
              <Posicao pos={r.pos} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.nome}</div>
                <div className="text-xs text-muted-foreground">{r.acerto}% de acerto · {r.tempo}</div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted sm:hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.acerto}%` }} />
                </div>
              </div>
              <div className="hidden w-44 shrink-0 sm:block">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>{r.acerto}% acerto</span><span className="font-medium tabular-nums">{r.tempo}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.acerto}%` }} /></div>
              </div>
              <div className="shrink-0 border-l pl-3 text-right sm:pl-4">
                <div className="text-lg font-bold tabular-nums text-primary sm:text-xl">{nota(r.nota)}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">nota</div>
              </div>
            </div>
          )}
        </ListaBusca>
      </Painel>
    </div>
  )

  return (
    <div className="space-y-6">
      <Hero icon={<ClipboardList className="h-6 w-6" />} tom="primary" titulo={d.titulo}
        badge={<TipoSimuladoBadge tipo={d.tipo} />}
        subtitulo={`${d.finalizadas} de ${d.totalSessoes} finalizaram · ${d.config.modoLabel}`}
        acoes={print ? undefined : <ExportarSimulado gerando={gerando} vazio={d.linhas.length === 0} onExcel={exportarExcel} onCsv={exportarCsv} />} />

      <ResumoExecutivo d={d} nota={nota} />

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

/** Divisor de banda narrativa (renderiza no print, ajuda a paginação). */
function FaixaSecao({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-0.5 pt-1 print:pt-0">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{children}</h3>
      <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
    </div>
  )
}

/** Pílula de configuração (rótulo: valor). */
function ChipConfig({ icon, label, valor }: { icon: React.ReactNode; label: string; valor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
      <span className="text-muted-foreground/70">{icon}</span>{label}: <b className="font-semibold text-foreground">{valor}</b>
    </span>
  )
}

/** Legenda da escala de calor (ponto fraco → domínio). */
function LegendaHeat() {
  return (
    <div className="mt-3 flex items-center gap-2 border-t pt-3 text-[10px] text-muted-foreground">
      <span>Ponto fraco</span>
      <span className="h-2 flex-1 rounded-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500" />
      <span>Domínio</span>
    </div>
  )
}

const RESUMO_TOM: Record<string, { chip: string; bar: string }> = {
  primary: { chip: 'bg-primary/15 text-primary', bar: 'bg-primary' },
  amber: { chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  emerald: { chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  slate: { chip: 'bg-slate-500/15 text-slate-600 dark:text-slate-400', bar: 'bg-slate-500' },
}

/** Resumo executivo — banner com glow duplo roxo+âmbar e 4 big-numbers. */
function ResumoExecutivo({ d, nota }: { d: DadosRelatorioSimulado; nota: (n: number | null) => string }) {
  const concl = d.totalSessoes > 0 ? Math.round((d.finalizadas / d.totalSessoes) * 100) : 0
  return (
    <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/12 via-card to-card">
      <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-32 h-44 w-44 rounded-full bg-[var(--brand-accent)]/10 blur-3xl" />
      <div className="relative grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
        <ResumoCel tom="amber" icon={<Trophy className="h-4 w-4" />} label="Nota média" valor={nota(d.notaMedia)} sub={`melhor ${nota(d.melhorNota)}`} />
        <ResumoCel tom="emerald" icon={<Target className="h-4 w-4" />} label="Acerto médio" valor={d.acertoMedio != null ? `${d.acertoMedio}%` : '—'} sub={`${d.finalizadas} finalizaram`} progresso={d.acertoMedio ?? undefined} />
        <ResumoCel tom="primary" icon={<CheckCircle2 className="h-4 w-4" />} label="Conclusão" valor={`${concl}%`} sub={`${d.finalizadas}/${d.totalSessoes}`} progresso={concl} />
        <ResumoCel tom="slate" icon={<Clock className="h-4 w-4" />} label="Tempo médio" valor={d.tempoMedioMin != null ? `${d.tempoMedioMin}min` : '—'} sub="por aluno" />
      </div>
    </div>
  )
}

function ResumoCel({ tom, icon, label, valor, sub, progresso }: {
  tom: keyof typeof RESUMO_TOM; icon: React.ReactNode; label: string; valor: React.ReactNode; sub?: string; progresso?: number
}) {
  const t = RESUMO_TOM[tom]
  return (
    <div className="rounded-2xl border border-white/40 bg-card/60 p-3.5 backdrop-blur-sm dark:border-white/10">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', t.chip)}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold leading-none tabular-nums sm:text-3xl">{valor}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
      {progresso != null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', t.bar)} style={{ width: `${Math.min(100, progresso)}%` }} />
        </div>
      )}
    </div>
  )
}

/** Régua de dispersão 0..10 com faixa min→max e ticks mediana (roxo) / média (âmbar). */
function ReguaDispersao({ min, max, mediana, media }: { min: number | null; max: number | null; mediana: number | null; media: number | null }) {
  const pos = (v: number | null) => (v == null ? null : Math.max(0, Math.min(100, (v / 10) * 100)))
  const a = pos(min), b = pos(max), med = pos(mediana), mea = pos(media)
  if (a == null || b == null) return <p className="text-xs text-muted-foreground">Sem dados suficientes.</p>
  return (
    <div className="pt-1">
      <div className="relative h-2.5 rounded-full bg-muted">
        <div className="absolute inset-y-0 rounded-full bg-primary/25" style={{ left: `${a}%`, width: `${Math.max(1, b - a)}%` }} />
        {med != null && <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" style={{ left: `${med}%` }} title="Mediana" />}
        {mea != null && <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500" style={{ left: `${mea}%` }} title="Média" />}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{min != null ? min.toFixed(1).replace('.', ',') : '—'}</span>
        <span>{max != null ? max.toFixed(1).replace('.', ',') : '—'}</span>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-1 rounded-full bg-primary" />mediana</span>
        <span className="flex items-center gap-1"><span className="h-2 w-1 rounded-full bg-amber-500" />média</span>
      </div>
    </div>
  )
}

function MiniStat({ label, valor }: { label: string; valor: number | null }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <p className="text-xl font-bold tabular-nums">{valor != null ? valor.toFixed(1).replace('.', ',') : '—'}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}

function MiniStatN({ label, valor, tom = 'slate' }: { label: string; valor: number; tom?: 'primary' | 'amber' | 'slate' }) {
  const cor = tom === 'primary' ? 'text-primary' : tom === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <p className={cn('text-lg font-bold tabular-nums sm:text-xl', cor)}>{String(valor).replace('.', ',')}</p>
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
      {/* Filtros — em cartão, tudo visível no mobile */}
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:min-w-[200px] sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nº ou enunciado…"
            className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="relative">
          <select value={disc} onChange={(e) => setDisc(e.target.value)}
            className="w-full appearance-none rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-auto">
            <option value="">Todas as disciplinas</option>
            {disciplinas.map((dd) => <option key={dd} value={dd}>{dd}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="inline-flex gap-1 rounded-lg border bg-muted/40 p-0.5">
          <button type="button" onClick={() => setOrdenar('ordem')} className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition', ordenar === 'ordem' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground')}>Ordem da prova</button>
          <button type="button" onClick={() => setOrdenar('dificeis')} className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition', ordenar === 'dificeis' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground')}>Mais difíceis</button>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 sm:ml-auto">
          <CheckCircle2 className="h-3.5 w-3.5" />{respondidas}/{questoes.length} respondida(s)
        </span>
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

      {/* Distribuição por alternativa (só objetivas com respostas) — barra full-width sempre visível */}
      {objetiva && !semResposta && (
        <div className="space-y-1.5 border-t bg-muted/20 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Como responderam ({q.respondida})</p>
          {q.alternativas.map((a, i) => {
            const letra = String.fromCharCode(65 + i)
            return (
              <div key={i} className={cn('rounded-lg px-2 py-2', a.correta && 'bg-emerald-500/10')}>
                <div className="flex items-center gap-2.5">
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold',
                    a.correta ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')}>{letra}</span>
                  <span className={cn('min-w-0 flex-1 truncate text-sm', a.correta ? 'font-medium' : 'text-muted-foreground')} title={a.texto}>{a.texto || '—'}</span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{a.escolhas} · {a.pctEscolha}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', a.correta ? 'bg-emerald-500' : 'bg-rose-400')} style={{ width: `${a.pctEscolha}%` }} />
                </div>
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
  slate: { chip: 'bg-slate-500/15 text-slate-600 dark:text-slate-400', bar: 'bg-slate-500', txt: 'text-slate-600 dark:text-slate-400' },
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
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
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
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
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

/** Pódio top-3 do ranking (só na tela). */
function PodioSimulado({ top, nota }: { top: DadosRelatorioSimulado['ranking']; nota: (n: number | null) => string }) {
  const by = (p: number) => top.find((t) => t.pos === p)
  const cols = [by(2), by(1), by(3)].filter(Boolean) as DadosRelatorioSimulado['ranking']
  const ped = (pos: number) => pos === 1 ? 'h-16 from-amber-300 to-amber-500' : pos === 2 ? 'h-12 from-slate-300 to-slate-400' : 'h-9 from-orange-300 to-amber-700'
  return (
    <div className="mb-4 flex items-end justify-center gap-2 rounded-2xl border bg-gradient-to-b from-amber-50/50 to-transparent p-4 pt-5 dark:from-amber-950/10 sm:gap-8">
      {cols.map((c) => (
        <div key={c.pos} className={cn('flex min-w-0 flex-1 flex-col items-center text-center sm:flex-none', c.pos === 1 ? 'sm:w-40' : 'sm:w-32')}>
          <Posicao pos={c.pos} />
          <div className="mt-2 w-full truncate text-sm font-semibold" title={c.nome}>{c.nome}</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-primary">{nota(c.nota)}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.acerto}% · {c.tempo}</div>
          <div className={cn('mt-2 flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-1.5 text-sm font-bold text-white shadow-inner', ped(c.pos))}>{c.pos}º</div>
        </div>
      ))}
    </div>
  )
}
