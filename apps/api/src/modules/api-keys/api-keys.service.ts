import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import { SupabaseService } from '../supabase/supabase.service.js'
import { CreateApiKeyDto } from './dto/create-api-key.dto.js'

@Injectable()
export class ApiKeysService {
  constructor(private readonly supabase: SupabaseService) {}

  async criar(tenantId: string, criadoPor: string, dto: CreateApiKeyDto) {
    const rawKey = randomBytes(32).toString('hex')
    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.slice(0, 8)

    const { data, error } = await this.supabase.getClient()
      .from('api_keys')
      .insert({
        tenant_id: tenantId,
        nome: dto.nome,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        escopos: dto.escopos,
        expira_em: dto.expira_em ?? null,
        criado_por: criadoPor,
      })
      .select('id, nome, key_prefix, escopos, expira_em, created_at')
      .single()

    if (error) throw new BadRequestException(error.message)

    return { ...data, key_completa: rawKey }
  }

  async listar(tenantId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('api_keys')
      .select('id, nome, key_prefix, escopos, ultimo_uso, expira_em, revogada, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) throw new BadRequestException(error.message)
    return data ?? []
  }

  async revogar(id: string, tenantId: string) {
    const { data: existing } = await this.supabase.getClient()
      .from('api_keys')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (!existing) throw new NotFoundException('API key não encontrada')

    const { error } = await this.supabase.getClient()
      .from('api_keys')
      .update({ revogada: true })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) throw new BadRequestException(error.message)
    return { revogada: true }
  }
}
