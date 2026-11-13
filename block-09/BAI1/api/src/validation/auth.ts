import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().max(254).email();
export const passwordSchema = z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự.')
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Mật khẩu tối đa 72 byte UTF-8.');
const passwordFields = { password: passwordSchema, confirmPassword: z.string() };
const matching = (value: { password: string; confirmPassword: string }) => value.password === value.confirmPassword;
const matchError = { message: 'Mật khẩu xác nhận chưa khớp.', path: ['confirmPassword'] };
// Unknown fields (including role and invitationCode) are stripped by Zod.
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120), email: emailSchema,
  ...passwordFields, captchaToken: z.string().default(''),
}).refine(matching, matchError);
// Malformed OTP/token values must reach the service's INVALID_* result, rather
// than being remapped to a generic validation error by the HTTP layer.
export const activateSchema = z.object({ email: emailSchema, otp: z.unknown().transform(value => typeof value === 'string' ? value : '') });
export const resendSchema = z.object({ email: emailSchema });
export const forgotSchema = z.object({ email: emailSchema, captchaToken: z.string().default('') });
export const resetSchema = z.object({ token: z.unknown().transform(value => typeof value === 'string' ? value : ''), ...passwordFields }).refine(matching, matchError);
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
  captchaToken: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetInput = z.infer<typeof resetSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
