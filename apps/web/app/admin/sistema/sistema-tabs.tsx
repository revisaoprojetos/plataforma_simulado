'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wrench, ListChecks } from 'lucide-react'
import { ManutencaoSistemaForm } from '@/components/admin/manutencao-sistema-form'
import { ChecklistSistema } from '@/components/admin/checklist-sistema'
import type { ManutencaoSistema } from '@/lib/sistema/manutencao'

export function SistemaTabs({ manutencao }: { manutencao: ManutencaoSistema }) {
  return (
    <Tabs defaultValue="manutencao">
      <TabsList className="flex-wrap">
        <TabsTrigger value="manutencao"><Wrench /> Manutenção</TabsTrigger>
        <TabsTrigger value="checklist"><ListChecks /> Checklist do sistema</TabsTrigger>
      </TabsList>
      <TabsContent value="manutencao"><ManutencaoSistemaForm inicial={manutencao} /></TabsContent>
      <TabsContent value="checklist"><ChecklistSistema /></TabsContent>
    </Tabs>
  )
}
