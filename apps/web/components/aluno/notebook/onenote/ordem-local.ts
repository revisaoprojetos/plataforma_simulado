// Reordenação local (otimista) de listas; o servidor é a fonte da verdade da ordem.
import type { Entre } from './cliente-caderno'

/** Move `id` na lista para a posição definida por `entre` (lista já na ordem de exibição). */
export function reordenarLista<T extends { id: string }>(lista: T[], id: string, entre: Entre): T[] {
  const item = lista.find((x) => x.id === id)
  if (!item) return lista
  const sem = lista.filter((x) => x.id !== id)
  let pos = sem.length
  if (entre.depois_id) { const i = sem.findIndex((x) => x.id === entre.depois_id); if (i >= 0) pos = i }
  else if (entre.antes_id) { const i = sem.findIndex((x) => x.id === entre.antes_id); if (i >= 0) pos = i + 1 }
  sem.splice(pos, 0, item)
  return sem
}
