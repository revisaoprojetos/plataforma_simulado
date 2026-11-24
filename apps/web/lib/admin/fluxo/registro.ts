import 'server-only'
import type { FluxoAdaptador } from './adaptador'
import { adaptadorCronogramaAdaptativo } from './adaptadores/cronograma-adaptativo'
import { adaptadorCronogramaGerador } from './adaptadores/cronograma-gerador'

/** REGISTRO CENTRAL dos adaptadores de fluxo. Novo domínio = criar o adaptador e acrescentar UMA linha aqui (docs/fluxo-adaptadores.md). */
const ADAPTADORES: FluxoAdaptador[] = [adaptadorCronogramaAdaptativo, adaptadorCronogramaGerador]

export const listarAdaptadores = (): readonly FluxoAdaptador[] => ADAPTADORES
export const obterAdaptador = (id: string): FluxoAdaptador | null => ADAPTADORES.find((a) => a.id === id) ?? null
