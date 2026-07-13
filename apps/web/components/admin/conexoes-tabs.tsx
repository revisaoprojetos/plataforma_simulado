'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Webhook, Workflow } from 'lucide-react'
import { WebhooksConfig } from '@/components/admin/webhooks-config'
import { N8nBuilder } from '@/components/admin/n8n-builder'

type Evt = { chave: string; label: string }
type Sim = { id: string; titulo: string }

export function ConexoesTabs({ webhooks, automacoes, eventos, simulados, precisaMigrar }: {
  webhooks: any[]; automacoes: any[]; eventos: Evt[]; simulados: Sim[]; precisaMigrar: boolean
}) {
  return (
    <Tabs defaultValue="webhook" className="gap-5">
      <TabsList>
        <TabsTrigger value="webhook"><Webhook className="h-[18px] w-[18px]" /> Webhook</TabsTrigger>
        <TabsTrigger value="n8n">
          <Workflow className="h-[18px] w-[18px]" /> n8n
          <span className="ml-1 rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">{automacoes.length}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="webhook">
        <WebhooksConfig webhooks={webhooks} eventos={eventos} simulados={simulados} precisaMigrar={precisaMigrar} />
      </TabsContent>
      <TabsContent value="n8n">
        <N8nBuilder automacoes={automacoes} eventos={eventos} simulados={simulados} />
      </TabsContent>
    </Tabs>
  )
}
