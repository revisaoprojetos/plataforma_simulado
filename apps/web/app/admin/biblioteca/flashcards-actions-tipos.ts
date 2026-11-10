// Tipos exportados por biblioteca/flashcards-actions.ts — fora do 'use server' para não quebrar o next build.

import type { Flashcard } from '@/lib/flashcards/flashcards'

export type FlashcardAdmin = Flashcard & { criado_em: string }
