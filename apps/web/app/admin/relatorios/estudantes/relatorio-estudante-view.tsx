'use client'

import { KpiCard, Painel, Hero, AreaSpark, BarrasDupla, ListaBusca, BotaoExportar, baixarCsv } from '@/components/admin/relatorios/viz'
import { ClipboardList, Trophy, Target, Clock, TrendingUp, TrendingDown, Minus, GraduationCap, BookOpen } from 'lucide-react'

export type DadosRelatorioEstudante = {
  nome: string
  simulados: number
  notaMedia: number | null
  melhorNota: number | null
  acertoMedio: number | null
  tempoMedioMin: number | null
  evolucao: { rotulo: string; nota: number }[]
  porDisciplina: { nome: string; aluno: number; turma: number }[]
  historico: { simulado: string; quando: string; nota: number | null; acerto: number; tempo: string }[]
}

export function RelatorioEstudanteView({ d, print }: { d: DadosRelatorioEstudante; print?: boolean }) {
  const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
  const sobe = d.evolucao.length >= 2 && d.evolucao[d.evolucao.length - 1].nota >= d.evolucao[0].nota
  const temTend = d.evolucao.length >= 2

  function exportar() {
    const linhas: (string | number | null)[][] = [
      ['Relatório do estudante', d.nome],
      ['Simulados', d.simulados, 'Nota média', nota(d.notaMedia), 'Melhor', nota(d.melhorNota), 'Acerto médio', d.acertoMedio != null ? `${d.acertoMedio}%` : '—'],
      [],
      ['Histórico'], ['Simulado', 'Quando', 'Nota', 'Acerto %', 'Tempo'],
      ...d.historico.map((h) => [h.simulado, h.quando, nota(h.nota), h.acerto, h.tempo]),
      [],
      ['Acerto por disciplina (aluno x turma)'], ['Disciplina', 'Aluno %', 'Turma %'],
      ...d.porDisciplina.map((x) => [x.nome, x.aluno, x.turma]),
    ]
    baixarCsv(`${d.nome}_relatorio`, linhas)
  }

  return (
    <div className="space-y-5">
      <Hero icon={<GraduationCap className="h-6 w-6" />} tom="primary" titulo={d.nome}
        badge={!temTend ? undefined : <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sobe ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'}`}>{sobe ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{sobe ? 'Evoluindo' : 'Em queda'}</span>}
        subtitulo="Evolução e desempenho vs. a turma" acoes={print ? undefined : <BotaoExportar onClick={exportar} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Simulados feitos" valor={d.simulados} icon={<ClipboardList className="h-4 w-4" />} tom="primary" />
        <KpiCard label="Nota média" valor={nota(d.notaMedia)} sub={`melhor ${nota(d.melhorNota)}`} icon={<Trophy className="h-4 w-4" />} tom="amber" />
        <KpiCard label="Acerto médio" valor={d.acertoMedio != null ? `${d.acertoMedio}%` : '—'} icon={<Target className="h-4 w-4" />} tom="emerald" />
        <KpiCard label="Tempo médio" valor={d.tempoMedioMin != null ? `${d.tempoMedioMin}min` : '—'} icon={<Clock className="h-4 w-4" />} tom="violet" />
        <KpiCard label="Tendência" valor={!temTend ? '—' : sobe ? 'Subindo' : 'Caindo'} icon={!temTend ? <Minus className="h-4 w-4" /> : sobe ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} tom={!temTend ? 'slate' : sobe ? 'emerald' : 'rose'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Evolução da nota" sub="Nota em cada simulado, na ordem cronológica" tom="primary" icon={<TrendingUp className="h-4 w-4" />}>
          <AreaSpark pontos={d.evolucao.map((x) => ({ rotulo: x.rotulo, valor: x.nota }))} tom="primary" min={0} max={10} formato={(n) => n.toFixed(1).replace('.', ',')} />
        </Painel>
        <Painel titulo="Acerto por disciplina" sub="Comparação do estudante com a média da turma" tom="emerald" icon={<BookOpen className="h-4 w-4" />}>
          <BarrasDupla itens={d.porDisciplina.map((x) => ({ rotulo: x.nome, a: x.aluno, b: x.turma }))} aTom="primary" bTom="slate" aNome="Aluno" bNome="Turma" />
        </Painel>
      </div>

      <Painel titulo="Histórico de simulados" sub={d.historico.length ? `${d.historico.length} realização(ões)` : undefined} tom="violet" icon={<ClipboardList className="h-4 w-4" />}>
        <ListaBusca itens={d.historico} placeholder="Buscar simulado pelo título…" vazio="Sem simulados finalizados ainda." print={print}
          filtro={(h, t) => h.simulado.toLowerCase().includes(t)}>
          {(h, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{h.simulado}</div>
                <div className="text-xs text-muted-foreground">{h.quando} · {h.tempo}</div>
              </div>
              <div className="hidden w-40 shrink-0 sm:block">
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground"><span>acerto</span><span className="font-medium tabular-nums">{h.acerto}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${h.acerto}%` }} /></div>
              </div>
              <div className="shrink-0 border-l pl-4 text-right">
                <div className="text-xl font-bold tabular-nums text-primary">{nota(h.nota)}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">nota</div>
              </div>
            </div>
          )}
        </ListaBusca>
      </Painel>
    </div>
  )
}
