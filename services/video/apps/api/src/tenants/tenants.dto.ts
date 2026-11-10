import { z } from 'zod';
import { email, password } from '../auth/auth.dto';

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'use letras minúsculas, números e hífen (3–40)');

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.-]+(:\d{1,5})?$/, 'informe apenas host[:porta]');

export const createTenantSchema = z.object({
  slug,
  name: z.string().trim().min(2).max(120),
  allowedDomains: z.array(domain).max(20).default([]),
  admin: z.object({ email, name: z.string().trim().min(2).max(120), password }),
});
export type CreateTenantDto = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  allowedDomains: z.array(domain).max(20).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  /** libera a API de integração (matrícula genérica e sessão do aluno) para a empresa */
  accessEndpointEnabled: z.boolean().optional(),
});
export type UpdateTenantDto = z.infer<typeof updateTenantSchema>;
