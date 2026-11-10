import type { Grade } from '@/lib/cronograma/tipos'

export type ResultadoGeracao =
  | { ok: true; grade: Grade; emissaoId: string | null; erroAoSalvar?: string }
  | { ok: false; error: string; semAcesso?: boolean }
