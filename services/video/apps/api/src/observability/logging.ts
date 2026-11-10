import { randomUUID } from 'node:crypto';
import { Params } from 'nestjs-pino';
import { redactUrl } from '../common/correlation';
import { Env } from '../config/env';

type Loose = Record<string, unknown>;

/**
 * Serializador de requisição para os logs: só campos permitidos (nunca cabeçalhos, corpo nem
 * cookies, que carregam Authorization e tokens) e com a URL sem o token de playback.
 */
export function serializeReq(req: Loose) {
  return {
    id: req.id,
    method: req.method,
    url: redactUrl(String(req.originalUrl ?? req.url ?? '')),
    ip: req.remoteAddress ?? (req.socket as Loose | undefined)?.remoteAddress,
  };
}

/**
 * Nível de log de cada resposta. Heartbeat bem-sucedido é o tráfego mais volumoso (um por aluno a
 * cada ~10 s) e não tem valor em `info`; falhas continuam aparecendo (warn/error).
 */
export function logLevelFor(
  url: string,
  status: number,
  failed: boolean,
): 'error' | 'warn' | 'info' | 'debug' {
  if (failed || status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return url.startsWith('/v1/progress/heartbeat') ? 'debug' : 'info';
}

export function buildLoggerParams(env: Pick<Env, 'LOG_LEVEL'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: (req) => (req as unknown as Loose).id ?? randomUUID(),
      serializers: {
        req: (req: Loose) => serializeReq(req),
        res: (res: Loose) => ({ statusCode: res.statusCode }),
      },
      // Quem fez a chamada (sem dados pessoais): permite filtrar logs por usuário/empresa.
      customProps: (req) => {
        const user = (req as unknown as { user?: { id: string; tenantId: string | null } }).user;
        return user ? { userId: user.id, tenantId: user.tenantId ?? undefined } : {};
      },
      customLogLevel: (req, res, err) => logLevelFor(req.url ?? '', res.statusCode, !!err),
      autoLogging: {
        // Sondas de saúde e coleta de métricas a cada poucos segundos só fazem barulho.
        ignore: (req) =>
          (req.url ?? '').startsWith('/health') || (req.url ?? '').startsWith('/metrics'),
      },
      customSuccessMessage: (req, res) =>
        `${req.method} ${redactUrl(String((req as unknown as Loose).originalUrl ?? req.url))} ${res.statusCode}`,
    },
  };
}
