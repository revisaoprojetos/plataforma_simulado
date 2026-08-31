'use client'

import { faixaSemanal } from '@/lib/cronograma/faixa'
import { useCriar, useGuardStep } from '../criar-context'
import { Etapa } from '../etapa'

export default function SalvarPage() {
  useGuardStep(5)
  const { draft, patch } = useCriar()

  const podePublicar = draft.metas.length > 0

  return (
    <Etapa titulo="Revisar e criar" descricao="Confira antes de criar. O cronograma nasce como rascunho até você publicar.">
      <div className="space-y-2 rounded-2xl border bg-card p-5 shadow-sm">
        <Resumo rotulo="Nome" valor={draft.nome || '—'} />
        {draft.subtitulo && <Resumo rotulo="Subtítulo" valor={draft.subtitulo} />}
        <Resumo
          rotulo="Estrutura"
          valor={`${draft.cargaHoraria}h/dia · ${draft.totalSemanas} semanas · ${faixaSemanal(draft.diasCurso)}`}
        />
        {draft.semanasRevisao.length > 0 && <Resumo rotulo="Semanas de revisão" valor={draft.semanasRevisao.join(', ')} />}
        <Resumo rotulo="Metas" valor={draft.metas.length.toLocaleString('pt-BR')} />
        <Resumo rotulo="Links de aula" valor={draft.links.length.toLocaleString('pt-BR')} />
        <Resumo rotulo="Grupos de acesso" valor={draft.pacoteIds.length.toLocaleString('pt-BR')} />
      </div>

      <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
        <input
          type="checkbox"
          checked={draft.liberar}
          onChange={(e) => patch({ liberar: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          disabled={!podePublicar}
        />
        <span>
          <strong>Publicar assim que criar</strong>
          <span className="block text-xs text-muted-foreground">
            {podePublicar
              ? 'Fica visível para quem tem acesso. Sem marcar, nasce como rascunho.'
              : 'Adicione ao menos uma meta para poder publicar. Por ora, nasce como rascunho.'}
          </span>
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        Tudo certo? Use o botão <strong>Criar cronograma</strong> no topo. Você continua editando na tela do
        cronograma depois.
      </p>
    </Etapa>
  )
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
  )
}
