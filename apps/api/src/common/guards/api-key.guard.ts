import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import { createHash } from 'crypto'
import { SupabaseService } from '../../modules/supabase/supabase.service.js'

export interface ApiKeyRequest {
  headers: Record<string, string | string[] | undefined>
  tenantId?: string
  apiKey?: { id: string; escopos: string[] }
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiKeyRequest>()

    const authHeader = req.headers['authorization']
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('API key não fornecida')
    }

    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      throw new UnauthorizedException('Formato inválido. Use: Authorization: Bearer <api_key>')
    }

    const rawKey = parts[1]
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const now = new Date().toISOString()

    let query = this.supabase.getClient()
      .from('api_keys')
      .select('id, escopos, expira_em, tenant_id')
      .eq('key_hash', keyHash)
      .eq('revogada', false)

    if (req.tenantId) {
      query = query.eq('tenant_id', req.tenantId)
    }

    const { data: key, error } = await query.single()

    if (error || !key) {
      throw new UnauthorizedException('API key inválida ou revogada')
    }

    if (key.expira_em && key.expira_em < now) {
      throw new UnauthorizedException('API key expirada')
    }

    // Update ultimo_uso async — don't block the request
    this.supabase.getClient()
      .from('api_keys')
      .update({ ultimo_uso: now })
      .eq('id', key.id)
      .then(() => {})

    req.apiKey = { id: key.id, escopos: key.escopos ?? [] }
    if (!req.tenantId && key.tenant_id) {
      req.tenantId = key.tenant_id
    }

    return true
  }
}
