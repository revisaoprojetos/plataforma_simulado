'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Fingerprint, Palette, LoaderCircle, Settings2, PanelTop, MonitorPlay } from 'lucide-react'
import { ConfiguracoesForm } from './configuracoes-form'
import { CarregamentoForm } from './carregamento-form'
import { ImersaoForm } from './imersao-form'
import { AvancadoForm } from './avancado-form'
import { TemaSistemaForm } from './tema-sistema-form'
import type { EstiloLoader } from '@/components/admin/loaders'

export function ConfiguracoesTabs({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const estiloInicial = ((tema?.loading_estilo as EstiloLoader) ?? 'skeleton') as EstiloLoader
  return (
    <Tabs defaultValue="identidade">
      <TabsList className="flex-wrap">
        <TabsTrigger value="identidade"><Fingerprint /> Identidade</TabsTrigger>
        <TabsTrigger value="tema"><Palette /> Cores &amp; Tema</TabsTrigger>
        <TabsTrigger value="carregamento"><LoaderCircle /> Carregamento</TabsTrigger>
        <TabsTrigger value="avancado"><Settings2 /> Avançado</TabsTrigger>
      </TabsList>

      <TabsContent value="identidade">
        <ConfiguracoesForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="tema">
        <TemaSistemaForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      {/* Carregamento reúne, em sub-tabs, o loader de navegação + a tela cheia (splash). */}
      <TabsContent value="carregamento">
        <Tabs defaultValue="loader" className="mt-1 rounded-xl border bg-muted/20 p-4">
          <TabsList variant="line" className="gap-4">
            <TabsTrigger value="loader"><PanelTop /> Durante a navegação</TabsTrigger>
            <TabsTrigger value="splash"><MonitorPlay /> Tela cheia (splash)</TabsTrigger>
          </TabsList>
          <TabsContent value="loader" className="pt-4">
            <CarregamentoForm estiloInicial={estiloInicial} salvarTema={salvarTema} />
          </TabsContent>
          <TabsContent value="splash" className="pt-4">
            <ImersaoForm tema={tema} salvarTema={salvarTema} />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="avancado">
        <AvancadoForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>
    </Tabs>
  )
}
