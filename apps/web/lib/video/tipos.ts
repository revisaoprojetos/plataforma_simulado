import { z } from 'zod'

/**
 * Contratos (zod) do Vídeo próprio — compartilhados entre as rotas API e o front.
 * SEM dependência de servidor (importável no client). Detalhe em docs/video/CONTRATO-WEB.md.
 */

export const PERM_VIDEO_VIEW = 'video:view'
export const PERM_VIDEO_MANAGE = 'video:manage'

export const STATUS_AULA = ['rascunho', 'enviando', 'processando', 'pronta', 'erro', 'excluida'] as const
export type StatusAulaVideo = (typeof STATUS_AULA)[number]

export const ESTADOS_SYNC = ['pendente', 'processando', 'sincronizado', 'falhou'] as const
export type EstadoSync = (typeof ESTADOS_SYNC)[number]
export type AcaoSync = 'enroll' | 'revoke'

const uuid = z.string().uuid()

// ── Aluno ───────────────────────────────────────────────────────────────────

export const playbackReqSchema = z.object({ aulaId: uuid }).strict()
export type PlaybackReq = z.infer<typeof playbackReqSchema>

export const playbackResSchema = z.object({
  apiBase: z.string(),
  manifestUrl: z.string(),
  playbackToken: z.string(),
  expiresIn: z.number(),
  sessionId: z.string(),
  resumeAt: z.number(),
  watermark: z.object({ text: z.string() }).nullable(),
  subtitles: z.array(z.object({ lang: z.string(), url: z.string() })),
  chapters: z.array(z.object({ startS: z.number(), title: z.string() })),
  poster: z.string().nullable(),
  nextAulaId: z.string().nullable(),
  /** id da aula NO SERVIÇO de vídeo (a transcrição e as notas usam este id, não o da plataforma). */
  lessonId: z.string(),
  durationS: z.number().nullable(),
  spriteVttUrl: z.string().nullable(),
})
export type PlaybackRes = z.infer<typeof playbackResSchema>

export const anotacaoCriarSchema = z
  .object({ aulaId: uuid, atS: z.number().finite().min(0).max(86_400), text: z.string().trim().min(1).max(2000) })
  .strict()
export const anotacaoEditarSchema = z
  .object({ id: uuid, atS: z.number().finite().min(0).max(86_400).optional(), text: z.string().trim().min(1).max(2000).optional() })
  .strict()
export const anotacaoListarSchema = z.object({ aulaId: uuid })

// ── Admin ───────────────────────────────────────────────────────────────────

export const TIPOS_VIDEO = [
  'video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm', 'video/x-msvideo', 'video/mpeg', 'video/x-m4v',
] as const

export const listarAdminSchema = z.object({
  search: z.string().trim().max(120).optional().default(''),
  status: z.enum(STATUS_AULA).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['titulo', 'criado_em', 'status', 'duracao_s', 'ordem']).default('criado_em'),
  dir: z.enum(['asc', 'desc']).default('desc'),
})
export type ListarAdminQuery = z.infer<typeof listarAdminSchema>

/** `filename/size/contentType` são EXTRAS opcionais do contrato: sem eles cria só a aula (rascunho) e o upload
 *  é iniciado depois por `POST /api/admin/video/[id]/upload`. */
export const criarVideoSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200),
    pastaId: uuid.nullish(),
    filename: z.string().trim().min(1).max(255).optional(),
    size: z.number().int().positive().optional(),
    contentType: z.string().trim().toLowerCase().max(100).optional(),
  })
  .strict()
export type CriarVideoReq = z.infer<typeof criarVideoSchema>

export const iniciarUploadSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    size: z.number().int().positive(),
    contentType: z.string().trim().toLowerCase().max(100),
  })
  .strict()

export const partesSchema = z
  .object({ partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(200) })
  .strict()

export const concluirSchema = z
  .object({
    parts: z
      .array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) }))
      .min(1)
      .max(10_000),
  })
  .strict()

export const analyticsSchema = z.object({
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
})

export interface LinhaAulaAdmin {
  id: string
  titulo: string
  status: StatusAulaVideo
  duracaoS: number | null
  pastaId: string | null
  cursoId: string
  ordem: number
  erro: string | null
  criadoEm: string
  atualizadoEm: string
}
