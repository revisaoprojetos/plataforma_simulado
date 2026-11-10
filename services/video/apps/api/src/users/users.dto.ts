import { z } from 'zod';
import { email, password } from '../auth/auth.dto';

/** Dentro de uma empresa só se criam admin, professor e aluno (platform_admin é da plataforma). */
const tenantRole = z.enum(['admin', 'professor', 'aluno']);

export const createUserSchema = z.object({
  email,
  name: z.string().trim().min(2).max(120),
  password,
  role: tenantRole.default('aluno'),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: tenantRole.optional(),
  password: password.optional(),
  active: z.boolean().optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
