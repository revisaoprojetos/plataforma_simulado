'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { Ban, Repeat, Loader2, Wand2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { anularQuestao, trocarAlternativa } from '@/app/admin/simulados/recorrecao-actions'

type Alt = { id: string; ordem: number; texto: string; correta: boolean }
export type QuestaoCorrecao = { id: string; ordem: number; enunciado: string; alternativas: Alt[] }

const letra = (i: number) => String.fromCharCode(65 + i)
const label = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'

/** Botão que abre um modal para adicionar UMA correção (anular ou trocar alternativa). */
export function AdicionarCorrecao({ simuladoId, questoes }: { simuladoId: string; questoes: QuestaoCorrecao[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [qId, setQId] = useState('')
  const [tipo, setTipo] = useState<'anular' | 'trocar'>('anular')
  const [politica, setPolitica] = useState<'pontua_todos' | 'desconsidera'>('pontua_todos')
  const [novaAlt, setNovaAlt] = useState('')
  const [motivo, setMotivo] = useState('')
  const [pending, start] = useTransition()

  const questao = useMemo(() => questoes.find((q) => q.id === qId), [questoes, qId])
  const alts = useMemo(() => (questao?.alternativas ?? []).slice().sort((a, b) => a.ordem - b.ordem), [questao])

  function reset() { setQId(''); setTipo('anular'); setNovaAlt(''); setMotivo(''); setPolitica('pontua_todos') }

  function aplicar() {
    if (!qId) return toast.error('Escolha a questão.')
    if (tipo === 'trocar' && !novaAlt) return toast.error('Escolha a nova alternativa correta.')
    start(async () => {
      const r = tipo === 'anular'
        ? await anularQuestao(simuladoId, qId, motivo, politica)
        : await trocarAlternativa(simuladoId, qId, novaAlt, motivo)
      if (r.ok) {
        toast.success(`Correção aplicada — ${r.afetados ?? 0} sessão(ões) re-corrigida(s)`)
        reset(); setOpen(false); router.refresh()
      } else {
        toast.error(r.error ?? 'Erro ao aplicar correção.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger render={<Button disabled={questoes.length === 0} className="w-full" />}>
        <Plus className="mr-1.5 h-4 w-4" /> Adicionar correção
      </DialogTrigger>

      <DialogContent className="flex max-h-[88vh] w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Adicionar correção</DialogTitle>
          <DialogDescription>Anule uma questão ou troque a alternativa correta — as provas são re-corrigidas.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-auto px-6 py-4">
          {/* Questão (topo) */}
          <div className="space-y-1.5">
            <span className={label}>Questão</span>
            <select
              value={qId}
              onChange={(e) => { setQId(e.target.value); setNovaAlt('') }}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione a questão…</option>
              {questoes.map((q) => (
                <option key={q.id} value={q.id}>Q{q.ordem}. {q.enunciado.replace(/\s+/g, ' ').slice(0, 70)}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Esquerda: mapa da questão (enunciado + alternativas) */}
            <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
              <span className={label}>Enunciado & alternativas</span>
              {questao ? (
                <>
                  <p className="max-h-40 overflow-auto whitespace-pre-line text-sm leading-relaxed">{questao.enunciado}</p>
                  <div className="space-y-1 pt-1">
                    {alts.map((a, i) => (
                      <div key={a.id} className={`rounded-md border p-2 text-xs ${a.correta ? 'border-green-500/40 bg-green-500/10' : 'bg-card'}`}>
                        <span className="mr-1 font-semibold">{letra(i)})</span>{a.texto}
                        {a.correta && <span className="ml-1 font-medium text-green-600">✓ correta atual</span>}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Selecione uma questão para ver o enunciado e as alternativas.</p>
              )}
            </div>

            {/* Direita: o que vai ser alterado */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className={label}>Tipo de correção</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {([['anular', 'Anular', Ban], ['trocar', 'Trocar alternativa', Repeat]] as const).map(([v, l, Icon]) => (
                    <button key={v} type="button" onClick={() => setTipo(v)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${tipo === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                      <Icon className="h-3.5 w-3.5" /> {l}
                    </button>
                  ))}
                </div>
              </div>

              {tipo === 'anular' ? (
                <div className="space-y-1.5">
                  <span className={label}>Política de pontuação</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([['pontua_todos', 'Pontua todos'], ['desconsidera', 'Desconsidera']] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setPolitica(v)}
                        className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${politica === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Pontua todos: o ponto é dado a todos. Desconsidera: a questão sai do total.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <span className={label}>Nova alternativa correta</span>
                  {questao ? (
                    <div className="space-y-1">
                      {alts.map((a, i) => (
                        <label key={a.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs transition-colors ${novaAlt === a.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'} ${a.correta ? 'opacity-60' : ''}`}>
                          <input type="radio" name="novaAlt" className="mt-0.5" disabled={a.correta} checked={novaAlt === a.id} onChange={() => setNovaAlt(a.id)} />
                          <span className="flex-1"><span className="mr-1 font-semibold">{letra(i)})</span>{a.texto}
                            {a.correta && <span className="ml-1 text-muted-foreground">(atual)</span>}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Selecione a questão para escolher.</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <span className={label}>Motivo (opcional)</span>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: questão sem resposta correta"
                  className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t px-6 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={pending || !qId || (tipo === 'trocar' && !novaAlt)} onClick={aplicar}>
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
            Confirmar correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
