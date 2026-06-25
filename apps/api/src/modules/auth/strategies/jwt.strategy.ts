import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'

export interface JwtPayload {
  sub: string
  email: string
  tenantId?: string
  roles?: string[]
  permissions?: string[]
  type: 'access' | 'embed'
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    })
  }

  validate(payload: JwtPayload) {
    if (!payload.sub) throw new UnauthorizedException('Token inválido')
    return {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
      type: payload.type,
    }
  }
}
