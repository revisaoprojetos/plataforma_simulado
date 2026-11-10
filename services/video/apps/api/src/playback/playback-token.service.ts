import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { ttlToSeconds } from '../auth/ttl';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';

export interface PlaybackClaims {
  typ: 'pb';
  /** usuário */
  sub: string;
  /** empresa */
  tid: string;
  /** vídeo */
  vid: string;
  /** aula */
  lid: string;
  /** sessão de reprodução (limite de streams simultâneos) */
  sid: string;
  /** host do site que pediu o playback (null quando a empresa não restringe domínios) */
  dom: string | null;
}

/**
 * Token de playback: curto, amarrado a usuário + vídeo + sessão (+ domínio).
 * Assinado com um segredo DERIVADO do segredo de acesso, para que nunca seja aceito como
 * access token de usuário (e vice-versa).
 */
@Injectable()
export class PlaybackTokenService {
  private readonly secret: string;
  readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    @Inject(CONFIG) env: Env,
  ) {
    this.secret = createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update('playback-token-v1')
      .digest('hex');
    this.ttlSeconds = ttlToSeconds(env.PLAYBACK_TOKEN_TTL);
  }

  async sign(
    claims: Omit<PlaybackClaims, 'typ'>,
    ttlSeconds = this.ttlSeconds,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = await this.jwt.signAsync(
      { typ: 'pb', ...claims },
      { secret: this.secret, expiresIn: ttlSeconds },
    );
    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  /**
   * Tokens verificados ficam em memória até expirar: o player reenvia o MESMO token a cada
   * heartbeat/segmento durante ~4 min, e a assinatura de um token imutável não muda. Só entram
   * tokens válidos; a expiração é rechecada a cada uso e o tamanho é limitado.
   */
  private readonly verified = new Map<string, { claims: PlaybackClaims; expMs: number }>();
  private static readonly CACHE_MAX = 20_000;

  async verify(token: string | undefined): Promise<PlaybackClaims> {
    if (!token) throw new UnauthorizedException('Token de playback ausente');

    const hit = this.verified.get(token);
    if (hit) {
      if (hit.expMs > Date.now()) return hit.claims;
      this.verified.delete(token);
    }
    try {
      const claims = await this.jwt.verifyAsync<PlaybackClaims & { exp: number }>(token, {
        secret: this.secret,
      });
      if (claims.typ !== 'pb') throw new Error('tipo inválido');
      if (this.verified.size >= PlaybackTokenService.CACHE_MAX) {
        this.verified.delete(this.verified.keys().next().value as string);
      }
      this.verified.set(token, { claims, expMs: claims.exp * 1000 });
      return claims;
    } catch {
      throw new UnauthorizedException('Token de playback inválido ou expirado');
    }
  }
}
