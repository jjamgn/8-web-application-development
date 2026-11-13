import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().max(254, 'Email tối đa 254 ký tự.').email('Vui lòng nhập email hợp lệ.');
const password = z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự.').refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Mật khẩu tối đa 72 byte UTF-8; ký tự có dấu có thể chiếm nhiều byte.');
const passwordFields = { password, confirmPassword: z.string() };
const matching = (data: { password: string; confirmPassword: string }) => data.password === data.confirmPassword;
const matchError = { message: 'Mật khẩu xác nhận chưa khớp.', path: ['confirmPassword'] };
export const profileSchema = z.object({ name: z.string().trim().min(1, 'Vui lòng nhập họ tên.').max(120, 'Họ tên tối đa 120 ký tự.') });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại.').refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Mật khẩu hiện tại không hợp lệ.'),
  ...passwordFields,
}).refine(matching, matchError).refine(data => data.currentPassword !== data.password, { message: 'Mật khẩu mới phải khác mật khẩu hiện tại.', path: ['password'] });
const captchaToken = z.string().max(2048).optional().default('');
export const registerSchema = z.object({ name: z.string().trim().min(1, 'Vui lòng nhập họ tên.').max(120, 'Họ tên tối đa 120 ký tự.'), email: emailSchema, captchaToken, ...passwordFields }).refine(matching, matchError);
export const resetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'Liên kết đặt lại mật khẩu không hợp lệ.'), ...passwordFields }).refine(matching, matchError);
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 72), captchaToken });
export const activateSchema = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/) });
export const resendSchema = z.object({ email: emailSchema });
export const forgotSchema = z.object({ email: emailSchema, captchaToken });
