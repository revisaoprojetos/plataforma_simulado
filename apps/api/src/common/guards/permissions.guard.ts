import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSION_KEY } from '../decorators/require-permission.decorator.js'

interface RequestUser {
  id?: string
  roles?: string[]
  permissions?: string[]
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!required) return true

    const req = context.switchToHttp().getRequest<{ user?: RequestUser }>()
    const user = req.user
    if (!user) throw new ForbiddenException('Não autenticado')

    const roles = user.roles ?? []

    // super_admin bypasses all checks
    if (roles.includes('super_admin') || roles.includes('admin_geral')) return true

    // Check permissions from JWT (populated at login by RbacService)
    const permissions = user.permissions ?? []
    if (permissions.includes(required)) return true

    // Fallback: admin_geral in roles with no permissions list → allow (legacy)
    if (!permissions.length && roles.includes('admin_geral')) return true

    throw new ForbiddenException(`Permissão requerida: ${required}`)
  }
}
