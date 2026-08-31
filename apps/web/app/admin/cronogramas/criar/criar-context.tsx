'use client'

import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Estado compartilhado da criação de cronograma (página-por-página), espelhando o assistente
 * de "novo simulado": vive no layout do grupo de rotas `/criar` (não remonta entre etapas),
 * com espelho em sessionStorage p/ resistir a refresh. NADA é gravado até "Criar" na última
 * etapa — as metas e os links são montados em memória e viram INSERT só no fim.
 */

// Bumpar a versão da chave descarta rascunhos antigos que sobrescreveriam novos defaults.
export const DRAFT_KEY = 'criar-cronograma-draft-v1'

/** Uma meta em construção (id temporário só do cliente — vira linha no banco ao salvar). */
export interface MetaDraft {
  tmpId: string
  semana: number
  dia: number
  tipo: string
  disciplina: string
  disciplina_id: string | null
  aula: string | null
  conteudo: string | null
  duracao: string | null
  ordem: number
}

/** Um link de aula em construção: (disciplina, aula) → tema + uma URL por plataforma. */
export interface LinkDraft {
  disciplina: string
  disciplina_id: string | null
  aula: string
  tema: string
  urls: Record<string, string> // slug da plataforma → url
}

export interface CronogramaDraft {
  // 1. Personalizar
  nome: string
  subtitulo: string
  categoriaId: string | null
  // 2. Estrutura
  cargaHoraria: number
  totalSemanas: number
  diasCurso: number[]
  diasNome: string[]
  semanasRevisao: number[]
  // 3. Metas & Conteúdos (em memória)
  metas: MetaDraft[]
  // 4. Links de aula (em memória)
  links: LinkDraft[]
  // 5. Acessos
  pacoteIds: string[]
  // 6. Salvar
  liberar: boolean
}

export function draftVazio(): CronogramaDraft {
  return {
    nome: '',
    subtitulo: '',
    categoriaId: null,
    cargaHoraria: 4,
    totalSemanas: 34,
    diasCurso: [1, 2, 3, 4, 5, 6],
    diasNome: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
    semanasRevisao: [],
    metas: [],
    links: [],
    pacoteIds: [],
    liberar: false,
  }
}

interface CriarCtx {
  draft: CronogramaDraft
  patch: (p: Partial<CronogramaDraft>) => void
  reset: () => void
}

const Ctx = createContext<CriarCtx | null>(null)

export function useCriar(): CriarCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCriar fora do CriarProvider')
  return c
}

export function CriarProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<CronogramaDraft>(() => {
    if (typeof window === 'undefined') return draftVazio()
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) return { ...draftVazio(), ...(JSON.parse(raw) as CronogramaDraft) }
    } catch {
      /* ignora */
    }
    return draftVazio()
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      /* quota */
    }
  }, [draft])

  const patch = (p: Partial<CronogramaDraft>) => setDraft((d) => ({ ...d, ...p }))
  const reset = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignora */
    }
    setDraft(draftVazio())
  }

  return <Ctx.Provider value={{ draft, patch, reset }}>{children}</Ctx.Provider>
}
