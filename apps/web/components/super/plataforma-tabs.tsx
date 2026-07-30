'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings2, ShieldCheck, Palette } from 'lucide-react'
import { PlataformaGerenciar } from '@/components/super/plataforma-gerenciar'
import { PlataformaAcessos } from '@/components/super/plataforma-acessos'
import { PlataformaAparencia, type AparenciaInicial } from '@/components/super/plataforma-aparencia'
import type { AdminMembro, CargoOpcao } from '@/app/admin/administradores/actions'

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
export function PlataformaTabs({ geral, membros, cargos, aparencia, rbacErro }: {
  geral: GeralProps
  membros: AdminMembro[]
  cargos: CargoOpcao[]
  aparencia: AparenciaInicial
  rbacErro?: string | null
}) {
  return (
    <Tabs defaultValue="geral" className="space-y-4">
      <TabsList>
        <TabsTrigger value="geral"><Settings2 className="mr-1.5 h-4 w-4" /> Geral</TabsTrigger>
        <TabsTrigger value="aparencia"><Palette className="mr-1.5 h-4 w-4" /> Aparência</TabsTrigger>
        <TabsTrigger value="acessos"><ShieldCheck className="mr-1.5 h-4 w-4" /> Acessos (RBAC)</TabsTrigger>
      </TabsList>

      <TabsContent value="geral">
        <PlataformaGerenciar {...geral} />
      </TabsContent>

      <TabsContent value="aparencia">
        <PlataformaAparencia tenantId={geral.id} inicial={aparencia} />
      </TabsContent>

      <TabsContent value="acessos" className="space-y-4">
        {rbacErro && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{rbacErro}</div>}
        <PlataformaAcessos tenantId={geral.id} membros={membros} cargos={cargos} />
      </TabsContent>
    </Tabs>
  )
}
