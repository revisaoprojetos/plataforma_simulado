import { cookies } from 'next/headers'
import { getTenantTheme } from '@/lib/tenant-theme'

/**
 * Tema (claro/escuro) para o SSR do simulado. Usa o cookie `theme` (espelho do
 * next-themes); se ausente, cai no tema padrão do tenant (`modoPadrao`).
 * Assim o servidor já renderiza no tema que o usuário está usando — sem flash.
 */
export async function resolveTemaDark(): Promise<boolean> {
  const c = (await cookies()).get('theme')?.value
  if (c === 'dark') return true
  if (c === 'light') return false
  try {
    const { modoPadrao } = await getTenantTheme()
    return modoPadrao === 'dark'
  } catch {
    return false
  }
}
