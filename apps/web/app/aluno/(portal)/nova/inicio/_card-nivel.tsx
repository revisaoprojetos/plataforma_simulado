'use client'
// Faixa "Olá + nível" da Início nova = EXATAMENTE Saudacao + NivelCard da Início padrão
// (components/.../home/revisao/home.tsx), num ÚNICO card comprido, lado a lado (mesma linha):
// "Olá…" à esquerda e o nível (ring + barra) à direita. `bare` = só o bloco do nível (sem o card
// próprio dele nem os ministats). Não é cópia: reuso real dos componentes.
import { Saudacao, NivelCard, CSS } from '@/components/brand/interna/home/revisao/home'
import type { HomeData } from '@/components/brand/interna/home/types'

export function CardNivelInicio({ data }: { data: HomeData }) {
  const u = data.usuario
  const faltamXp = Math.max(0, u.xpNivelMax - u.xpNivelAtual)
  return (
    <div className="hrv-root" style={{ minHeight: 'auto' }}>
      <style>{CSS}</style>
      <div
        className="hrv-card hrv-up"
        style={{ display: 'flex', alignItems: 'center', gap: 'clamp(20px, 4vw, 48px)', flexWrap: 'wrap' }}
      >
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <Saudacao nome={u.nome} xp={faltamXp} />
        </div>
        <div style={{ flex: '1 1 460px', minWidth: 300 }}>
          <NivelCard data={data} bare />
        </div>
      </div>
    </div>
  )
}
