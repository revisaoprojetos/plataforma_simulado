'use client'
import { filaCriacao } from './fila-criacao'

/** Espera a criação otimista da página (se houver). `antes`/`depois` marcam "ocupado" (o autosave só envia um por vez). undefined = nada pendente. */
export async function aguardarCriacao(paginaId: string, antes: () => void, depois: () => void): Promise<number | null | undefined> {
  if (!filaCriacao.pendente(paginaId)) return undefined
  antes()
  try { return await filaCriacao.aguardar(paginaId) } finally { depois() }
}
