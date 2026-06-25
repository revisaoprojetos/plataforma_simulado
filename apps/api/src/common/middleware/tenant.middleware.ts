import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'

export interface RequestWithTenant extends Request {
  tenantId: string
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: RequestWithTenant, _res: Response, next: NextFunction) {
    // Resolve tenant by X-Tenant-Id header.
    // Subdomain resolution will be added in a later phase when DNS is configured.
    const tenantId = req.headers['x-tenant-id'] as string | undefined

    if (!tenantId) {
      throw new BadRequestException('Header X-Tenant-Id é obrigatório')
    }

    req.tenantId = tenantId
    next()
  }
}
