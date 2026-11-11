'use client'

// Seção "Posição na área de Cursos" (aba Informações do produto): como o produto aparece em Meus Extensivos do aluno.
//  · Card próprio — lado a lado na grade: escolhe a LARGURA (1 ou 2 colunas) e a ORDEM;
//  · Agrupado — dentro do card de outro extensivo (variação do mesmo card).
// Salva sozinha (não passa pelo salvarProdutoAction de substituição total).

import { useEffect, useState } from 'react'
import { Check, Columns2, Layers, LayoutGrid, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { lerPosicaoCursosAction, salvarPosicaoCursosAction, type PosicaoCursos } from './posicao-cursos-actions'

export function PosicaoCursos({ produtoId, podeEditar }: { produtoId: string; podeEditar: boolean }) {
  const [dados, setDados] = useState<PosicaoCursos | null>(null)
  const [modo, setModo] = useState<'card' | 'agrupado'>('card')
  const [agrupar, setAgrupar] = useState('')
  const [largura, setLargura] = useState<1 | 2>(1)
  const [ordem, setOrdem] = useState(0)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    lerPosicaoCursosAction(produtoId).then((r) => {
      if (!vivo) return
      if ('error' in r) { toast.error(r.error); return }
      const d = r.dados; setDados(d); setModo(d.modo); setAgrupar(d.agrupar_em ?? ''); setLargura(d.largura); setOrdem(d.ordem)
    }).catch(() => {})
    return () => { vivo = false }
  }, [produtoId])

  const sujo = !!dados && (modo !== dados.modo || (modo === 'agrupado' && agrupar !== (dados.agrupar_em ?? '')) || largura !== dados.largura || ordem !== dados.ordem)
  async function salvar() {
    if (modo === 'agrupado' && !agrupar) { toast.error('Escolha o produto em cujo card este vai aparecer.'); return }
    setSalvando(true)
    const r = await salvarPosicaoCursosAction(produtoId, { modo, agrupar_em: modo === 'agrupado' ? agrupar : null, largura, ordem })
    setSalvando(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Posição na área de Cursos salva.')
    setDados((d) => d && { ...d, modo, agrupar_em: modo === 'agrupado' ? agrupar : null, largura, ordem })
  }

  const opcoes = [
    { k: 'card' as const, titulo: 'Card próprio', desc: 'Aparece como um card separado na grade, ao lado dos outros.', Icone: LayoutGrid },
    { k: 'agrupado' as const, titulo: 'Agrupado em outro card', desc: 'Aparece dentro do card de outro extensivo, como uma variação dele.', Icone: Layers },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-start">
      <div>
        <h2 className="text-sm font-semibold">Posição na área de Cursos</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Como este produto aparece em “Meus Extensivos” para o aluno.</p>
      </div>
      {!dados ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div> : (
        <div className="space-y-4">
          {!dados.disponivel && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">Recurso ainda não ativado no banco — aplique a migração <code className="rounded bg-muted px-1">20261116010000_produto_posicao_cursos.sql</code>.</div>}
          <div className="grid gap-2 sm:grid-cols-2">
            {opcoes.map(({ k, titulo, desc, Icone }) => (
              <button key={k} type="button" disabled={!podeEditar || !dados.disponivel} onClick={() => setModo(k)} aria-pressed={modo === k}
                className={cn('flex items-start gap-3 rounded-2xl border-2 bg-card p-3 text-left transition-colors disabled:opacity-60', modo === k ? 'border-primary bg-primary/5' : 'border-transparent ring-1 ring-border hover:ring-primary/40')}>
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', modo === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icone className="h-4 w-4" /></span>
                <span><span className="block text-sm font-semibold">{titulo}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
              </button>
            ))}
          </div>

          {modo === 'card' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-sm font-medium">Largura do card na grade</span>
                <div className="grid grid-cols-2 gap-2">
                  {([1, 2] as const).map((n) => (
                    <button key={n} type="button" disabled={!podeEditar || !dados.disponivel} onClick={() => setLargura(n)} aria-pressed={largura === n}
                      className={cn('flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60', largura === n ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                      {n === 1 ? <LayoutGrid className="h-4 w-4" /> : <Columns2 className="h-4 w-4" />}{n} coluna{n === 2 ? 's' : ''}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Com 2 colunas o card ocupa o espaço de dois.</p>
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium">Ordem na lista</span>
                <Input type="number" min={0} max={9999} value={ordem} disabled={!podeEditar || !dados.disponivel} onChange={(e) => setOrdem(Math.max(0, Number(e.target.value) || 0))} className="h-10 w-28" />
                <p className="mt-1 text-xs text-muted-foreground">Menor aparece primeiro. Produtos com a mesma ordem seguem a ordem de cadastro.</p>
              </div>
            </div>
          ) : (
            <div>
              <span className="mb-1.5 block text-sm font-medium">Aparecer dentro do card de</span>
              {dados.filhos.length > 0 ? (
                <p className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Este produto já tem {dados.filhos.length} agrupado(s) dentro dele ({dados.filhos.map((f) => f.nome).join(', ')}). Mova-os antes de agrupá-lo em outro.</p>
              ) : (
                <select value={agrupar} disabled={!podeEditar || !dados.disponivel} onChange={(e) => setAgrupar(e.target.value)} className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                  <option value="">Escolha o extensivo…</option>
                  {dados.candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Se o aluno não tiver o extensivo escolhido, este volta a aparecer como card próprio — nunca some.</p>
            </div>
          )}

          {podeEditar && dados.disponivel && (
            <div className="flex items-center gap-2"><Button size="sm" onClick={salvar} disabled={!sujo || salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar posição</Button>{sujo && <span className="text-xs text-muted-foreground">Alterações não salvas</span>}</div>
          )}
        </div>
      )}
    </div>
  )
}
