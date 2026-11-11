'use client'

// Editor de SEGMENTO embutido no modal de Segmentos (sem pop-up separado). Layout simplificado em duas colunas:
// à esquerda as CONDIÇÕES (grupos com "todas/qualquer"), à direita nome, descrição, resumo e teste com um aluno.
// Mesma lógica/validação do criador da aba Visibilidade (salvarSegmentoAction).

import { useState, useTransition } from 'react'
import { ArrowLeft, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { novaCondicao, novoGrupo, resumoRegra, validarRegra, type Condicao, type GrupoCondicoes, type RegraSegmento, type Segmento } from '@/lib/segmentos/tipos'
import { salvarSegmentoAction } from './visibilidade-actions'
import { JuncaoToggle, LinhaCondicao, TestarAluno } from './aba-visibilidade'

export function SegmentoEditor({ seg, produtoId, podeEditar, nomes, onNomes, onVoltar, onSalvo }: {
  seg: Segmento | null; produtoId: string; podeEditar: boolean; nomes: Record<string, string>
  onNomes: (n: Record<string, string>) => void; onVoltar: () => void; onSalvo: (s: Segmento) => void
}) {
  const [nome, setNome] = useState(seg?.nome ?? '')
  const [descricao, setDescricao] = useState(seg?.descricao ?? '')
  const [regra, setRegra] = useState<RegraSegmento>(() => (seg?.regra.grupos.length ? seg.regra : { op: 'e', grupos: [novoGrupo()] }))
  const [teste, setTeste] = useState<null | { aluno: { id: string; nome: string }; corresponde: boolean; condicoes: Record<string, boolean>; grupos: Record<string, boolean> }>(null)
  const [pending, start] = useTransition()

  function mudarGrupo(gid: string, f: (g: GrupoCondicoes) => GrupoCondicoes | null) {
    setTeste(null)
    setRegra((r) => ({ ...r, grupos: r.grupos.map((g) => (g.id === gid ? f(g) : g)).filter(Boolean) as GrupoCondicoes[] }))
  }
  const mudarCond = (gid: string, cid: string, patch: Partial<Condicao>) => mudarGrupo(gid, (g) => ({ ...g, condicoes: g.condicoes.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }))
  const removerCond = (gid: string, cid: string) => mudarGrupo(gid, (g) => { const cs = g.condicoes.filter((c) => c.id !== cid); return cs.length ? { ...g, condicoes: cs } : null })

  function salvar() {
    const erro = !nome.trim() ? 'Dê um nome ao segmento.' : validarRegra(regra)
    if (erro) { toast.error(erro); return }
    start(async () => {
      const r = await salvarSegmentoAction({ id: seg?.id, nome, descricao, regra })
      if ('error' in r) { toast.error(r.error); return }
      onNomes(r.nomes); toast.success(seg ? 'Segmento atualizado.' : 'Segmento criado.'); onSalvo(r.segmento)
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b bg-card px-6 py-3">
        <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar</button>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{seg ? `Editar segmento · ${seg.nome}` : 'Novo segmento'}</h3>
        <Button variant="ghost" onClick={onVoltar} disabled={pending}>Cancelar</Button>
        {podeEditar && <Button onClick={salvar} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar segmento</Button>}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        {/* Condições */}
        <section className="min-h-0 space-y-3 overflow-y-auto p-6">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quem entra neste segmento</h4>
            <p className="mt-1 text-xs text-muted-foreground">Monte as condições. Ex.: “Está no grupo Black” <b>e</b> “Vencimento da assinatura nos próximos 30 dias”.</p>
          </div>
          {regra.grupos.map((g, gi) => (
            <div key={g.id}>
              {gi > 0 && (
                <div className="flex items-center gap-3 py-2"><div className="h-px flex-1 bg-border" /><JuncaoToggle valor={regra.op} onChange={(op) => { setTeste(null); setRegra((r) => ({ ...r, op })) }} disabled={!podeEditar} grande /><div className="h-px flex-1 bg-border" /></div>
              )}
              <div className={cn('rounded-2xl border bg-card shadow-sm', teste && (teste.grupos[g.id] ? 'border-emerald-500/60' : 'border-destructive/50'))}>
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wide">Grupo {gi + 1}</span>
                  {g.condicoes.length > 1 && <><span>· corresponder a</span><JuncaoToggle valor={g.op} onChange={(op) => mudarGrupo(g.id, (x) => ({ ...x, op }))} disabled={!podeEditar} rotulos={['todas (E)', 'qualquer (OU)']} /></>}
                  {regra.grupos.length > 1 && podeEditar && <button type="button" onClick={() => mudarGrupo(g.id, () => null)} className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"><Trash2 className="h-3.5 w-3.5" />Remover grupo</button>}
                </div>
                <div className="space-y-2 p-3">
                  {g.condicoes.map((c, ci) => (
                    <div key={c.id}>
                      {ci > 0 && <div className="py-1 pl-1 text-[11px] font-bold uppercase tracking-wider text-primary">{g.op === 'ou' ? 'ou' : 'e'}</div>}
                      <LinhaCondicao c={c} nomes={nomes} disabled={!podeEditar} produtoId={produtoId} resultado={teste ? teste.condicoes[c.id] : undefined}
                        onChange={(p) => mudarCond(g.id, c.id, p)} onNome={(id, n) => onNomes({ [id]: n })} onRemover={() => removerCond(g.id, c.id)} />
                    </div>
                  ))}
                  {podeEditar && <button type="button" onClick={() => mudarGrupo(g.id, (x) => ({ ...x, condicoes: [...x.condicoes, novaCondicao()] }))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10"><Plus className="h-4 w-4" />Adicionar condição</button>}
                </div>
              </div>
            </div>
          ))}
          {podeEditar && <button type="button" onClick={() => { setTeste(null); setRegra((r) => ({ ...r, grupos: [...r.grupos, novoGrupo()] })) }} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Adicionar outro grupo de condições</button>}
        </section>

        {/* Nome, resumo e teste */}
        <section className="min-h-0 space-y-4 overflow-y-auto border-t bg-muted/30 p-6 lg:border-l lg:border-t-0">
          <label className="block space-y-1.5"><span className="text-sm font-medium">Nome do segmento</span>
            <Input autoFocus={!seg} value={nome} onChange={(e) => setNome(e.target.value.slice(0, 250))} maxLength={250} disabled={!podeEditar} placeholder="Ex.: Alunos do grupo Black" className="h-10" /></label>
          <label className="block space-y-1.5"><span className="text-sm font-medium">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value.slice(0, 1000))} rows={3} disabled={!podeEditar} placeholder="Para encontrar este segmento depois…" className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <div className="rounded-xl bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground"><b className="text-foreground">Resumo:</b> {resumoRegra(regra, nomes)}</div>
          <TestarAluno regra={regra} teste={teste} onTeste={setTeste} />
        </section>
      </div>
    </div>
  )
}
