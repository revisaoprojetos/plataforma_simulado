'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfiguracoesForm } from './configuracoes-form'
import { CarregamentoForm } from './carregamento-form'
import { ImersaoForm } from './imersao-form'
import { AvancadoForm } from './avancado-form'
import type { EstiloLoader } from '@/components/admin/loaders'

export function ConfiguracoesTabs({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const estiloInicial = ((tema?.loading_estilo as EstiloLoader) ?? 'skeleton') as EstiloLoader
  return (
    <Tabs defaultValue="sistema">
      <TabsList>
        <TabsTrigger value="sistema">Sistema</TabsTrigger>
        <TabsTrigger value="carregamento">Carregamento</TabsTrigger>
        <TabsTrigger value="imersao">Tela de carregamento</TabsTrigger>
        <TabsTrigger value="avancado">Avançado</TabsTrigger>
      </TabsList>

      <TabsContent value="sistema">
        <ConfiguracoesForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>
      <TabsContent value="carregamento">
        <CarregamentoForm estiloInicial={estiloInicial} salvarTema={salvarTema} />
      </TabsContent>
      <TabsContent value="imersao">
        <ImersaoForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>
      <TabsContent value="avancado">
        <AvancadoForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>
    </Tabs>
  )
}
