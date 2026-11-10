// Tipos exportados de jurisprudencia/actions.ts
// Separados para compatibilidade com 'use server' + export type no Next.js

export interface DesafioListagem {
  id: string
  nome: string
  imagens: Record<string, any>
}

export type DiaEstado = 'publicada' | 'visualizavel' | 'rascunho'
