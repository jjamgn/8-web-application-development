import { z } from 'zod';

export const passwordSchema = z.string()
  .refine(value => Array.from(value).length >= 8, 'Mật khẩu cần ít nhất 8 ký tự.')
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Mật khẩu không được vượt quá 72 byte UTF-8.');

export const registrationSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ.').max(254, 'Email quá dài.'),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine(values => values.password === values.confirmPassword, {
  path: ['confirmPassword'], message: 'Xác nhận mật khẩu chưa khớp.',
});
