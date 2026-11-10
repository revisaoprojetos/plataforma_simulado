import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodPipe } from '../common/zod.pipe';
import { SkipRateLimit } from '../security/rate-limit.guard';
import { RateLimitService } from '../security/rate-limit.service';
import { AuthUser } from './auth.types';
import { LoginDto, loginSchema, RefreshDto, refreshSchema } from './auth.dto';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimitService,
  ) {}

  /**
   * Freia força bruta: limite por IP (varredura de contas), por conta+IP (adivinhar uma senha) e um
   * teto global por conta (ataque distribuído). Acertar a senha limpa as tentativas daquela conta.
   * Se o Redis cair, o login falha fechado (503).
   */
  @Public()
  @SkipRateLimit()
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) dto: LoginDto, @Req() req: { ip?: string }) {
    const account = `${dto.tenant ?? '-'}|${dto.email}`;
    const ip = req.ip ?? 'desconhecido';
    await this.limiter.enforce('loginIp', ip);
    // por conta+IP (trava o atacante, não a vítima) e teto global da conta (força bruta distribuída)
    await this.limiter.enforce('loginAccountIp', `${account}|${ip}`);
    await this.limiter.enforce('loginAccount', account);
    const tokens = await this.auth.login(dto);
    await this.limiter.reset('loginAccountIp', `${account}|${ip}`);
    await this.limiter.reset('loginAccount', account);
    return tokens;
  }

  @Public()
  @SkipRateLimit()
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodPipe(refreshSchema)) dto: RefreshDto, @Req() req: { ip?: string }) {
    await this.limiter.enforce('refresh', req.ip ?? 'desconhecido');
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @SkipRateLimit()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
