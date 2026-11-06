import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().max(254).email();
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
});
