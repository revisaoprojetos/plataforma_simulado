'use client'
// Fila offline do Caderno (beta): IndexedDB com try/catch e FALLBACK EM MEMÓRIA.
// Dentro do iframe cross-origin (Curseduca) o storage pode estar bloqueado — nesse caso `semPersistencia()` = true
// e a UI avisa que a cópia local não sobrevive a recarregar a página.
import { mesclarFila, removerDaFila, type ItemFila } from '@/lib/aluno/notebook-autosave'

const DB = 'caderno-beta'
const STORE = 'fila'
let memoria: ItemFila[] = []
let idbFalhou = false
let dbp: Promise<IDBDatabase> | null = null
const ouvintes = new Set<() => void>()

// DONO da fila: a fila (IndexedDB) é do navegador, não do usuário. Ao abrir o caderno informamos o estudante; se o dono guardado for
// outro (troca de conta no mesmo navegador/logout+login), a fila antiga é APAGADA antes de qualquer leitura/gravação.
const CHAVE_DONO = 'caderno-beta:fila-dono'
let pronto: Promise<void> = Promise.resolve()
export function definirDonoFila(estudanteId: string): void {
  pronto = (async () => {
    try {
      if (localStorage.getItem(CHAVE_DONO) === estudanteId) return
      memoria = []; jaLidas.clear()
      try { await tx('readwrite', (st) => st.clear()) } catch { falhar() }
      localStorage.setItem(CHAVE_DONO, estudanteId)
    } catch { /* storage bloqueado (iframe): sem dono, mantém o comportamento anterior */ }
  })()
}

export const semPersistencia = () => idbFalhou
export const aoMudarPersistencia = (fn: () => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn) } }

function falhar() { if (!idbFalhou) { idbFalhou = true; ouvintes.forEach((f) => f()) } }

function abrir(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((ok, no) => {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('sem idb')
      const rq = indexedDB.open(DB, 1)
      rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE, { keyPath: 'paginaId' }) }
      rq.onsuccess = () => ok(rq.result)
      rq.onerror = () => no(rq.error)
      rq.onblocked = () => no(new Error('bloqueado'))
    } catch (e) { no(e) }
  })
  dbp.catch(() => { falhar() })
  return dbp
}

async function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir()
  return new Promise<T>((ok, no) => {
    const t = db.transaction(STORE, modo)
    const r = fn(t.objectStore(STORE))
    t.oncomplete = () => ok(r.result)
    t.onerror = () => no(t.error)
    t.onabort = () => no(t.error)
  })
}

/** UMA transação readwrite com leitura + escrita condicional (atômica; sem 2 idas ao IndexedDB). */
async function lerEEscrever(paginaId: string, decidir: (ant: ItemFila | undefined, s: IDBObjectStore) => void): Promise<void> {
  const db = await abrir()
  return new Promise<void>((ok, no) => {
    const t = db.transaction(STORE, 'readwrite')
    const s = t.objectStore(STORE)
    const g = s.get(paginaId)
    g.onsuccess = () => { try { decidir(g.result as ItemFila | undefined, s) } catch (e) { try { t.abort() } catch { /* já abortada */ } no(e) } }
    t.oncomplete = () => ok()
    t.onerror = () => no(t.error)
    t.onabort = () => no(t.error)
  })
}

// Páginas cujo item do IndexedDB já foi lido nesta sessão (o `lerItem` da montagem restaura o que havia): nelas a fila em memória já
// contém tudo o que está no disco, então gravar é um `put` ÚNICO (sem get). Nas demais, get+put numa só transação.
const jaLidas = new Set<string>()

export async function lerItem(paginaId: string): Promise<ItemFila | null> {
  await pronto
  try { const it = ((await tx('readonly', (s) => s.get(paginaId))) as ItemFila | undefined) ?? null; jaLidas.add(paginaId); return it }
  catch { falhar(); return memoria.find((x) => x.paginaId === paginaId) ?? null }
}

export async function gravarItem(item: ItemFila): Promise<void> {
  await pronto
  const tinha = memoria.some((x) => x.paginaId === item.paginaId)
  memoria = mesclarFila(memoria, item)
  try {
    if (tinha || jaLidas.has(item.paginaId)) {
      const mesclado = memoria.find((x) => x.paginaId === item.paginaId) ?? item
      await tx('readwrite', (s) => s.put(mesclado))
    } else {
      await lerEEscrever(item.paginaId, (ant, s) => { s.put(ant ? mesclarFila([ant], item)[0] : item) })
    }
    jaLidas.add(item.paginaId)
  } catch { falhar() }
}

export async function removerItem(paginaId: string, opId?: string): Promise<void> {
  await pronto
  memoria = removerDaFila(memoria, paginaId, opId)
  try {
    if (opId === undefined) await tx('readwrite', (s) => s.delete(paginaId)) // sem condição: delete direto
    else await lerEEscrever(paginaId, (ant, s) => { if (ant && ant.opId === opId) s.delete(paginaId) })
  } catch { falhar() }
}
