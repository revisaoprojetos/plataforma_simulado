'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Zap, Trophy, Award, Target, SlidersHorizontal, BarChart3 } from 'lucide-react'
import type { GamConfig } from '@/lib/gamificacao/config'
import type { MetricasGam } from '@/lib/gamificacao/metricas'
import { XpNiveisForm } from './forms/xp-niveis-form'
import { LigasForm } from './forms/ligas-form'
import { ConquistasForm } from './forms/conquistas-form'
import { MissoesForm } from './forms/missoes-form'
import { RegrasGeraisForm } from './forms/regras-gerais-form'
import { MetricasView } from './forms/metricas-view'

export function GamificacaoTabs({ config, podeGerenciar, metricas }: { config: GamConfig; podeGerenciar: boolean; metricas: MetricasGam }) {
  return (
    <Tabs defaultValue="xp">
      <TabsList className="flex-wrap">
        <TabsTrigger value="xp"><Zap /> XP & Níveis</TabsTrigger>
        <TabsTrigger value="ligas"><Trophy /> Ligas & Divisões</TabsTrigger>
        <TabsTrigger value="conquistas"><Award /> Conquistas</TabsTrigger>
        <TabsTrigger value="missoes"><Target /> Missões</TabsTrigger>
        <TabsTrigger value="regras"><SlidersHorizontal /> Regras gerais</TabsTrigger>
        <TabsTrigger value="metricas"><BarChart3 /> Métricas</TabsTrigger>
      </TabsList>

      <TabsContent value="xp" className="pt-2"><XpNiveisForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="ligas" className="pt-2"><LigasForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="conquistas" className="pt-2"><ConquistasForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="missoes" className="pt-2"><MissoesForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="regras" className="pt-2"><RegrasGeraisForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="metricas" className="pt-2"><MetricasView m={metricas} /></TabsContent>
    </Tabs>
  )
}
