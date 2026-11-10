import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { AuthStateService } from './auth-state.service';
import { AuthUser, JwtPayload } from './auth.types';
import { IS_PUBLIC, ROLES } from './decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly env: Env,
    private readonly state: AuthStateService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();

    let p: JwtPayload;
    try {
      p = await this.jwt.verifyAsync<JwtPayload>(header.slice(7), {
        secret: this.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException();
    }
    // Usuário desativado/removido ou empresa suspensa perde o acesso já (cache de AUTH_STATE_TTL_S s).
    const st = await this.state.get(p.sub);
    if (!st.ok) throw new UnauthorizedException();
    // O papel vigente vem do banco: rebaixar alguém vale antes do JWT expirar.
    req.user = { id: p.sub, tenantId: p.tid, role: st.role ?? p.role, email: p.email };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Permissão insuficiente');
    return true;
  }
}
