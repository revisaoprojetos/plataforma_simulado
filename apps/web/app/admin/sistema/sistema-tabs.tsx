'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wrench, ListChecks, LayoutList } from 'lucide-react'
import { ManutencaoSistemaForm } from '@/components/admin/manutencao-sistema-form'
import { ManutencaoAreasForm } from '@/components/admin/manutencao-areas-form'
import { ChecklistSistema } from '@/components/admin/checklist-sistema'
import type { ManutencaoSistema } from '@/lib/sistema/manutencao'
import type { ManutencaoAreas } from '@/lib/sistema/manutencao-areas'

export function SistemaTabs({ manutencao, areas }: { manutencao: ManutencaoSistema; areas: ManutencaoAreas }) {
  return (
    <Tabs defaultValue="manutencao">
      <TabsList className="flex-wrap">
        <TabsTrigger value="manutencao"><Wrench /> Manutenção</TabsTrigger>
        <TabsTrigger value="areas"><LayoutList /> Páginas em manutenção</TabsTrigger>
        <TabsTrigger value="checklist"><ListChecks /> Checklist do sistema</TabsTrigger>
      </TabsList>
      <TabsContent value="manutencao"><ManutencaoSistemaForm inicial={manutencao} /></TabsContent>
      <TabsContent value="areas"><ManutencaoAreasForm inicial={areas} /></TabsContent>
      <TabsContent value="checklist"><ChecklistSistema /></TabsContent>
    </Tabs>
  )
}
