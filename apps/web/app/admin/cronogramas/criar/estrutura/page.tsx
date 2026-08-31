'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import { useCriar, useGuardStep } from '../criar-context'
import { Etapa } from '../etapa'

// Ordem fixa: domingo por último — na semana de estudo ele fecha, não abre (R3).
const DIAS = [
  { valor: 1, nome: 'Seg' },
  { valor: 2, nome: 'Ter' },
  { valor: 3, nome: 'Qua' },
  { valor: 4, nome: 'Qui' },
  { valor: 5, nome: 'Sex' },
  { valor: 6, nome: 'Sáb' },
  { valor: 0, nome: 'Dom' },
]

export default function EstruturaPage() {
  useGuardStep(1)
  const { draft, patch } = useCriar()

  function alternarDia(valor: number) {
    const tem = draft.diasCurso.includes(valor)
    const dias = tem ? draft.diasCurso.filter((d) => d !== valor) : [...draft.diasCurso, valor]
    // dias_nome alinhado a dias_curso, na ordem fixa de DIAS — a invariante que o banco também cobra.
    const ordenados = DIAS.filter((d) => dias.includes(d.valor))
    patch({ diasCurso: ordenados.map((d) => d.valor), diasNome: ordenados.map((d) => d.nome) })
  }

  return (
    <Etapa titulo="Estrutura" descricao="A grade fixa: carga por dia, número de semanas e os dias de curso.">
      <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Carga (h/dia)</Label>
            <Input
              type="number"
              min={1}
              step="0.5"
              value={draft.cargaHoraria}
              onChange={(e) => patch({ cargaHoraria: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Semanas</Label>
            <Input
              type="number"
              min={1}
              value={draft.totalSemanas}
              onChange={(e) => patch({ totalSemanas: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Dias de curso</Label>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map((d) => {
              const ativo = draft.diasCurso.includes(d.valor)
              return (
                <button
                  key={d.valor}
                  type="button"
                  onClick={() => alternarDia(d.valor)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition',
                    ativo ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {d.nome}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {draft.diasCurso.length > 0 ? `${faixaSemanal(draft.diasCurso)} · ` : ''}a ordem é fixa: domingo, quando usado, é o último dia da semana.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>
            Semanas de revisão originais <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            value={draft.semanasRevisao.join(', ')}
            onChange={(e) =>
              patch({
                semanasRevisao: e.target.value
                  .split(',')
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0),
              })
            }
            placeholder="12, 24"
          />
          <p className="text-xs text-muted-foreground">
            Semanas da grade original que não têm metas — descartadas na geração e substituídas pela
            periodicidade que o aluno escolher.
          </p>
        </div>
      </div>
    </Etapa>
  )
}
