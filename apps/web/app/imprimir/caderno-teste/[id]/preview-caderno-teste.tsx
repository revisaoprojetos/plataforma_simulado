'use client'

import { Previa, type DiscBanco } from '@/lib/caderno-teste/previa'
import { PreviaBlocos } from '@/lib/caderno-teste/previa-blocos'
import { presetDoItem, type ItemCaderno, type PreviewQuestao } from '@/lib/caderno-teste/tipos'

/** Renderiza um grupo do caderno de teste com os MESMOS componentes de prévia do editor (paginado em A4). */
export function PreviewCadernoTeste({ item, questoes, vars, discBanco }: {
  item: ItemCaderno
  questoes: PreviewQuestao[]
  vars: Record<string, string>
  discBanco: DiscBanco[]
}) {
  const preset = presetDoItem(item)
  return (
    <div className="flex min-h-screen justify-center bg-neutral-100 py-4 dark:bg-neutral-900">
      {preset
        ? <PreviaBlocos presetId={preset} questoes={questoes} vars={vars} titulo={item.ajustes.titulo} capaUrl={item.ajustes.capaUrl} folhaUrl={item.ajustes.folhaUrl} capa={item.capa} docOverride={item.docEdit} />
        : <Previa item={item} questoes={questoes} vars={vars} discBanco={discBanco} />}
    </div>
  )
}
