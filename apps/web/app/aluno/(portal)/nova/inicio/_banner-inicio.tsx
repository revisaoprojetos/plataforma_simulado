'use client'
// Banner da Início nova = EXATAMENTE o mesmo carrossel da Início padrão (components/.../home/revisao/home.tsx).
// Não é cópia: reusa os componentes Carrossel/CarrosselMobile e o CSS (.hrv-*) exportados de lá.
// O desktop mostra <Carrossel>, o celular <CarrosselMobile> (alternância feita pelo próprio CSS).
import { Carrossel, CarrosselMobile, CSS } from '@/components/brand/interna/home/revisao/home'
import type { HomeDestaque } from '@/components/brand/interna/home/types'

// Cor do slide "Bom estudo" (1º do carrossel, sem imagem) sensível ao TEMA — a pedido:
//   claro  → roxo MAIS CLARO (igual ao banner da Início padrão);
//   escuro → o MESMO gradiente escuro de antes (SLIDE_BG[0]).
// O slide lê `cores: var(--np-bom-bg)`; o valor é trocado por este CSS conforme o modo.
const BOM_CSS = `
.np-banner-bom{--np-bom-bg:linear-gradient(120deg,#4A31B8 0%,#5B3FD0 55%,#7857FF 100%)}
.novaplat[data-theme="escuro"] .np-banner-bom,.dark .np-banner-bom{--np-bom-bg:linear-gradient(120deg,#160F33 0%,#241A52 55%,#2E1F6A 100%)}
`

export function BannerInicio({ destaques }: { destaques: HomeDestaque[] }) {
  return (
    <div className="hrv-root np-bleed np-banner-bom" style={{ minHeight: 'auto' }}>
      <style>{CSS}</style>
      <style>{BOM_CSS}</style>
      <Carrossel destaques={destaques} />
      <CarrosselMobile destaques={destaques} />
    </div>
  )
}
