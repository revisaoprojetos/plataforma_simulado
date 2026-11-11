import type { Segmento } from '@/lib/segmentos/tipos'

export type SegmentoAdmin = Segmento & { uso: number }

export interface AlvosProduto {
  modulos: { id: string; titulo: string; pai_id: string | null }[]
  aulas: { id: string; titulo: string; modulo_id: string }[]
}

export type AlvoNome = { titulo: string; sub: string | null }

/** Alvo de uma regra de conteúdo aplicada em lote (módulo ou aula do produto). */
export type AlvoLote = { tipo: 'modulo' | 'aula'; id: string }

/** Visibilidade dos módulos/aulas do produto: segmentos (id+nome) e regras de conteúdo — carga leve p/ a aba Conteúdos. */
export type VisibilidadeConteudo = {
  segmentos: Segmento[]
  regras: import('@/lib/segmentos/tipos').RegraVisibilidade[]
  /** Nomes de grupos/produtos/simulados citados nas condições dos segmentos (p/ resumos). */
  nomes: Record<string, string>
}

export type AcaoVisibilidadeLote =
  | { tipo: 'aplicar'; segmento_id: string; efeito: 'mostrar' | 'ocultar'; sem_acesso: 'oculto' | 'bloqueado_cadeado'; substituir: boolean }
  | { tipo: 'limpar' }
