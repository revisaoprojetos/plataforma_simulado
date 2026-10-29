'use client'
// Coluna lateral da Início nova = EXATAMENTE os cards Meta diária + Sequência + Missões de hoje da
// Início padrão (components/.../home/revisao/home.tsx). Reuso real dos componentes, não cópia.
import { MetaDiaria, Sequencia, Missoes, CSS } from '@/components/brand/interna/home/revisao/home'
import type { HomeData } from '@/components/brand/interna/home/types'

export function RailInicio({ data }: { data: HomeData }) {
  const s = data.sequenciaMeta
  return (
    <div className="hrv-root" style={{ minHeight: 'auto' }}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {s.metaDiariaXp > 0 && <MetaDiaria xpHoje={s.xpHoje} meta={s.metaDiariaXp} />}
        <Sequencia data={data} />
        <Missoes data={data} />
      </div>
    </div>
  )
}
