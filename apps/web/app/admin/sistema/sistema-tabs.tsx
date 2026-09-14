'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wrench, ListChecks, LayoutList, ShieldCheck, GraduationCap } from 'lucide-react'
import { ManutencaoSistemaForm } from '@/components/admin/manutencao-sistema-form'
import { ManutencaoPaginasForm } from '@/components/admin/manutencao-paginas-form'
import { ChecklistSistema } from '@/components/admin/checklist-sistema'
import { AREAS_MANUTENCAO, AREAS_MANUTENCAO_ALUNO } from '@/lib/sistema/manutencao-areas'
import type { ManutencaoSistema } from '@/lib/sistema/manutencao'
import type { ManutencaoAreas, ManutencaoLiberados } from '@/lib/sistema/manutencao-areas'
import type { PessoaItem } from '@/components/admin/seletor-liberados-dialog'

type BlocoManutencao = { ativos: ManutencaoAreas; liberados: ManutencaoLiberados; nomes: PessoaItem[] }

export function SistemaTabs({ manutencao, admin, aluno }: {
  manutencao: ManutencaoSistema
  admin: BlocoManutencao
  aluno: BlocoManutencao
}) {
  return (
    <Tabs defaultValue="manutencao">
      <TabsList className="flex-wrap">
        <TabsTrigger value="manutencao"><Wrench /> Manutenção</TabsTrigger>
        <TabsTrigger value="areas"><LayoutList /> Páginas em manutenção</TabsTrigger>
        <TabsTrigger value="checklist"><ListChecks /> Checklist do sistema</TabsTrigger>
      </TabsList>
      <TabsContent value="manutencao"><ManutencaoSistemaForm inicial={manutencao} /></TabsContent>
      <TabsContent value="areas">
        {/* Sub-abas: Admin (painel) | Aluno (portal) */}
        <Tabs defaultValue="admin">
          <TabsList className="mb-4">
            <TabsTrigger value="admin"><ShieldCheck /> Admin</TabsTrigger>
            <TabsTrigger value="aluno"><GraduationCap /> Aluno</TabsTrigger>
          </TabsList>
          <TabsContent value="admin">
            <ManutencaoPaginasForm tipo="admin" areas={AREAS_MANUTENCAO} ativosIniciais={admin.ativos} liberadosIniciais={admin.liberados} nomesIniciais={admin.nomes} />
          </TabsContent>
          <TabsContent value="aluno">
            <ManutencaoPaginasForm tipo="aluno" areas={AREAS_MANUTENCAO_ALUNO} ativosIniciais={aluno.ativos} liberadosIniciais={aluno.liberados} nomesIniciais={aluno.nomes} />
          </TabsContent>
        </Tabs>
      </TabsContent>
      <TabsContent value="checklist"><ChecklistSistema /></TabsContent>
    </Tabs>
  )
}
