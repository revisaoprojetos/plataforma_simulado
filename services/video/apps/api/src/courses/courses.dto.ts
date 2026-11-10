import { z } from 'zod';

const status = z.enum(['draft', 'published']);

export const createCourseSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  status: status.default('draft'),
  /** Só admin pode atribuir outro dono; professor sempre é o próprio dono. */
  ownerId: z.string().uuid().optional(),
});
export type CreateCourseDto = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: status.optional(),
  ownerId: z.string().uuid().optional(),
});
export type UpdateCourseDto = z.infer<typeof updateCourseSchema>;

export const enrollSchema = z.object({ userId: z.string().uuid() });
export type EnrollDto = z.infer<typeof enrollSchema>;
