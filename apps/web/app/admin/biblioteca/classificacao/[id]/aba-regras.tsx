'use client'

// ABA "REGRAS DE USO" da classificação: UMA linha por ÁREA (tempo, gera meta, aceita partes, qtd/semana, liberação, prioridade),
// com o herdado em cinza, pré-visualizar e salvar — a mesma edição inline da matriz geral (regras-uso-compartilhado.tsx).
// Extra: copiar as regras de OUTRA classificação (prévia calculada no servidor, modo preencher/substituir).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ClipboardCopy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { MatrizRegras, PreviaRegra } from '@/lib/conteudo/classificacao/gestao-server'
import { SELECT_CLS, api, apiDetalhe } from '../classificacao-comuns'
import { BarraSalvarRegras, CamposRegras, ColunasRegrasTh, MedidasExemplo, PreviaRegras, chaveCelula, useRegrasEdicao } from '../regras-uso-compartilhado'

export function AbaRegras({ matriz, classId, outras, podeEditar }: {
  matriz: MatrizRegras; classId: string; outras: { id: string; nome: string; ativo: boolean }[]; podeEditar: boolean
}) {
  const ed = useRegrasEdicao(matriz, podeEditar)
  const [copiando, setCopiando] = useState(false)

  if (matriz.classificacoes.length === 0) {
    return <div className="rounded-xl border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">Não foi possível carregar as regras desta classificação (verifique as migrations 16 e 17).</div>
  }
  return (
    <div className="w-full space-y-4">
      {matriz.migracaoPendente && <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />A tabela de regras de uso ainda não existe (migration 17). Você pode ver, mas não salvar.</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="rounded-xl border bg-muted/30 px-3 py-2 text-[13px] text-muted-foreground">
          Uma linha por <b className="text-foreground">área</b>. Ordem de decisão: <b className="text-foreground">meta (override)</b> › <b className="text-foreground">regra desta tela</b> › <b className="text-foreground">padrão do motor</b>.
          Campos em <span className="italic">cinza</span> estão herdados; preencha para definir.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MedidasExemplo ed={ed} />
          {podeEditar && outras.length > 0 && <Button variant="outline" onClick={() => setCopiando(true)}><ClipboardCopy /> Copiar de outra…</Button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[64rem] text-[13px]">
          <thead className="bg-muted/50 text-left text-[12px] font-semibold text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted px-3 py-2">Área</th>
              <ColunasRegrasTh />
            </tr>
          </thead>
          <tbody>
            {matriz.areas.map((a) => (
              <tr key={a.id} className={cn('border-t', !!ed.pend[chaveCelula(a.id, classId)] && 'bg-primary/5')}>
                <td className="sticky left-0 z-10 bg-card px-3 py-2"><span className="block font-medium">{a.nome}</span><span className="block max-w-[14rem] text-[11.5px] text-muted-foreground">{a.desc}</span></td>
                <CamposRegras ed={ed} area={a.id} classId={classId} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PreviaRegras ed={ed} />
      <BarraSalvarRegras ed={ed} />
      {copiando && <CopiarDialog classId={classId} outras={outras} onClose={() => setCopiando(false)} />}
    </div>
  )
}

function CopiarDialog({ classId, outras, onClose }: { classId: string; outras: { id: string; nome: string; ativo: boolean }[]; onClose: () => void }) {
  const router = useRouter()
  const [origemId, setOrigemId] = useState('')
  const [modo, setModo] = useState<'preencher' | 'substituir'>('preencher')
  const [previa, setPrevia] = useState<PreviaRegra[] | null>(null)
  const [ocupado, setOcupado] = useState<'previa' | 'aplicar' | null>(null)
  const corpo = (dryRun: boolean) => ({ acao: 'clonar-regras', origemId, modo, dryRun })

  async function ver() {
    setOcupado('previa')
    const r = await api('POST', apiDetalhe(classId), corpo(true)); setOcupado(null)
    if (!r.ok) { setPrevia(null); return toast.error(r.data?.error || 'Não foi possível pré-visualizar.') }
    setPrevia(r.data.previa as PreviaRegra[])
  }
  async function aplicar() {
    setOcupado('aplicar')
    const r = await api('POST', apiDetalhe(classId), corpo(false)); setOcupado(null)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível copiar.')
    toast.success(`Regras copiadas (${r.data.aplicadas} área(s) definida(s), ${r.data.removidas} voltaram a herdar).`)
    onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !ocupado) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copiar regras de outra classificação</DialogTitle>
          <DialogDescription>Copia as regras de uso definidas na origem (por área) para esta classificação. Nada é gravado antes de você confirmar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Copiar de
            <select className={cn(SELECT_CLS, 'w-full')} value={origemId} onChange={(e) => { setOrigemId(e.target.value); setPrevia(null) }}>
              <option value="">Escolha…</option>
              {outras.map((o) => <option key={o.id} value={o.id}>{o.nome}{o.ativo ? '' : ' (arquivada)'}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium">Como copiar
            <select className={cn(SELECT_CLS, 'w-full')} value={modo} onChange={(e) => { setModo(e.target.value as typeof modo); setPrevia(null) }}>
              <option value="preencher">Só preencher o que esta classificação ainda herda</option>
              <option value="substituir">Substituir: ficar igual à origem</option>
            </select>
          </label>
          {previa && (
            <div className="rounded-xl border bg-muted/30 p-3 text-[13px]">
              <div className="mb-1 font-semibold">O que muda ({previa.length} área(s))</div>
              {previa.length === 0 ? <span className="text-muted-foreground">Nada muda.</span> : (
                <ul className="space-y-1 text-muted-foreground">
                  {previa.map((p) => <li key={p.area}><b className="text-foreground">{p.area}</b>: {p.campos.map((c) => `${c.campo.split('.')[1]} ${String(c.antes)} → ${String(c.depois)}`).join('; ') || 'sem diferença efetiva'}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={!!ocupado}>Cancelar</Button>
          <Button variant="outline" onClick={ver} disabled={!origemId || !!ocupado}>{ocupado === 'previa' && <Loader2 className="animate-spin" />} Pré-visualizar</Button>
          <Button onClick={aplicar} disabled={!origemId || !previa || !!ocupado}>{ocupado === 'aplicar' && <Loader2 className="animate-spin" />} Copiar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
