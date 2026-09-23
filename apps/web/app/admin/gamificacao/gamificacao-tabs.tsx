'use client'

import { useState } from 'react'
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

// 'engajamento' MOVIDO para Conexões → Webhooks (sub-aba Engajamento). Redireciona deep-links antigos.
const TABS_VALIDAS = ['xp', 'ligas', 'conquistas', 'missoes', 'regras', 'metricas']

export function GamificacaoTabs({ config, podeGerenciar, metricas, tabInicial }: { config: GamConfig; podeGerenciar: boolean; metricas: MetricasGam; tabInicial?: string }) {
  const [tab, setTab] = useState(tabInicial && TABS_VALIDAS.includes(tabInicial) ? tabInicial : 'xp')
  // Reflete a aba na URL (?tab=) SEM criar entrada no histórico → o "voltar" do navegador (após abrir o
  // Gerenciador) retorna à aba onde o usuário estava, não à primeira.
  function mudarTab(v: string) {
    setTab(v)
    try { const u = new URL(window.location.href); u.searchParams.set('tab', v); window.history.replaceState(null, '', u.toString()) } catch { /* noop */ }
  }
  return (
    <Tabs value={tab} onValueChange={mudarTab}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="xp"><Zap /> XP & Níveis</TabsTrigger>
        <TabsTrigger value="ligas"><Trophy /> Ligas & Divisões</TabsTrigger>
        <TabsTrigger value="conquistas"><Award /> Conquistas</TabsTrigger>
        <TabsTrigger value="missoes"><Target /> Missões</TabsTrigger>
        <TabsTrigger value="regras"><SlidersHorizontal /> Regras gerais</TabsTrigger>
        <TabsTrigger value="metricas"><BarChart3 /> Métricas</TabsTrigger>
      </TabsList>

      <TabsContent value="xp" keepMounted className="pt-1 pb-1"><XpNiveisForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="ligas" keepMounted className="pt-1 pb-1"><LigasForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="conquistas" keepMounted className="pt-1 pb-1"><ConquistasForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="missoes" keepMounted className="pt-1 pb-1"><MissoesForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="regras" keepMounted className="pt-1 pb-1"><RegrasGeraisForm config={config} podeGerenciar={podeGerenciar} /></TabsContent>
      <TabsContent value="metricas" keepMounted className="pt-1 pb-1"><MetricasView m={metricas} /></TabsContent>
    </Tabs>
  )
}
