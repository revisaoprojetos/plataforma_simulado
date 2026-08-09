'use client'

import { Printer } from 'lucide-react'
import { Previa, type DiscBanco } from '@/lib/caderno-teste/previa'
import { PreviaBlocos } from '@/lib/caderno-teste/previa-blocos'
import { presetDoItem, type ItemCaderno, type PreviewQuestao } from '@/lib/caderno-teste/tipos'

/** Renderiza um grupo do caderno de teste com os MESMOS componentes de prévia do editor (paginado em A4). */
export function PreviewCadernoTeste({ item, questoes, vars, discBanco, standalone }: {
  item: ItemCaderno
  questoes: PreviewQuestao[]
  vars: Record<string, string>
  discBanco: DiscBanco[]
  standalone?: boolean
}) {
  const preset = presetDoItem(item)
  return (
    <div className="flex min-h-screen justify-center bg-neutral-100 py-4 dark:bg-neutral-900">
      {/* Impressão: folha A4 sem margem do navegador; esconde a barra de ação. */}
      <style>{'@media print{@page{size:A4;margin:0}body{background:#fff!important}.no-print{display:none!important}}'}</style>
      {standalone && (
        <div className="no-print fixed right-4 top-4 z-50">
          <button type="button" onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90">
            <Printer className="h-4 w-4" /> Imprimir / Salvar como PDF
          </button>
        </div>
      )}
      {preset
        ? <PreviaBlocos presetId={preset} questoes={questoes} vars={vars} titulo={item.ajustes.titulo} capaUrl={item.ajustes.capaUrl} folhaUrl={item.ajustes.folhaUrl} capa={item.capa} docOverride={item.docEdit} />
        : <Previa item={item} questoes={questoes} vars={vars} discBanco={discBanco} />}
    </div>
  )
}
