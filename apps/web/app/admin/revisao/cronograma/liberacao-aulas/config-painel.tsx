'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { salvarCfgLiberacao } from './actions'
import type { ComPlano, LiberacaoCfg, ProdutoOpcao, SemPlano } from './tipos'

const CAMPO = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Seletor de produto no topo: troca `?produto=` e zera busca/filtros/página. */
export function SeletorProduto({ produtos, atual }: { produtos: ProdutoOpcao[]; atual: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pend, nav] = useTransition()
  function trocar(id: string) {
    const q = new URLSearchParams()
    for (const k of ['aba', 'sub']) { const v = sp.get(k); if (v) q.set(k, v) }
    if (id) q.set('produto', id)
    nav(() => { router.push(`${pathname}?${q.toString()}`) })
  }
  return (
    <label className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Produto</span>
      <select value={atual} onChange={(e) => trocar(e.target.value)} disabled={pend} aria-label="Produto" className={cn(CAMPO, 'min-w-[18rem]')}>
        <option value="">Escolha um produto…</option>
        {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.tipo && p.tipo !== 'extensivo' ? ` (${p.tipo})` : ''}</option>)}
      </select>
      {pend && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </label>
  )
}

const SEM: Array<{ v: SemPlano; t: string; d: string }> = [
  { v: 'planilha', t: 'Pela data da planilha', d: 'A aula abre na data de liberação da linha (4 semanas antes da primeira aparição no cronograma).' },
  { v: 'liberado', t: 'Tudo liberado', d: 'O aluno sem cronograma vê todas as aulas abertas, sem esperar a data.' },
  { v: 'atual', t: 'Disponibilidade atual do item', d: 'Mantém a regra que cada aula já tem hoje no currículo; a planilha não interfere.' },
]
const COM: Array<{ v: ComPlano; t: string; d: string }> = [
  { v: 'concluir_meta', t: 'Ao concluir a meta (padrão)', d: 'A aula só abre quando o aluno conclui a meta correspondente no cronograma dele.' },
  { v: 'plano', t: 'Quando entra no plano', d: 'A aula abre quando a meta entra no plano: data da meta menos os dias de antecedência abaixo.' },
  { v: 'mais_cedo', t: 'O que vier primeiro', d: 'Vale o que ocorrer antes: a data da planilha ou a entrada da meta no plano.' },
]

export function ConfigPainel({ produtoId, inicial, podeEditar, migrado }: { produtoId: string; inicial: LiberacaoCfg; podeEditar: boolean; migrado: boolean }) {
  const router = useRouter()
  const [cfg, setCfg] = useState<LiberacaoCfg>(inicial)
  const [pend, iniciar] = useTransition()
  const sujo = JSON.stringify(cfg) !== JSON.stringify(inicial)
  const desabilitado = !podeEditar || !migrado || pend
  const salvar = () => iniciar(async () => {
    const r = await salvarCfgLiberacao(produtoId, cfg)
    if (!r.ok) return void toast.error(r.error)
    toast.success('Configuração salva'); router.refresh()
  })

  const Opcoes = <T extends string>({ nome, valor, itens, onChange }: { nome: string; valor: T; itens: Array<{ v: T; t: string; d: string }>; onChange: (v: T) => void }) => (
    <div className="space-y-1.5">
      {itens.map((o) => (
        <label key={o.v} className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm', valor === o.v ? 'border-primary bg-primary/5' : 'hover:bg-muted/40', desabilitado && 'cursor-not-allowed opacity-70')}>
          <input type="radio" name={nome} checked={valor === o.v} disabled={desabilitado} onChange={() => onChange(o.v)} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
          <span><b className="block font-medium">{o.t}</b><span className="text-xs text-muted-foreground">{o.d}</span></span>
        </label>
      ))}
    </div>
  )

  return (
    <section className="mb-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Como as aulas são liberadas</h2>
          <p className="text-sm text-muted-foreground">Vale só para este produto. Desligado, nada muda para o aluno: as aulas seguem a disponibilidade que já têm.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={cfg.ativo} disabled={desabilitado} onChange={(e) => setCfg((c) => ({ ...c, ativo: e.target.checked }))} className="h-4 w-4 accent-[var(--primary)]" />
          Liberação por data ativa
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Aluno SEM cronograma fixado</h3>
          <Opcoes nome="sem_plano" valor={cfg.sem_plano} itens={SEM} onChange={(v) => setCfg((c) => ({ ...c, sem_plano: v }))} />
        </div>
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Aluno COM cronograma fixado</h3>
          <Opcoes nome="com_plano" valor={cfg.com_plano} itens={COM} onChange={(v) => setCfg((c) => ({ ...c, com_plano: v }))} />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <span className="font-medium">Dias de antecedência</span>
            <Input type="number" min={0} max={365} value={cfg.dias_antes} disabled={desabilitado || cfg.com_plano === 'concluir_meta'} onChange={(e) => setCfg((c) => ({ ...c, dias_antes: Math.max(0, Math.min(365, Math.trunc(Number(e.target.value)) || 0)) }))} className="h-9 w-24" />
            <span className="text-xs text-muted-foreground">{cfg.com_plano === 'concluir_meta' ? 'não se aplica a esta opção' : 'antes da data da meta no plano'}</span>
          </label>
        </div>
      </div>
      {podeEditar && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={salvar} disabled={!sujo || desabilitado}>{pend && <Loader2 className="animate-spin" />}Salvar configuração</Button>
        </div>
      )}
    </section>
  )
}
