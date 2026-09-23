'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Webhook, Workflow, Inbox, Send, ListChecks } from 'lucide-react'
import { WebhooksConfig } from '@/components/admin/webhooks-config'
import { N8nBuilder } from '@/components/admin/n8n-builder'
import { RecebidosInbox } from '@/components/admin/recebidos-inbox'
import { WebhookLogsSaida, type LogSaida } from '@/components/admin/webhook-logs-saida'

type Evt = { chave: string; label: string; descricao?: string; grupo?: string }
type Sim = { id: string; titulo: string }

export function ConexoesTabs({ webhooks, automacoes, eventos, simulados, precisaMigrar, appUrl, inboundToken, logsSaida, logsPrecisaMigrar }: {
  webhooks: any[]; automacoes: any[]; eventos: Evt[]; simulados: Sim[]; precisaMigrar: boolean
  appUrl: string; inboundToken: string | null
  logsSaida: LogSaida[]; logsPrecisaMigrar: boolean
}) {
  return (
    <Tabs defaultValue="webhook" className="gap-5">
      <TabsList>
        <TabsTrigger value="webhook"><Webhook className="h-[18px] w-[18px]" /> Webhook (saída)</TabsTrigger>
        <TabsTrigger value="recebidos"><Inbox className="h-[18px] w-[18px]" /> Recebidos</TabsTrigger>
        <TabsTrigger value="n8n">
          <Workflow className="h-[18px] w-[18px]" /> n8n
          <span className="ml-1 rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">{automacoes.length}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="webhook">
        {/* Sub-abas do webhook de saída: entrega de eventos (com gatilhos de engajamento por webhook) e logs. */}
        <Tabs defaultValue="entrega" className="gap-4">
          <TabsList variant="line">
            <TabsTrigger value="entrega"><Send className="h-4 w-4" /> Entrega de eventos</TabsTrigger>
            <TabsTrigger value="logs"><ListChecks className="h-4 w-4" /> Logs de saída</TabsTrigger>
          </TabsList>

          <TabsContent value="entrega">
            <WebhooksConfig webhooks={webhooks} eventos={eventos} simulados={simulados} precisaMigrar={precisaMigrar} />
          </TabsContent>

          <TabsContent value="logs">
            <WebhookLogsSaida logs={logsSaida} eventos={eventos} precisaMigrar={logsPrecisaMigrar} />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="recebidos">
        <RecebidosInbox appUrl={appUrl} token={inboundToken} />
      </TabsContent>
      <TabsContent value="n8n">
        <N8nBuilder automacoes={automacoes} eventos={eventos} simulados={simulados} />
      </TabsContent>
    </Tabs>
  )
}
