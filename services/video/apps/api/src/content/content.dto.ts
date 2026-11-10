import { z } from 'zod';

/** Idioma no formato BCP-47 simples: "pt", "pt-BR", "en-US". */
export const lang = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'idioma inválido (ex.: pt-BR, en)');

export const uploadSubtitleSchema = z.object({
  lang,
  /** conteúdo do arquivo .vtt */
  content: z
    .string()
    .min(10)
    .max(2 * 1024 * 1024),
});
export type UploadSubtitleDto = z.infer<typeof uploadSubtitleSchema>;

export const transcriptQuerySchema = z.object({
  lang: lang.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  from: z.coerce.number().min(0).optional(),
  to: z.coerce.number().min(0).optional(),
});
export type TranscriptQuery = z.infer<typeof transcriptQuerySchema>;

export const putChaptersSchema = z.object({
  chapters: z
    .array(
      z.object({
        startS: z.number().finite().min(0).max(86_400),
        title: z.string().trim().min(1).max(120),
      }),
    )
    .max(100),
});
export type PutChaptersDto = z.infer<typeof putChaptersSchema>;
