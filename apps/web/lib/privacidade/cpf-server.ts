import { isSuperAdmin } from '@/lib/auth/permissions'
import { mascararCpf, mascararCpfProfundo, mascararCpfTexto } from './cpf'

/**
 * Decide, NO SERVIDOR, se o usuário atual pode ver o CPF completo: só o super-admin GLOBAL
 * (tabela simulado_super_admins). Memoizado por request (isSuperAdmin usa React cache).
 * Seguro por padrão: qualquer falha na checagem → mascara.
 */
export async function podeVerCpf(): Promise<boolean> {
  try { return await isSuperAdmin() } catch { return false }
}

/**
 * Devolve o "exibidor" de CPF para esta request: identidade para o super-admin, máscara
 * para os demais. Resolve a permissão UMA vez e aplica em listas inteiras sem custo extra.
 */
export async function exibidorCpf() {
  const ver = await podeVerCpf()
  return {
    ver,
    /** Um CPF (coluna). */
    cpf: (v: string | null | undefined): string | null => (ver ? (v ?? null) : mascararCpf(v)),
    /** Texto livre (ex.: corpo cru de webhook). */
    texto: (v: string | null | undefined): string | null => (ver ? (v ?? null) : mascararCpfTexto(v)),
    /** Estrutura qualquer (payload JSON, diff de auditoria). */
    profundo: <T,>(v: T): T => (ver ? v : mascararCpfProfundo(v)),
  }
}
