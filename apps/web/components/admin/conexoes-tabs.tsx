'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WebhooksConfig } from '@/components/admin/webhooks-config'
import { N8nBuilder } from '@/components/admin/n8n-builder'
import { RecebidosInbox } from '@/components/admin/recebidos-inbox'
import { WebhookLogsSaida, type LogSaida } from '@/components/admin/webhook-logs-saida'

type Evt = { chave: string; label: string; descricao?: string; grupo?: string }
type Sim = { id: string; titulo: string }

export function ConexoesTabs({ webhooks, automacoes, eventos, simulados, precisaMigrar, appUrl, inboundToken, logsSaida, logsPrecisaMigrar, origensExistentes, modulos }: {
  webhooks: any[]; automacoes: any[]; eventos: Evt[]; simulados: Sim[]; precisaMigrar: boolean
  appUrl: string; inboundToken: string | null
  logsSaida: LogSaida[]; logsPrecisaMigrar: boolean; origensExistentes: string[]; modulos: Sim[]
}) {
  return (
    <Tabs defaultValue="webhook">
      <TabsList>
        <TabsTrigger value="webhook">Webhook (saída)</TabsTrigger>
        <TabsTrigger value="recebidos">Recebidos</TabsTrigger>
        <TabsTrigger value="n8n">
          n8n
          <span className="ml-1.5 text-[12px] font-medium tabular-nums text-muted-foreground">{automacoes.length}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="webhook">
        {/* Sub-abas do webhook de saída: entrega de eventos (com gatilhos de engajamento por webhook) e logs. */}
        <Tabs defaultValue="entrega">
          <TabsList variant="line">
            <TabsTrigger value="entrega">Entrega de eventos</TabsTrigger>
            <TabsTrigger value="logs">Logs de saída</TabsTrigger>
          </TabsList>

          <TabsContent value="entrega">
            <WebhooksConfig webhooks={webhooks} eventos={eventos} simulados={simulados} precisaMigrar={precisaMigrar} origensExistentes={origensExistentes} modulos={modulos} />
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
