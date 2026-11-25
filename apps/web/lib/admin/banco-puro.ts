/** Lógica pura da aba "Banco" (Sistema > Cache e banco). */

/** `postgres.<ref>` (usuário do pooler Supabase) → `<ref>`; null se não casar. */
export function extrairRef(usuario: string | null | undefined): string | null {
  const m = /^[a-z_]+\.([a-z0-9]{10,})$/i.exec(usuario ?? '')
  return m ? m[1] : null
}

const MB = 1024 * 1024

/** Selo BLOAT: TOAST grande e desproporcional aos dados da tabela, ou muitas linhas mortas numa tabela grande. */
export function seloBloat(t: { totalBytes: number; dadosBytes: number; toastBytes: number; pctMortas: number }): boolean {
  if (t.totalBytes < 100 * MB) return false
  const toastDesproporcional = t.toastBytes >= 100 * MB && t.toastBytes >= 10 * Math.max(t.dadosBytes, MB)
  return toastDesproporcional || t.pctMortas >= 30
}

export const FUNCOES_PURGA = ['purgar_audit_logs_antigos', 'purgar_webhook_inbox_processado', 'purgar_integracao_eventos_processados'] as const
export type FuncaoPurga = (typeof FUNCOES_PURGA)[number]
export function funcaoPurgaValida(f: unknown): f is FuncaoPurga {
  return typeof f === 'string' && (FUNCOES_PURGA as readonly string[]).includes(f)
}
