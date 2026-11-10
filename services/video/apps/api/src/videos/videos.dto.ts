import { z } from 'zod';

export const ALLOWED_EXTENSIONS = [
  '.mp4',
  '.m4v',
  '.mov',
  '.mkv',
  '.webm',
  '.avi',
  '.mpg',
  '.mpeg',
];
export const ALLOWED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
];

export const createUploadSchema = z.object({
  lessonId: z.string().uuid(),
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((n) => ALLOWED_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)), {
      message: `extensão não suportada (use ${ALLOWED_EXTENSIONS.join(', ')})`,
    }),
  /** bytes declarados; o limite efetivo é MAX_UPLOAD_BYTES (checado no servidor) */
  size: z
    .number()
    .int()
    .positive()
    .max(2 ** 50),
  contentType: z
    .string()
    .trim()
    .toLowerCase()
    .refine((t) => ALLOWED_CONTENT_TYPES.includes(t), { message: 'tipo de arquivo não suportado' }),
});
export type CreateUploadDto = z.infer<typeof createUploadSchema>;

export const signPartsSchema = z.object({
  partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(200),
});
export type SignPartsDto = z.infer<typeof signPartsSchema>;

export const completeUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10000),
        etag: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(10000),
});
export type CompleteUploadDto = z.infer<typeof completeUploadSchema>;
