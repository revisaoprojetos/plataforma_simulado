// Tipos exportados por biblioteca/areas-actions.ts — fora do 'use server' para não quebrar o next build.

import type { AreaDoc, RegraArea, EstiloExp } from '@/lib/conteudo/areas'

type Opcao = { id: string; nome: string }
export type DadosAreas = {
  ok: true
  areas: AreaDoc[]
  regras: RegraArea[]
  produtos: Opcao[]
  segmentos: Opcao[]
  grupos: Opcao[]
  alunos: Record<string, string>
  estiloPadrao: EstiloExp
}
export type EntradaRegra = {
  id?: string | null
  area_key: string
  efeito: 'mostrar' | 'ocultar'
  produto_id: string | null
  publico_tipo: 'todos' | 'segmento' | 'grupo' | 'aluno'
  publico_id: string | null
}
