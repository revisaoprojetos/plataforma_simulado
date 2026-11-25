'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ManutencaoSistemaForm } from '@/components/admin/manutencao-sistema-form'
import { ManutencaoPaginasForm } from '@/components/admin/manutencao-paginas-form'
import { ChecklistSistema } from '@/components/admin/checklist-sistema'
import { CacheSistema } from '@/components/admin/cache-sistema'
import { WorkspaceForm } from '@/components/admin/workspace-form'
import { AREAS_MANUTENCAO, AREAS_MANUTENCAO_ALUNO } from '@/lib/sistema/manutencao-areas'
import type { ManutencaoSistema } from '@/lib/sistema/manutencao'
import type { ManutencaoAreas, ManutencaoLiberados, ManutencaoModos } from '@/lib/sistema/manutencao-areas'
import type { PessoaItem } from '@/components/admin/seletor-liberados-dialog'
import type { WorkspaceGrupo } from './actions-tipos'

// `modos` só existe p/ as áreas do ALUNO (modo bloqueio/construção); o admin não tem modo.
type BlocoManutencao = { ativos: ManutencaoAreas; liberados: ManutencaoLiberados; nomes: PessoaItem[]; modos?: ManutencaoModos }
type WorkspaceBloco = { emails: string[]; grupos: string[]; gruposDisponiveis: WorkspaceGrupo[]; podeEditar: boolean }

export function SistemaTabs({ manutencao, admin, aluno, workspace, superAdmin = false }: {
  superAdmin?: boolean
  manutencao: ManutencaoSistema
  admin: BlocoManutencao
  aluno: BlocoManutencao
  workspace: WorkspaceBloco
}) {
  return (
    <Tabs defaultValue="manutencao">
      <TabsList>
        <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
        <TabsTrigger value="areas">Páginas em manutenção</TabsTrigger>
        <TabsTrigger value="workspace">Workspace</TabsTrigger>
        <TabsTrigger value="cache">Cache e banco</TabsTrigger>
        <TabsTrigger value="checklist">Checklist do sistema</TabsTrigger>
      </TabsList>
      <TabsContent value="manutencao"><ManutencaoSistemaForm inicial={manutencao} /></TabsContent>
      <TabsContent value="areas">
        {/* Sub-abas: Admin (painel) | Aluno (portal) */}
        <Tabs defaultValue="admin">
          <TabsList>
            <TabsTrigger value="admin">Admin</TabsTrigger>
            <TabsTrigger value="aluno">Aluno</TabsTrigger>
          </TabsList>
          <TabsContent value="admin">
            <ManutencaoPaginasForm tipo="admin" areas={AREAS_MANUTENCAO} ativosIniciais={admin.ativos} liberadosIniciais={admin.liberados} nomesIniciais={admin.nomes} />
          </TabsContent>
          <TabsContent value="aluno">
            <ManutencaoPaginasForm tipo="aluno" areas={AREAS_MANUTENCAO_ALUNO} ativosIniciais={aluno.ativos} liberadosIniciais={aluno.liberados} nomesIniciais={aluno.nomes} modosIniciais={aluno.modos} />
          </TabsContent>
        </Tabs>
      </TabsContent>
      <TabsContent value="workspace">
        <WorkspaceForm
          emailsIniciais={workspace.emails}
          gruposIniciais={workspace.grupos}
          gruposDisponiveis={workspace.gruposDisponiveis}
          podeEditar={workspace.podeEditar}
        />
      </TabsContent>
      <TabsContent value="cache"><CacheSistema superAdmin={superAdmin} /></TabsContent>
      <TabsContent value="checklist"><ChecklistSistema /></TabsContent>
    </Tabs>
  )
}
