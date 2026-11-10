import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlaybackTokenService } from './playback-token.service';

const env = { JWT_ACCESS_SECRET: 'a'.repeat(40), PLAYBACK_TOKEN_TTL: '5m' } as never;
const claims = { sub: 'u1', tid: 't1', vid: 'v1', lid: 'l1', sid: 's1', dom: null };

const make = () => new PlaybackTokenService(new JwtService({}), env);

describe('PlaybackTokenService (com cache de verificação)', () => {
  it('assina e verifica, devolvendo as claims', async () => {
    const svc = make();
    const { token } = await svc.sign(claims);
    await expect(svc.verify(token)).resolves.toMatchObject({ ...claims, typ: 'pb' });
  });

  it('o cache nunca serve um token depois de vencido', async () => {
    const svc = make();
    const { token } = await svc.sign(claims, 1);
    await svc.verify(token); // entra no cache
    await svc.verify(token); // servido do cache
    await new Promise((r) => setTimeout(r, 1300));
    await expect(svc.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token adulterado não é aceito, mesmo com o original em cache', async () => {
    const svc = make();
    const { token } = await svc.sign(claims);
    await svc.verify(token);
    const [h, p, s] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, sub: 'outro', typ: 'pb' })).toString('base64url')}.${s}`;
    await expect(svc.verify(forged)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(p).toBeTruthy();
  });

  it('lixo e ausência de token são recusados sempre (falhas não entram no cache)', async () => {
    const svc = make();
    for (let i = 0; i < 3; i++) {
      await expect(svc.verify('lixo.lixo.lixo')).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(svc.verify(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token de outro serviço (assinado com outro segredo) não vale', async () => {
    const other = new PlaybackTokenService(new JwtService({}), {
      JWT_ACCESS_SECRET: 'b'.repeat(40),
      PLAYBACK_TOKEN_TTL: '5m',
    } as never);
    const { token } = await other.sign(claims);
    await expect(make().verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
