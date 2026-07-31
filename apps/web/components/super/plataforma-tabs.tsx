'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings2, ShieldCheck, Palette, Megaphone, Code2 } from 'lucide-react'
import { PlataformaGerenciar } from '@/components/super/plataforma-gerenciar'
import { PlataformaAcessos } from '@/components/super/plataforma-acessos'
import { PlataformaEmbed } from '@/components/super/plataforma-embed'
import { ConfiguracoesTabs } from '@/app/admin/configuracoes/configuracoes-tabs'
import { BannersManager, type Banner, type DestinoBanner } from '@/components/admin/banners-manager'
import type { AdminMembro, CargoOpcao } from '@/app/admin/administradores/actions'
import type { EmbedConfigInput } from '@/app/admin/tenants/actions'

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
export function PlataformaTabs({ geral, membros, cargos, temaCompleto, salvarTema, banners, destinosBanner, embedConfig, salvarEmbed, rbacErro }: {
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
}) {
  return (
    <Tabs defaultValue="geral" className="space-y-4">
      <TabsList>
        <TabsTrigger value="geral"><Settings2 className="mr-1.5 h-4 w-4" /> Geral</TabsTrigger>
        <TabsTrigger value="aparencia"><Palette className="mr-1.5 h-4 w-4" /> Aparência</TabsTrigger>
        <TabsTrigger value="avisos"><Megaphone className="mr-1.5 h-4 w-4" /> Avisos</TabsTrigger>
        <TabsTrigger value="embed"><Code2 className="mr-1.5 h-4 w-4" /> Embed</TabsTrigger>
        <TabsTrigger value="acessos"><ShieldCheck className="mr-1.5 h-4 w-4" /> Acessos (RBAC)</TabsTrigger>
      </TabsList>

      <TabsContent value="geral">
        <PlataformaGerenciar {...geral} />
      </TabsContent>

      <TabsContent value="aparencia">
        <ConfiguracoesTabs tema={temaCompleto} salvarTema={salvarTema} />
      </TabsContent>

      <TabsContent value="avisos">
        <BannersManager banners={banners} tenantId={geral.id} destinos={destinosBanner} />
      </TabsContent>

      <TabsContent value="embed">
        <PlataformaEmbed config={embedConfig} salvar={salvarEmbed} />
      </TabsContent>

      <TabsContent value="acessos" className="space-y-4">
        {rbacErro && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{rbacErro}</div>}
        <PlataformaAcessos tenantId={geral.id} membros={membros} cargos={cargos} />
      </TabsContent>
    </Tabs>
  )
}
