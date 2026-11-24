// Eyebrow (rótulo pequeno dourado acima do H1) derivado do SETOR da rota na sidebar — função pura.
// Usada por <CabecalhoArea> (components/admin/cabecalho-area.tsx). Sem I/O, client-safe.
import { resolverRota } from '@/lib/admin/setores'

const SEM_QUERY = { get: () => null }

/**
 * Rótulo do setor (Início, Pedagógico, Alunos, Atendimento, Análise, Admin, Super Admin) a que a rota pertence,
 * ou `undefined` quando a rota não está em nenhum setor. Casa pelo PATH (a query não influencia o setor).
 * `override` (string não vazia) vence a derivação.
 */
export function eyebrowDoSetor(pathname: string | null | undefined, override?: string | null): string | undefined {
  const o = override?.trim()
  if (o) return o
  if (!pathname) return undefined
  return resolverRota(pathname, SEM_QUERY)?.setor.label
}
