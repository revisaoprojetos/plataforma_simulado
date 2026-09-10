'use client'

import { useRouter } from 'next/navigation'
import { QuestoesTabelaBase, type QuestaoLinha } from '@/components/admin/questoes-tabela-base'
import { removerQuestoes, reordenarQuestoesBanco } from '@/app/admin/banco-questoes/actions'

/** Aba "Questões" do banco — usa a TABELA BASE de questões (busca/filtros/expandir/reordenar/remover),
 * ligada às ações do banco (remover do banco + reordenar). A base é reaproveitada por outras áreas. */
export function BancoQuestoesTable({ bancoId, questoes, acao, cor = '#6d28d9' }: { bancoId: string; questoes: QuestaoLinha[]; acao?: React.ReactNode; cor?: string }) {
  const router = useRouter()
  return (
    <QuestoesTabelaBase
      questoes={questoes}
      titulo="Questões do banco"
      subtitulo="filtre, reordene e importe"
      acao={acao}
      cor={cor}
      onRemover={async (ids) => { const r = await removerQuestoes(bancoId, ids); if (r.ok) router.refresh(); return r }}
      onReordenar={(ids) => reordenarQuestoesBanco(bancoId, ids)}
    />
  )
}
