import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, tap } from 'rxjs'
import { Request } from 'express'
import { SupabaseService } from '../../modules/supabase/supabase.service.js'

export const AUDIT_TABLE_KEY = 'audit_table'
export const AUDIT_SKIP_KEY = 'audit_skip'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const METHOD_TO_OPERATION: Record<string, string> = {
  POST: 'INSERT',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
}

type RequestWithContext = Request & {
  user?: { id?: string }
  tenantId?: string
  auditDadosAnteriores?: Record<string, unknown>
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithContext>()

    if (!MUTATION_METHODS.has(req.method)) return next.handle()

    const skip = this.reflector.getAllAndOverride<boolean>(AUDIT_SKIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (skip) return next.handle()

    const tabela =
      this.reflector.getAllAndOverride<string>(AUDIT_TABLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? req.path

    const operacao = METHOD_TO_OPERATION[req.method] ?? req.method
    const actorUserId = req.user?.id ?? null
    const tenantId = req.tenantId ?? null
    const ip = req.ip ?? req.socket?.remoteAddress ?? null
    const userAgent = (req.headers['user-agent'] as string) ?? null

    // Sanitize body to avoid logging sensitive fields
    const bodySanitized = req.body
      ? sanitizeBody(req.body as Record<string, unknown>)
      : null

    const dadosAnteriores = req.auditDadosAnteriores ?? null

    return next.handle().pipe(
      tap({
        next: async (responseBody: unknown) => {
          try {
            const dadosNovos =
              responseBody && typeof responseBody === 'object'
                ? sanitizeBody(responseBody as Record<string, unknown>)
                : bodySanitized

            await this.supabaseService.getClient().from('audit_logs').insert({
              tenant_id: tenantId,
              actor_user_id: actorUserId,
              tabela,
              operacao,
              dados_anteriores: dadosAnteriores,
              dados_novos: dadosNovos,
              ip,
              user_agent: userAgent,
            })
          } catch {
            // Audit failure must never block the response
          }
        },
        error: async () => {
          // Also log failed mutations (for security audit trail)
          try {
            await this.supabaseService.getClient().from('audit_logs').insert({
              tenant_id: tenantId,
              actor_user_id: actorUserId,
              tabela,
              operacao: `${operacao}_FAILED`,
              dados_anteriores: null,
              dados_novos: bodySanitized,
              ip,
              user_agent: userAgent,
            })
          } catch { /* silent */ }
        },
      }),
    )
  }
}

const SENSITIVE_KEYS = new Set([
  'senha', 'password', 'senha_hash', 'token', 'secret', 'cpf', 'telefone',
  'access_token', 'refresh_token', 'mfa_secret', 'segredo_hmac', 'key_hash',
])

function sanitizeBody(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeBody(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}
