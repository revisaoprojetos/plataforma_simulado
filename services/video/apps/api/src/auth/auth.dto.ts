import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(8).max(128);

export const loginSchema = z.object({
  /** slug da empresa; omitido apenas no login do platform_admin */
  tenant: z.string().trim().toLowerCase().min(1).max(40).optional(),
  email,
  password: z.string().min(1).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });
export type RefreshDto = z.infer<typeof refreshSchema>;
