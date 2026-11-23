import { GateSuperOnly } from '@/components/admin/gate-super-only'

// Área reservada ao SUPER-ADMIN global (ver lib/admin/setores.ts → SUPER_ONLY_PREFIXOS).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <GateSuperOnly>{children}</GateSuperOnly>
}
