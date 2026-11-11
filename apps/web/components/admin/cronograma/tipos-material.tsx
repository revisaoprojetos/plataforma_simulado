'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { RevisaoCard } from '@/components/admin/revisao/ui'
import { Pilula } from '@/app/admin/revisao/_comp/lista'
import { CR_TIPOS_MATERIAL } from '@/lib/revisao/cronograma-schema'
import { salvarTiposBloqueadosCronograma } from '@/app/admin/revisao/cronograma/actions'

/**
 * Controle global (por tenant) dos tipos de meta que o gerador adaptativo pode entregar ao aluno.
 * Compartilhado por Revisão › Cronograma › Regras e Cronograma adaptativo › Metas & inteligência
 * (mesma ação `salvarTiposBloqueadosCronograma`: authz + auditoria; grava em tema.cronograma_adaptativo_cfg, sem migração).
 */
export function TiposMaterial({ bloqueados, podeEditar, alunosComPlano }: { bloqueados: string[]; podeEditar: boolean; alunosComPlano?: number }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [bloq, setBloq] = useState<Set<string>>(new Set(bloqueados))
  const sujo = bloq.size !== bloqueados.length || bloqueados.some((t) => !bloq.has(t))
  const alternar = (chave: string, disponivel: boolean) => setBloq((p) => { const n = new Set(p); if (disponivel) n.delete(chave); else n.add(chave); return n })

  async function salvar() {
    const novos = [...bloq].filter((t) => !bloqueados.includes(t))
    if (novos.length) {
      const nomes = CR_TIPOS_MATERIAL.filter((t) => novos.includes(t.chave)).map((t) => t.rotulo).join(', ')
      const alunos = alunosComPlano !== undefined ? `${alunosComPlano} aluno${alunosComPlano === 1 ? '' : 's'} com cronograma` : 'Os alunos com cronograma'
      const ok = await confirmar({
        titulo: 'Bloquear tipo de meta',
        mensagem: `Bloquear ${nomes} para TODOS os alunos da plataforma? ${alunos}: as metas pendentes desse tipo saem no próximo recálculo do plano (e o aluno vê o tipo bloqueado no Configurar). Metas já concluídas permanecem no histórico.`,
        destrutivo: true,
      })
      if (!ok) return
    }
    start(async () => {
      const r = await salvarTiposBloqueadosCronograma([...bloq])
      if (r.ok) { toast.success('Tipos de meta salvos.'); router.refresh() } else toast.error(r.error ?? 'Falha ao salvar.')
    })
  }

  return (
    <RevisaoCard>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Tipos de meta no cronograma do aluno</h2>
          <p className="text-sm text-muted-foreground">Desligue um tipo para BLOQUEÁ-LO a qualquer aluno da plataforma: o gerador deixa de criá-lo. Vale nas próximas gerações e nos recálculos; metas já concluídas continuam no histórico e as pendentes saem no próximo recálculo.</p>
          {alunosComPlano !== undefined && <p className="mt-1 text-xs text-muted-foreground">{alunosComPlano} alunos com cronograma — vale quando o plano for gerado ou recalculado.</p>}
        </div>
        {bloq.size > 0 && <Pilula tipo="warn">{bloq.size} bloqueado{bloq.size > 1 ? 's' : ''}</Pilula>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CR_TIPOS_MATERIAL.map((t) => {
          const disponivel = !bloq.has(t.chave)
          return (
            <div key={t.chave} className={cn('flex flex-col gap-1.5 rounded-xl border p-3', !disponivel && 'border-amber-300/70 bg-amber-50/40 dark:bg-amber-950/10')}>
              <label htmlFor={`cr-tipo-${t.chave}`} className="text-sm font-medium leading-snug">{t.rotulo}</label>
              <div className="flex items-center gap-2">
                <Switch id={`cr-tipo-${t.chave}`} checked={disponivel} disabled={!podeEditar || pend} onCheckedChange={(c) => alternar(t.chave, !!c)} aria-label={`${t.rotulo} disponível ao aluno`} />
                <span className="text-sm">{disponivel ? 'Disponível ao aluno' : 'Bloqueado'}</span>
              </div>
              <small className="text-xs text-muted-foreground">{t.descricao}</small>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Ordem de prevalência: tipo bloqueado aqui &gt; disciplina desligada na aba Disciplinas &gt; ligado. PDFight não é uma meta do gerador (é material de apoio); ele continua sendo controlado por disciplina.</p>
      {podeEditar && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={salvar} disabled={pend || !sujo}><Save className="h-4 w-4" />{pend ? 'Salvando…' : 'Salvar tipos de meta'}</Button>
          {sujo && <span className="text-xs text-amber-700 dark:text-amber-400">Há alterações não salvas.</span>}
        </div>
      )}
    </RevisaoCard>
  )
}
