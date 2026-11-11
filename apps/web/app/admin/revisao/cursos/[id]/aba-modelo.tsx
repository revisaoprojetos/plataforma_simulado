'use client'

import { useState } from 'react'
import { Check, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BLOCOS_EXTRAS, nomeModelo, type CursoCfg, type ModeloId } from '@/lib/revisao/cursos-defs'
import type { DadosPreview } from '@/lib/revisao/cursos'
import { salvarModeloAction } from '../actions'
import { ModeloGaleria, ModeloOpcoes, ModeloPreview } from '../modelo-ui'
import { Chip, Nota, useAcao } from '../ui-cursos'

export function AbaModelo({ id, nome, tipo, c1, c2, modelo: m0, cfg: cfg0, blk: blk0, podeEditar, dados }: {
  dados: DadosPreview; id: string; nome: string; tipo: string; c1: string; c2: string; modelo: string; cfg: CursoCfg; blk: string[]; podeEditar: boolean
}) {
  const [pendente, executar] = useAcao()
  const [modelo, setModelo] = useState<ModeloId>(m0 as ModeloId)
  const [cfg, setCfg] = useState<CursoCfg>(cfg0)
  const [blk, setBlk] = useState<string[]>(blk0)
  const lock = !podeEditar || pendente

  if (tipo === 'Extensivo') {
    return <Nota>O Extensivo usa o modelo próprio do Extensivo: disciplinas essenciais e complementares, Meta de hoje e Cronograma Adaptativo. Os modelos abaixo são para reta final, sprint, prova oral e turmas.</Nota>
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Nota>Trocar o modelo muda só a forma de mostrar o curso. Aulas, materiais e o progresso dos alunos continuam iguais.</Nota>
        <div className={lock ? 'pointer-events-none opacity-70' : ''}><ModeloGaleria atual={modelo} onPick={setModelo} /></div>
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Ajustes do modelo {nomeModelo(modelo)}</h2>
          <ModeloOpcoes modelo={modelo} cfg={cfg} onCfg={(p) => setCfg((c) => ({ ...c, ...p }))} />
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div><h2 className="text-sm font-semibold">Blocos extras</h2><p className="mt-0.5 text-xs text-muted-foreground">Somam ao modelo, na lateral da área do curso, sem mudar a ordem das aulas</p></div>
          <div className="flex flex-wrap gap-2">
            {BLOCOS_EXTRAS.map((x) => <Chip key={x} on={blk.includes(x)} disabled={lock} onClick={() => setBlk((b) => (b.includes(x) ? b.filter((y) => y !== x) : [...b, x]))}>{x}</Chip>)}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Eye className="size-3.5" />A prévia ao lado mostra o modelo escolhido, com conteúdo de exemplo.</p>
        </section>
        <div><Button size="lg" disabled={lock} onClick={() => executar(() => salvarModeloAction(id, { modelo, cfg, blk }), 'Modelo salvo')}><Check className="size-4" />Salvar modelo</Button></div>
      </div>
      <aside className="xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">Como o aluno vê</div>
        <ModeloPreview modelo={modelo} cfg={cfg} nome={nome} tipo={tipo} c1={c1} c2={c2} dados={dados} />
      </aside>
    </div>
  )
}
