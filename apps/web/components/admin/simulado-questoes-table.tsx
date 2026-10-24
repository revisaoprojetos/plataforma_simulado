'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuestoesTabelaBase, type QuestaoLinha } from '@/components/admin/questoes-tabela-base'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'
import { DriveNovoStyles, DriveUploadPanel, type DriveUploadItem, type DriveUploadStatus, type DriveUploadLabels } from '@/components/admin/drive-novo'
import { adicionarQuestoesSimulado, removerQuestoesSimulado, reordenarQuestoesSimulado, importarQuestoesSimulado } from '@/app/admin/simulados/actions'
import type { QuestaoBancoBuscaItem } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import { toast } from 'sonner'

/**
 * Aba "Questões" consolidada do simulado — usa a TABELA BASE (busca/filtros/expandir/reordenar/
 * remover) ligada às ações da PROVA (simulado_prova_questoes, o que o aluno faz). O pop-up
 * "Adicionar" reusa o AdicionarQuestoesDialog em modo callback: "Questões do sistema" devolve as
 * escolhidas e "Importar" devolve o parse — ambos aplicados à prova (e espelhados no banco container).
 *
 * Progresso: adicionar/importar roda em LOTES e mostra o mesmo painel flutuante da Biblioteca
 * (DriveUploadPanel), para não ficar um "vazio total" enquanto o servidor processa.
 */
const LOTE = 30
const LABELS_Q: DriveUploadLabels = { gerundio: 'Adicionando', subSing: 'questão', subPlur: 'questões', verbSing: 'adicionada', verbPlur: 'adicionadas' }
const rotuloQuestao = (enun: string | undefined, i: number) => {
  const t = (enun ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return t ? (t.length > 72 ? `${t.slice(0, 72)}…` : t) : `Questão ${i + 1}`
}

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
  const [progresso, setProgresso] = useState<DriveUploadItem[] | null>(null)

  // Processa em LOTES e vai pintando o painel por questão (uma chamada por lote). `aplicar` recebe o lote
  // e devolve { ok, add?, error? }; `rotulo` nomeia cada linha do painel.
  async function processarEmLotes<T>(
    entradas: T[],
    aplicar: (slice: T[]) => Promise<{ ok: boolean; add?: number; error?: string }>,
    rotulo: (t: T, i: number) => string,
  ) {
    if (!entradas.length) return
    const itens: DriveUploadItem[] = entradas.map((t, i) => ({
      id: `q-${Date.now()}-${i}`, nome: rotulo(t, i), cor: 'var(--brand-primary, var(--primary))', pct: 0, status: 'enviando',
    }))
    setProgresso(itens)
    const patch = (ini: number, fim: number, status: DriveUploadStatus) =>
      setProgresso((prev) => (prev ? prev.map((x, k) => (k >= ini && k < fim ? { ...x, status, pct: status === 'ok' ? 100 : x.pct } : x)) : prev))

    let erros = 0; let ultimoErro = ''
    for (let i = 0; i < entradas.length; i += LOTE) {
      const slice = entradas.slice(i, i + LOTE)
      patch(i, i + slice.length, 'processando')
      try {
        const r = await aplicar(slice)
        if (r.ok) patch(i, i + slice.length, 'ok')
        else { erros += slice.length; ultimoErro = r.error ?? ''; patch(i, i + slice.length, 'erro') }
      } catch (e) {
        erros += slice.length; ultimoErro = e instanceof Error ? e.message : ''
        patch(i, i + slice.length, 'erro')
      }
    }
    router.refresh()
    if (erros) toast.error(ultimoErro || `${erros} questão(ões) não puderam ser adicionadas`)
  }

  async function onSelecionar(items: QuestaoBancoBuscaItem[]) {
    await processarEmLotes(
      items,
      async (slice) => { const r = await adicionarQuestoesSimulado(simuladoId, slice.map((q) => q.id)); return { ok: r.ok, add: r.adicionadas, error: r.error } },
      (q, i) => rotuloQuestao(q.enunciado, i),
    )
  }

  async function onImportar(qs: QuestaoImport[]) {
    await processarEmLotes(
      qs,
      async (slice) => { const r = await importarQuestoesSimulado(simuladoId, slice); return { ok: r.ok, add: r.adicionadas, error: r.error } },
      (q, i) => rotuloQuestao(q.enunciado, i),
    )
  }

  return (
    <>
      <DriveNovoStyles />
      <QuestoesTabelaBase
        questoes={questoes}
        titulo="Questões do simulado"
        subtitulo="filtre, reordene, adicione e importe"
        cor={cor}
        semCabecalho
        acao={<AdicionarQuestoesDialog bancoId={bancoId} disciplinas={disciplinas} onSelecionar={onSelecionar} onImportar={onImportar} jaIds={jaIds} />}
        onRemover={async (ids) => { const r = await removerQuestoesSimulado(simuladoId, ids); if (r.ok) router.refresh(); return r }}
        onReordenar={(ids) => reordenarQuestoesSimulado(simuladoId, ids)}
      />
      {progresso && progresso.length > 0 && <DriveUploadPanel itens={progresso} labels={LABELS_Q} onClose={() => setProgresso(null)} />}
    </>
  )
}
