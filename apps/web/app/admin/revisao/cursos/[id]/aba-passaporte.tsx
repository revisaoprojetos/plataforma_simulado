'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Eye, FileText, Mail, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { EDITAL_MODOS, type EditalData } from '@/lib/revisao/cursos-defs'
import type { EditalContexto } from '@/lib/revisao/cursos'
import { toast } from 'sonner'
import { listarAulasEditalAction, ligarAulaEditalAction, salvarEditalAction } from '../actions'
import { Campo, Nota, ToggleRow, inputCls, useAcao } from '../ui-cursos'

const fmt = (n: number) => n.toLocaleString('pt-BR')

export function AbaPassaporte({ cursoId, tipo, edital: e0, ctx, hrefAluno, podeEditar }: {
  cursoId: string; tipo: string; edital: EditalData; ctx: EditalContexto; hrefAluno: string | null; podeEditar: boolean
}) {
  const [pendente, executar] = useAcao()
  const [ed, setEd] = useState<EditalData>(e0)
  const [painel, setPainel] = useState(false)
  const [modSel, setModSel] = useState<string>(ctx.cobertura[0]?.id ?? '')
  const [aulas, setAulas] = useState<{ id: string; titulo: string; ligada: boolean }[] | null>(null)
  const lock = !podeEditar || pendente

  if (tipo === 'Extensivo') {
    return <Nota>O Extensivo é a base do Passaporte: é nele que roda o Cronograma Adaptativo. As retas finais se conciliam com ele.</Nota>
  }
  const set = (p: Partial<EditalData>) => setEd((x) => ({ ...x, ...p }))
  const alternarModo = (k: 'conciliar' | 'seguir' | 'curso') => {
    if (ed.modos.includes(k) && ed.modos.length === 1) { toast.error('Deixe pelo menos uma opção para o aluno'); return }
    set({ modos: ed.modos.includes(k) ? ed.modos.filter((m) => m !== k) : [...ed.modos, k] })
  }
  async function abrirAulas(modulo: string) {
    setModSel(modulo); setAulas(null)
    if (!modulo) return
    const r = await listarAulasEditalAction(cursoId, modulo)
    if ('error' in r) { toast.error(r.error); return }
    setAulas(r.aulas)
  }
  function ligar(id: string, ligada: boolean) {
    setAulas((l) => l?.map((a) => (a.id === id ? { ...a, ligada } : a)) ?? l)
    executar(() => ligarAulaEditalAction(cursoId, id, ligada))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {([[ctx.alunosPassaporte, 'alunos do Passaporte com este edital', false], [ctx.conciliaram, 'conciliaram', false], [ctx.seguem, 'seguem o cronograma do edital', false], [ctx.naoEscolheram, 'ainda não escolheram', true]] as const).map(([v, l, alerta]) => (
          <div key={l} className="rounded-2xl border bg-card p-4 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</span>
            <b className={cn('mt-1 block text-3xl font-extrabold tabular-nums', alerta && v > 0 && 'text-amber-600 dark:text-amber-400')}>{fmt(v)}</b>
          </div>
        ))}
      </div>
      {ctx.naoEscolheram > 0 && (
        <Nota tipo="gold">
          <Mail className="mr-1 inline size-3.5" />{fmt(ctx.naoEscolheram)} alunos do Passaporte ainda não escolheram como estudar para este edital.{' '}
          <Link href="/admin/revisao/campanhas" className="font-semibold underline underline-offset-4">Enviar lembrete por e-mail</Link>
        </Nota>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Edital</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <ToggleRow checked={ed.pass} disabled={lock} onChange={(v) => set({ pass: v })} rotulo="Entra no Passaporte"><b>Entra no Passaporte</b></ToggleRow>
            <span className="text-xs text-muted-foreground">todo aluno Passaporte recebe este curso</span>
          </div>
          <Campo rotulo="Órgão"><input className={inputCls} value={ed.orgao} disabled={lock} placeholder="Nome do órgão do edital" onChange={(e) => set({ orgao: e.target.value })} /></Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Edital publicado em"><input type="date" className={inputCls} value={ed.pub} disabled={lock} onChange={(e) => set({ pub: e.target.value })} /></Campo>
            <Campo rotulo="Data da prova" dica="Usada na contagem e no fim da conciliação."><input type="date" className={inputCls} value={ed.prova} disabled={lock} onChange={(e) => set({ prova: e.target.value })} /></Campo>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Quem comprou só este curso</span>
            <small className="text-xs text-muted-foreground">Vê apenas a área deste curso, no modelo escolhido em “Como o aluno vê”. {fmt(ctx.avulsos)} alunos avulsos hoje.</small>
            {hrefAluno && <a href={hrefAluno} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-1 self-start')}><Eye className="size-3.5" />Ver a área do aluno avulso</a>}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Escolhas que o aluno do Passaporte tem</h2>
          <div className="flex flex-col gap-2">
            {(Object.keys(EDITAL_MODOS) as ('conciliar' | 'seguir' | 'curso')[]).map((k) => {
              const on = ed.modos.includes(k)
              return (
                <button key={k} type="button" disabled={lock} aria-pressed={on} onClick={() => alternarModo(k)}
                  className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary/50')}>
                  {on && <Check className="mt-0.5 size-4 shrink-0" />}
                  <span><b className="block">{EDITAL_MODOS[k][0]}</b><span className={cn('text-xs', on ? 'opacity-85' : 'text-muted-foreground')}>{EDITAL_MODOS[k][1]}</span></span>
                </button>
              )
            })}
          </div>
          <Campo rotulo={`Tempo sugerido para o edital na conciliação: ${ed.peso}%`} dica={`O aluno pode ajustar entre ${ed.min}% e ${ed.max}% do tempo diário.`}>
            <input type="range" min={ed.min} max={ed.max} step={10} value={ed.peso} disabled={lock} onChange={(e) => set({ peso: Number(e.target.value) })} className="accent-primary" />
          </Campo>
          <ToggleRow checked={ed.final} disabled={lock} onChange={(v) => set({ final: v })} rotulo="Revisão final">Nas 2 semanas antes da prova, 100% do tempo vai para o edital</ToggleRow>
          <ToggleRow checked={ed.volta} disabled={lock} onChange={(v) => set({ volta: v })} rotulo="Volta ao Extensivo">Depois da prova, o cronograma volta ao Extensivo de onde parou</ToggleRow>
        </section>
      </div>

      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span>
            <div><h2 className="text-sm font-semibold">Aulas do Extensivo que cobrem este edital</h2><p className="text-xs text-muted-foreground">Na conciliação, essas aulas sobem na fila e contam para o Extensivo e para o edital ao mesmo tempo</p></div>
          </div>
          <Button variant="outline" size="sm" disabled={!ctx.cobertura.length} onClick={() => { const v = !painel; setPainel(v); if (v && modSel) abrirAulas(modSel) }}><Pencil className="size-3.5" />Escolher aulas</Button>
        </div>
        <div className="p-4">
          {ctx.cobertura.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {ctx.cobertura.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border bg-background p-3">
                  <span className="h-8 w-1 rounded-full bg-primary" />
                  <span className="text-sm"><b>{r.titulo}</b><small className="block text-xs text-muted-foreground">{r.ligadas} de {r.total} aulas ligadas</small></span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum Extensivo ativo com módulos cadastrados.</p>
          )}
          {painel && (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border bg-muted/30 p-3">
              <select className={inputCls} value={modSel} onChange={(e) => abrirAulas(e.target.value)} aria-label="Disciplina">
                {ctx.cobertura.map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}
              </select>
              {aulas === null ? <p className="text-xs text-muted-foreground">Carregando aulas…</p> : !aulas.length ? <p className="text-xs text-muted-foreground">Esta disciplina não tem aulas cadastradas.</p> : (
                <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
                  {aulas.map((a) => (
                    <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={a.ligada} disabled={lock} onChange={(e) => ligar(a.id, e.target.checked)} className="accent-primary" />{a.titulo}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Conteúdo que só existe no edital (como a legislação estadual) entra como metas novas.</p>
        </div>
      </section>

      <div><Button size="lg" disabled={lock} onClick={() => executar(() => salvarEditalAction(cursoId, ed), 'Edital salvo')}><Check className="size-4" />Salvar</Button></div>
    </div>
  )
}
