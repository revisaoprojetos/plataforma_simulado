import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { currentCorrelationId } from './correlation';

/** 429 com o tempo de espera (vira o cabeçalho Retry-After). */
export class TooManyRequestsException extends HttpException {
  constructor(
    message: string,
    readonly retryAfterS: number,
  ) {
    super({ statusCode: 429, error: 'Too Many Requests', message }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

const NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/** Mensagens do JSON.parse do Node (variam por versão) que o Nest repassa em BadRequestException. */
const JSON_PARSE_MESSAGE =
  /JSON|Unexpected token|Unexpected end|Expected property name|Expected ',' or/i;

/** Erros dos parsers do Express (corpo grande demais, JSON inválido) que chegam sem virar HttpException. */
const parserError = (e: unknown): { status: number; message: string } | null => {
  const err = e as { type?: string; status?: number } | null;
  if (err?.type === 'entity.too.large')
    return { status: 413, message: 'Corpo da requisição maior que o permitido' };
  if (err?.type === 'entity.parse.failed') return { status: 400, message: 'JSON inválido' };
  return null;
};

/**
 * Formato único de erro `{ statusCode, error, message, correlationId }`.
 * Erros inesperados viram 500 genérico (o detalhe vai só para o log, com o mesmo correlationId).
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const correlationId = currentCorrelationId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown>;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body =
        typeof r === 'string' ? { statusCode: status, error: NAMES[status], message: r } : { ...r };
      if (exception instanceof TooManyRequestsException) {
        res.setHeader('Retry-After', String(exception.retryAfterS));
      }
      // O Nest embrulha erros do parser de corpo com o texto cru do Node; troca por mensagem nossa.
      if (typeof body.message === 'string') {
        if (status === 400 && JSON_PARSE_MESSAGE.test(body.message)) body.message = 'JSON inválido';
        if (status === 413) body.message = 'Corpo da requisição maior que o permitido';
      }
    } else if (parserError(exception)) {
      const p = parserError(exception)!;
      status = p.status;
      body = { statusCode: status, error: NAMES[status], message: p.message };
    } else {
      const e = exception as Error;
      this.log.error(`${e?.message ?? exception}`, e?.stack);
      body = {
        statusCode: 500,
        error: NAMES[500],
        message: 'Erro interno. Informe o correlationId ao suporte.',
      };
    }

    res.status(status).json({ ...body, correlationId });
  }
}
