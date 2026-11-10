import { z } from 'zod';
import { email, password } from '../auth/auth.dto';

const ref = z.string().trim().min(1).max(100);
const when = z.string().trim().min(8).max(40);

/** Exatamente um identificador do aluno: e-mail ou o id dele no sistema de origem. */
const oneOf = (v: { email?: string; externalId?: string }) =>
  (v.email === undefined) !== (v.externalId === undefined);
const oneOfMsg = { message: 'Informe exatamente um entre: email, externalId' };

export const enrollSchema = z
  .object({
    email,
    /** obrigatório só quando o aluno ainda não existe */
    name: z.string().trim().min(2).max(120).optional(),
    /** id do aluno no sistema de origem (área de membros, checkout…) */
    externalId: ref.optional(),
    courseId: z.string().uuid(),
    startsAt: when.optional(),
    endsAt: when.optional(),
    /** alternativa a endsAt: dias de acesso a partir do início (ou de agora) */
    accessDays: z.number().int().min(1).max(3650).optional(),
    /** id do pedido no sistema de origem: repetir a chamada não duplica nem renova */
    externalRef: ref.optional(),
    /** cenário de login direto nesta API: devolve o token para o aluno definir a senha */
    issueFirstAccess: z.boolean().default(false),
    /**
     * Reativa uma matrícula revogada quando a chamada não traz datas nem externalRef
     * (nesses casos o prazo existente é mantido e a revogação NÃO é desfeita sem isto).
     */
    reactivate: z.boolean().optional(),
  })
  .strict();
export type EnrollDto = z.infer<typeof enrollSchema>;

export const revokeSchema = z
  .object({ email: email.optional(), externalId: ref.optional(), courseId: z.string().uuid() })
  .strict()
  .refine(oneOf, oneOfMsg);
export type RevokeDto = z.infer<typeof revokeSchema>;

export const sessionSchema = z
  .object({ email: email.optional(), externalId: ref.optional() })
  .strict()
  .refine(oneOf, oneOfMsg);
export type SessionDto = z.infer<typeof sessionSchema>;

export const firstAccessSchema = z
  .object({ token: z.string().min(20).max(200), password })
  .strict();
export type FirstAccessDto = z.infer<typeof firstAccessSchema>;
