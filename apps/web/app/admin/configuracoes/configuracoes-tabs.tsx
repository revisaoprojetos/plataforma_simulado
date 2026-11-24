'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MenuLateralForm } from './menu-lateral-form'
import { AparenciaAuthForm } from './aparencia-auth-form'
import { ConfiguracoesForm } from './configuracoes-form'
import { CardViewForm } from './card-view-form'
import { CarregamentoForm } from './carregamento-form'
import { ImersaoForm } from './imersao-form'
import { AvancadoForm } from './avancado-form'
import { PaletaNovaForm } from './paleta-nova-form'
import { TemaSistemaForm } from './tema-sistema-form'
import { SelecaoForm } from './selecao-form'
import { AssistenteForm } from './assistente-form'
import { PersonalizacaoForm } from './personalizacao-form'
import { NavegacaoMobileForm } from './navegacao-mobile-form'
import type { EstiloLoader } from '@/components/admin/loaders'

export function ConfiguracoesTabs({ tema, salvarTema, capasSistema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void>; capasSistema?: string[] }) {
  const estiloInicial = ((tema?.loading_estilo as EstiloLoader) ?? 'skeleton') as EstiloLoader
  const animacaoInicial = (tema?.animacao_entrada as boolean | undefined) !== false
  return (
    <Tabs defaultValue="identidade">
      <TabsList>
        <TabsTrigger value="identidade">Identidade</TabsTrigger>
        <TabsTrigger value="selecao">Seleção</TabsTrigger>
        <TabsTrigger value="tema">Cores &amp; Tema</TabsTrigger>
        <TabsTrigger value="paleta">Paleta nova</TabsTrigger>
        <TabsTrigger value="carregamento">Carregamento</TabsTrigger>
        <TabsTrigger value="login-carregamento">Login e carregamento</TabsTrigger>
        <TabsTrigger value="menu">Menu lateral</TabsTrigger>
        <TabsTrigger value="mobile">Mobile</TabsTrigger>
        <TabsTrigger value="cards">Cards</TabsTrigger>
        <TabsTrigger value="assistente">Assistente</TabsTrigger>
        <TabsTrigger value="personalizacao">Personalização</TabsTrigger>
        <TabsTrigger value="avancado">Avançado</TabsTrigger>
      </TabsList>

      <TabsContent value="identidade">
        <ConfiguracoesForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="selecao">
        <SelecaoForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="tema">
        <TemaSistemaForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="paleta">
        <PaletaNovaForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      {/* Carregamento reúne, em sub-tabs, o loader de navegação + a tela cheia (splash). */}
      <TabsContent value="carregamento">
        <Tabs defaultValue="loader" className="mt-1">
          <TabsList variant="line">
            <TabsTrigger value="loader">Durante a navegação</TabsTrigger>
            <TabsTrigger value="splash">Tela cheia (splash)</TabsTrigger>
          </TabsList>
          <TabsContent value="loader" className="pt-4">
            <CarregamentoForm estiloInicial={estiloInicial} animacaoInicial={animacaoInicial} salvarTema={salvarTema} />
          </TabsContent>
          <TabsContent value="splash" className="pt-4">
            <ImersaoForm tema={tema} salvarTema={salvarTema} />
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* Ativador (fundação) dos estilos de login/carregamento por marca — spec 02 §4.
          Os componentes visuais PlatformLogin/PlatformLoader por slug vêm na próxima fase. */}
      <TabsContent value="login-carregamento">
        <AparenciaAuthForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="menu">
        <MenuLateralForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="mobile">
        <NavegacaoMobileForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="cards">
        <CardViewForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="assistente">
        <AssistenteForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="personalizacao">
        <PersonalizacaoForm tema={tema} salvarTema={salvarTema} capasSistema={capasSistema} />
      </TabsContent>

      <TabsContent value="avancado">
        <AvancadoForm tema={tema} salvarTema={salvarTema} />
      </TabsContent>
    </Tabs>
  )
}
