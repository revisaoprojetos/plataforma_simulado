import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantUser } from '../auth/auth.types';
import { Tenant } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RateLimit } from '../security/rate-limit.guard';
import { AnalyticsService } from './analytics.service';
import { toCsv } from './csv';
import { resolvePeriod } from './period';

const periodSchema = z.object({ from: z.string().optional(), to: z.string().optional() });
const csvSchema = periodSchema.extend({ delimiter: z.enum([',', ';']).default(',') });
const inactiveSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(14),
  /** máximo de linhas devolvidas (a resposta traz `truncated` quando houve corte) */
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});
const inactiveCsvSchema = inactiveSchema.extend({ delimiter: z.enum([',', ';']).default(',') });
const studentParam = z
  .string()
  .refine((v) => v === 'me' || z.string().uuid().safeParse(v).success, {
    message: 'use "me" ou o id do aluno',
  });

type Period = z.infer<typeof periodSchema>;
type Csv = z.infer<typeof csvSchema>;
type Inactive = z.infer<typeof inactiveSchema>;
type InactiveCsv = z.infer<typeof inactiveCsvSchema>;

interface CsvResponse {
  set(headers: Record<string, string>): void;
}

const csvHeaders = (res: CsvResponse, name: string) =>
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  });

@ApiTags('analytics')
@ApiBearerAuth()
@RateLimit('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('lessons/:id')
  lesson(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(periodSchema)) q: Period,
  ) {
    return this.analytics.lesson(user, id, resolvePeriod(q.from, q.to));
  }

  /** Curva de retenção da aula: um ponto a cada 5 s. */
  @Get('lessons/:id/export.csv')
  async lessonCsv(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(csvSchema)) q: Csv,
    @Res({ passthrough: true }) res: CsvResponse,
  ) {
    const data = await this.analytics.lesson(user, id, resolvePeriod(q.from, q.to));
    const peak = Math.max(0, ...data.retention.points.map((p) => p.viewers));
    csvHeaders(res, `aula-${id.slice(0, 8)}-retencao.csv`);
    return toCsv(
      data.retention.points,
      [
        { header: 'inicio_s', get: (p) => p.bucketS },
        { header: 'fim_s', get: (p) => p.bucketS + data.retention.bucketSeconds },
        { header: 'alunos', get: (p) => p.viewers },
        {
          header: 'percentual_do_pico',
          get: (p) => (peak ? Math.round((p.viewers / peak) * 1000) / 10 : 0),
        },
      ],
      q.delimiter,
    );
  }

  @Get('courses/:id')
  course(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(periodSchema)) q: Period,
  ) {
    return this.analytics.course(user, id, resolvePeriod(q.from, q.to));
  }

  /** Ranking de aulas do curso. */
  @Get('courses/:id/export.csv')
  async courseCsv(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(csvSchema)) q: Csv,
    @Res({ passthrough: true }) res: CsvResponse,
  ) {
    const data = await this.analytics.course(user, id, resolvePeriod(q.from, q.to));
    csvHeaders(res, `curso-${id.slice(0, 8)}-aulas.csv`);
    return toCsv(
      data.lessons,
      [
        { header: 'modulo', get: (l) => l.module },
        { header: 'aula', get: (l) => l.title },
        { header: 'situacao', get: (l) => l.status },
        { header: 'visualizacoes', get: (l) => l.views },
        { header: 'alunos_unicos', get: (l) => l.uniqueViewers },
        { header: 'segundos_assistidos', get: (l) => l.watchedS },
        { header: 'alunos_que_comecaram', get: (l) => l.startedStudents },
        { header: 'conclusoes', get: (l) => l.completions },
        { header: 'taxa_de_conclusao', get: (l) => l.completionRate },
        { header: 'percentual_medio_assistido', get: (l) => l.avgPercentWatched },
      ],
      q.delimiter,
    );
  }

  @Get('courses/:id/inactive')
  inactive(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(inactiveSchema)) q: Inactive,
  ) {
    return this.analytics.inactive(user, id, q.days, q.limit);
  }

  @Get('courses/:id/inactive/export.csv')
  async inactiveCsv(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(inactiveCsvSchema)) q: InactiveCsv,
    @Res({ passthrough: true }) res: CsvResponse,
  ) {
    const data = await this.analytics.inactive(user, id, q.days, q.limit);
    csvHeaders(res, `curso-${id.slice(0, 8)}-alunos-inativos.csv`);
    return toCsv(
      data.students,
      [
        { header: 'nome', get: (s) => s.name },
        { header: 'email', get: (s) => s.email },
        { header: 'ultima_atividade', get: (s) => s.lastActivityAt },
        { header: 'dias_sem_atividade', get: (s) => s.daysInactive },
        { header: 'aulas_concluidas', get: (s) => s.completedLessons },
        { header: 'total_de_aulas', get: (s) => s.totalLessons },
        { header: 'progresso_percentual', get: (s) => s.progressPercent },
      ],
      q.delimiter,
    );
  }

  @Get('students/:id')
  student(@Tenant() user: TenantUser, @Param('id', new ZodPipe(studentParam)) id: string) {
    return this.analytics.student(user, id);
  }
}
