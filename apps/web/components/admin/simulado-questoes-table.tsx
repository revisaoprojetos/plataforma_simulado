'use client'

import { useRouter } from 'next/navigation'
import { QuestoesTabelaBase, type QuestaoLinha } from '@/components/admin/questoes-tabela-base'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'
import { adicionarQuestoesSimulado, removerQuestoesSimulado, reordenarQuestoesSimulado, importarQuestoesSimulado } from '@/app/admin/simulados/actions'
import type { QuestaoBancoBuscaItem } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import { toast } from 'sonner'

/**
 * Aba "Questões" consolidada do simulado — usa a TABELA BASE (busca/filtros/expandir/reordenar/
 * remover) ligada às ações da PROVA (simulado_prova_questoes, o que o aluno faz). O pop-up
 * "Adicionar" reusa o AdicionarQuestoesDialog em modo callback: "Questões do sistema" devolve as
 * escolhidas e "Importar" devolve o parse — ambos aplicados à prova (e espelhados no banco container).
 */
export function SimuladoQuestoesTable({
  simuladoId,
  bancoId,
  questoes,
  disciplinas,
  cor,
}: {
  simuladoId: string
  /** Banco container (para o pop-up excluir da busca o que já está na prova). Pode ser null. */
  bancoId: string | null
  questoes: QuestaoLinha[]
  disciplinas: { id: string; nome: string }[]
  /** Cor de acento; se ausente, a TABELA BASE aplica o token de marca padrão. */
  cor?: string
}) {
  const router = useRouter()
  const jaIds = new Set(questoes.map((q) => q.id))

  async function onSelecionar(items: QuestaoBancoBuscaItem[]) {
    const ids = items.map((i) => i.id)
    const r = await adicionarQuestoesSimulado(simuladoId, ids)
    if (r.ok) { toast.success(`${r.adicionadas ?? 0} questão(ões) adicionada(s)`); router.refresh() }
    else toast.error(r.error ?? 'Erro ao adicionar')
  }

  async function onImportar(qs: QuestaoImport[]) {
    const r = await importarQuestoesSimulado(simuladoId, qs)
    if (r.ok) { toast.success(`${r.criadas ?? 0} nova(s) · ${r.adicionadas ?? 0} adicionada(s) ao simulado`); router.refresh() }
    else toast.error(r.error ?? 'Erro ao importar')
  }

  return (
    <QuestoesTabelaBase
      questoes={questoes}
      titulo="Questões do simulado"
      subtitulo="filtre, reordene, adicione e importe"
      cor={cor}
      acao={<AdicionarQuestoesDialog bancoId={bancoId} disciplinas={disciplinas} onSelecionar={onSelecionar} onImportar={onImportar} jaIds={jaIds} />}
      onRemover={async (ids) => { const r = await removerQuestoesSimulado(simuladoId, ids); if (r.ok) router.refresh(); return r }}
      onReordenar={(ids) => reordenarQuestoesSimulado(simuladoId, ids)}
    />
  )
}
