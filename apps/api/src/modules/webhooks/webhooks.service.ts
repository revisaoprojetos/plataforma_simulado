import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { createHmac } from 'crypto'
import { SupabaseService } from '../supabase/supabase.service.js'
import { CreateWebhookDto } from './dto/create-webhook.dto.js'

@Injectable()
export class WebhooksService {
  constructor(private readonly supabase: SupabaseService) {}

  async criar(tenantId: string, dto: CreateWebhookDto) {
    const { data, error } = await this.supabase.getClient()
      .from('webhook_endpoints')
      .insert({
        tenant_id: tenantId,
        url: dto.url,
        evento: dto.evento,
        segredo_hmac: dto.segredo_hmac,
        ativo: true,
      })
      .select('id, url, evento, ativo, created_at')
      .single()

    if (error) throw new BadRequestException(error.message)
    return data
  }

  async listar(tenantId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('webhook_endpoints')
      .select('id, url, evento, ativo, ultimo_disparo, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) throw new BadRequestException(error.message)
    return data ?? []
  }

  async desativar(id: string, tenantId: string) {
    const { data: existing } = await this.supabase.getClient()
      .from('webhook_endpoints')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (!existing) throw new NotFoundException('Webhook não encontrado')

    const { error } = await this.supabase.getClient()
      .from('webhook_endpoints')
      .update({ ativo: false })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) throw new BadRequestException(error.message)
    return { desativado: true }
  }

  async dispararWebhook(tenantId: string, evento: string, payload: unknown) {
    const { data: endpoints } = await this.supabase.getClient()
      .from('webhook_endpoints')
      .select('id, url, segredo_hmac')
      .eq('tenant_id', tenantId)
      .eq('evento', evento)
      .eq('ativo', true)

    if (!endpoints?.length) return { disparos: 0 }

    const now = new Date().toISOString()
    const body = JSON.stringify(payload)

    const resultados = await Promise.allSettled(
      endpoints.map(async (endpoint) => {
        const signature = createHmac('sha256', endpoint.segredo_hmac)
          .update(body)
          .digest('hex')

        await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': evento,
          },
          body,
        })

        await this.supabase.getClient()
          .from('webhook_endpoints')
          .update({ ultimo_disparo: now })
          .eq('id', endpoint.id)
      }),
    )

    const sucessos = resultados.filter(r => r.status === 'fulfilled').length
    const falhas = resultados.filter(r => r.status === 'rejected').length

    return { disparos: endpoints.length, sucessos, falhas }
  }

  async testar(id: string, tenantId: string) {
    const { data: endpoint } = await this.supabase.getClient()
      .from('webhook_endpoints')
      .select('id, url, evento, segredo_hmac')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (!endpoint) throw new NotFoundException('Webhook não encontrado')

    const payload = {
      evento: endpoint.evento,
      teste: true,
      timestamp: new Date().toISOString(),
    }

    return this.dispararWebhook(tenantId, endpoint.evento, payload)
  }
}
