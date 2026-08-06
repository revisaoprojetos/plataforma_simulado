import { CascataEntrada } from '@/components/cascata-entrada'

// Re-montado a cada navegação no console super-admin → entrada em cascata (riseIn) card a card,
// na ordem de leitura (linha por linha, esquerda→direita). Mesmo modelo do /admin e do portal.
export default function SuperTemplate({ children }: { children: React.ReactNode }) {
  return <CascataEntrada>{children}</CascataEntrada>
}
