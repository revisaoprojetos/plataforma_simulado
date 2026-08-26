'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings2, ShieldCheck, Palette, Megaphone, Code2, LogIn, HardDrive } from 'lucide-react'
import { PlataformaGerenciar } from '@/components/super/plataforma-gerenciar'
import { PlataformaAcessos } from '@/components/super/plataforma-acessos'
import { PlataformaEmbed } from '@/components/super/plataforma-embed'
import { PlataformaLoginConfig } from '@/components/super/plataforma-login-config'
import { PlataformaArmazenamento } from '@/components/super/plataforma-armazenamento'
import { ConfiguracoesTabs } from '@/app/admin/configuracoes/configuracoes-tabs'
import { BannersManager, type Banner, type DestinoBanner } from '@/components/admin/banners-manager'
import { resolverLoginConfig } from '@/lib/login-config'
import type { AdminMembro, CargoOpcao } from '@/app/admin/administradores/actions'
import type { EmbedConfigInput } from '@/app/admin/tenants/actions'
import type { UsoSnapshot } from '@/lib/storage/uso'

type GeralProps = {
  id: string; nome: string; slug: string; plano: string; ativo: boolean; somenteAdmin: boolean; somenteSuper: boolean; dominio: string | null
  usuarios: number; estudantes: number; simulados: number
}

/**
 * Abas da plataforma no console super:
 *  - Geral  → editar + visibilidade (3 estados) + excluir.
 *  - Acessos (RBAC) → equipe da plataforma (membros + cargos), gerida pelo super-admin
 *    direto do console (escopo por tenant-alvo via `tenantId`).
 */
export function PlataformaTabs({ geral, membros, cargos, temaCompleto, salvarTema, banners, destinosBanner, embedConfig, salvarEmbed, rbacErro, capasSistema, usoTenant }: {
  geral: GeralProps
  membros: AdminMembro[]
  cargos: CargoOpcao[]
  temaCompleto: any
  salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void>
  banners: Banner[]
  destinosBanner?: DestinoBanner[]
  embedConfig: EmbedConfigInput
  salvarEmbed: (dados: EmbedConfigInput) => Promise<{ ok: boolean; error?: string }>
  rbacErro?: string | null
  capasSistema?: string[]
  usoTenant?: UsoSnapshot | null
}) {
  return (
    <Tabs defaultValue="geral" className="space-y-4">
      <TabsList>
        <TabsTrigger value="geral"><Settings2 className="mr-1.5 h-4 w-4" /> Geral</TabsTrigger>
        <TabsTrigger value="aparencia"><Palette className="mr-1.5 h-4 w-4" /> Aparência</TabsTrigger>
        <TabsTrigger value="login"><LogIn className="mr-1.5 h-4 w-4" /> Login</TabsTrigger>
        <TabsTrigger value="avisos"><Megaphone className="mr-1.5 h-4 w-4" /> Avisos</TabsTrigger>
        <TabsTrigger value="embed"><Code2 className="mr-1.5 h-4 w-4" /> Embed</TabsTrigger>
        <TabsTrigger value="armazenamento"><HardDrive className="mr-1.5 h-4 w-4" /> Armazenamento</TabsTrigger>
        <TabsTrigger value="acessos"><ShieldCheck className="mr-1.5 h-4 w-4" /> Acessos (RBAC)</TabsTrigger>
      </TabsList>

      <TabsContent value="geral">
        <PlataformaGerenciar {...geral} />
      </TabsContent>

      <TabsContent value="aparencia">
        <ConfiguracoesTabs tema={temaCompleto} salvarTema={salvarTema} capasSistema={capasSistema} />
      </TabsContent>

      <TabsContent value="login">
        <PlataformaLoginConfig
          tenantId={geral.id}
          config={resolverLoginConfig((temaCompleto as any)?.login)}
          corPrimaria={(temaCompleto as any)?.cor_primaria ?? '#6d28d9'}
          corAccent={(temaCompleto as any)?.cor_accent ?? '#f5c542'}
          logo={(temaCompleto as any)?.logo_url ?? null}
          logoBg={(temaCompleto as any)?.logo_png_bg ?? '#ffffff'}
          logoEstilo={(temaCompleto as any)?.logo_estilo ?? 'arredondado'}
          logoFiltro={(temaCompleto as any)?.logo_filtro_sistema ?? (temaCompleto as any)?.logo_filtro ?? 'none'}
          subtitulo={(temaCompleto as any)?.subtitulo_site ?? ''}
          plataforma={geral.nome}
          dominio={geral.dominio}
          slug={geral.slug}
        />
      </TabsContent>

      <TabsContent value="avisos">
        <BannersManager banners={banners} tenantId={geral.id} destinos={destinosBanner} desempenhoAtivo={(temaCompleto as any)?.banners_desempenho === true} destaques={(temaCompleto as any)?.banner_destaques ?? {}} />
      </TabsContent>

      <TabsContent value="embed">
        <PlataformaEmbed config={embedConfig} salvar={salvarEmbed} />
      </TabsContent>

      <TabsContent value="armazenamento">
        {usoTenant ? <PlataformaArmazenamento uso={usoTenant} /> : (
          <div className="rounded-2xl border bg-muted/30 p-8 text-center text-sm text-muted-foreground">Uso de storage indisponível.</div>
        )}
      </TabsContent>

      <TabsContent value="acessos" className="space-y-4">
        {rbacErro && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{rbacErro}</div>}
        <PlataformaAcessos tenantId={geral.id} membros={membros} cargos={cargos} />
      </TabsContent>
    </Tabs>
  )
}
