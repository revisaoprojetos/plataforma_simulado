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

export async function lerItem(paginaId: string): Promise<ItemFila | null> {
  try { return ((await tx('readonly', (s) => s.get(paginaId))) as ItemFila | undefined) ?? null }
  catch { falhar(); return memoria.find((x) => x.paginaId === paginaId) ?? null }
}

export async function gravarItem(item: ItemFila): Promise<void> {
  memoria = mesclarFila(memoria, item)
  try {
    const ant = (await tx('readonly', (s) => s.get(item.paginaId))) as ItemFila | undefined
    const novo = ant ? mesclarFila([ant], item)[0] : item
    await tx('readwrite', (s) => s.put(novo))
  } catch { falhar() }
}

export async function removerItem(paginaId: string, opId?: string): Promise<void> {
  memoria = removerDaFila(memoria, paginaId, opId)
  try {
    const ant = (await tx('readonly', (s) => s.get(paginaId))) as ItemFila | undefined
    if (ant && (opId === undefined || ant.opId === opId)) await tx('readwrite', (s) => s.delete(paginaId))
  } catch { falhar() }
}
