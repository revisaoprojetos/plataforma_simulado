'use client'
// 03b §2.3 — Quem tem acesso. Origens REAIS (grupos/alunos atribuídos). Via-pacote = só leitura +
// "Gerenciar no pacote" (pacotes = fase posterior). Avulsa/Individual = permissões + remover.

import { useState } from 'react'
import { toast } from 'sonner'
import { Users2, User, X, Package, SlidersHorizontal, Loader2, UserPlus } from 'lucide-react'
import type { GestaoBase, OrigemAcesso } from '@/app/admin/biblioteca/gestao-actions'
import { removerOrigemAcesso } from '@/app/admin/biblioteca/gestao-actions'
import type { GestaoTipo } from '@/lib/biblioteca/gestao-tipos'
import { PermissaoQuadros } from '@/components/biblioteca/permissao-quadros'
import { OrigemBadge, Secao, Vazio, fmtData } from './ui'

export function AbaQuemTemAcesso({ base, origens, alcanceTotal, tipo, onIrConfig }: {
  base: GestaoBase; origens: OrigemAcesso[]; alcanceTotal: number; tipo: GestaoTipo; onIrConfig: () => void
}) {
  const [lista, setLista] = useState(origens)
  const [removendo, setRemovendo] = useState<string | null>(null)

  async function remover(o: OrigemAcesso) {
    setRemovendo(o.chave)
    const r = await removerOrigemAcesso(base.id, o.tipo, o.refId)
    setRemovendo(null)
    if (!r.ok) return toast.error(r.error || 'Falha ao remover.')
    setLista((p) => p.filter((x) => x.chave !== o.chave))
    toast.success('Origem removida.')
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => toast.info('Formulário de entrega avulsa — em construção nesta tela. Use “Acesso dos alunos” na Biblioteca.')} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Users2 className="h-3.5 w-3.5" />Entrega avulsa para um grupo</button>
          <button onClick={() => toast.info('Liberar para um aluno — em construção nesta tela. Use “Acesso dos alunos” na Biblioteca.')} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><UserPlus className="h-3.5 w-3.5" />Liberar para um aluno</button>
        </div>

        {lista.length === 0 ? (
          <Vazio>Nenhuma origem de acesso específica. Sem restrição = liberado a todos (respeitando as pastas acima).</Vazio>
        ) : (
          <div className="space-y-3">
            {lista.map((o) => {
              const viaPacote = o.origem === 'via_pacote'
              return (
                <div key={o.chave} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{o.tipo === 'grupo' ? <Users2 className="h-5 w-5" /> : <User className="h-5 w-5" />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground" title={o.nome}>{o.nome}</span>
                        <OrigemBadge origem={o.origem} />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{o.tipo === 'grupo' ? `${o.alunos} aluno(s) · grupo` : 'liberação individual'}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {o.liberadoDe ? fmtData(o.liberadoDe) : 'sem data inicial'} → {o.liberadoAte ? fmtData(o.liberadoAte) : 'sem expiração'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <PermissaoQuadros kind={base.kind} valor={o.perms} somenteLeitura />
                      {viaPacote ? (
                        <button onClick={() => toast.info('Pacotes são fase posterior.')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"><Package className="h-3.5 w-3.5" />Gerenciar no pacote</button>
                      ) : (
                        <button onClick={() => remover(o)} disabled={removendo === o.chave} aria-label="Remover origem" className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">{removendo === o.chave ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-semibold text-foreground">Legenda das permissões</div>
          {tipo.legendaPerms}
          <p className="mt-2">As permissões aqui são somente leitura: edição por origem avulsa/individual será feita no formulário de entrega. O acesso que vem do pacote só é alterado no pacote, para não quebrar o cronograma dos outros conteúdos.</p>
        </div>
      </div>

      <aside className="space-y-4">
        <Secao titulo="Alcance">
          <div className="space-y-2 text-sm">
            {lista.length === 0 ? <div className="text-xs text-muted-foreground">Sem origens específicas.</div> : lista.map((o) => (
              <div key={o.chave} className="flex items-center justify-between gap-2"><span className="truncate text-muted-foreground" title={o.nome}>{o.nome}</span><span className="font-semibold text-foreground">{o.alunos}</span></div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-semibold"><span>Total estimado</span><span>{alcanceTotal}</span></div>
          </div>
        </Secao>
        <Secao titulo="Visibilidade e proteção">
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Visível para alunos: <strong className="text-foreground">{base.oculto ? 'Não' : 'Sim'}</strong></li>
            <li>Marca d’água: <strong className="text-foreground">{base.protecao.marca_dagua ? 'Ligada' : 'Desligada'}</strong></li>
            <li>Impressão: <strong className="text-foreground">{base.protecao.pode_imprimir ? 'Permitida' : 'Bloqueada'}</strong></li>
            <li>Download: <strong className="text-foreground">{base.protecao.pode_baixar ? 'Permitido' : 'Bloqueado'}</strong></li>
          </ul>
          <button onClick={onIrConfig} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold hover:bg-muted"><SlidersHorizontal className="h-3.5 w-3.5" />Abrir configurações</button>
        </Secao>
      </aside>
    </div>
  )
}
