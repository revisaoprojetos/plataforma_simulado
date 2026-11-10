import { z } from 'zod';

const status = z.enum(['draft', 'published']);
const position = z.number().int().min(0).max(100000);

export const createModuleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  position: position.optional(),
});
export type CreateModuleDto = z.infer<typeof createModuleSchema>;

export const updateModuleSchema = createModuleSchema.partial();
export type UpdateModuleDto = z.infer<typeof updateModuleSchema>;

export const createLessonSchema = z.object({
  title: z.string().trim().min(1).max(200),
  position: position.optional(),
  status: status.default('draft'),
});
export type CreateLessonDto = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  position: position.optional(),
  status: status.optional(),
});
export type UpdateLessonDto = z.infer<typeof updateLessonSchema>;
