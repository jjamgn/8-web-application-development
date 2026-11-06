import 'dotenv/config';
import { z } from 'zod';

const endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const tokenSchema = z.string().trim().min(1).max(2048);
const responseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
});

export type CaptchaErrorCode = 'CAPTCHA_CONFIG_INVALID' | 'CAPTCHA_TOKEN_INVALID' | 'CAPTCHA_UNAVAILABLE' | 'CAPTCHA_TIMEOUT';

export class CaptchaError extends Error {
  constructor(public readonly code: CaptchaErrorCode, message: string) {
    super(message);
    this.name = 'CaptchaError';
  }
}

/** Verify once before creating an account or sending email. Never log the token or secret. */
export async function verifyCaptcha(token: unknown): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const hostnames = (process.env.TURNSTILE_ALLOWED_HOSTNAMES || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  if (!secret || !hostnames.length || hostnames.some(host => !/^[a-z0-9.-]+$/.test(host))) {
    throw new CaptchaError('CAPTCHA_CONFIG_INVALID', 'Cấu hình TURNSTILE_SECRET_KEY hoặc TURNSTILE_ALLOWED_HOSTNAMES thiếu hoặc không hợp lệ.');
  }

  const parsedToken = tokenSchema.safeParse(token);
  if (!parsedToken.success) {
    throw new CaptchaError('CAPTCHA_TOKEN_INVALID', 'Vui lòng hoàn thành CAPTCHA và gửi lại biểu mẫu.');
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new CaptchaError('CAPTCHA_TIMEOUT', 'Xác minh CAPTCHA quá thời gian chờ. Vui lòng thử lại.'));
      controller.abort();
    }, 5000);
  });

  const validate = async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: parsedToken.data }),
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) throw new Error('SITEVERIFY_HTTP_ERROR');
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('SITEVERIFY_RESPONSE_INVALID');
    const result = parsed.data;
    const errors = result['error-codes'] || [];

    if (errors.some(code => ['missing-input-secret', 'invalid-input-secret'].includes(code))) {
      throw new CaptchaError('CAPTCHA_CONFIG_INVALID', 'Không xác thực được cấu hình Turnstile. Vui lòng kiểm tra Secret key.');
    }
    if (errors.some(code => ['internal-error', 'bad-request'].includes(code))) throw new Error('SITEVERIFY_SERVICE_ERROR');
    if (!result.success) {
      throw new CaptchaError('CAPTCHA_TOKEN_INVALID', 'CAPTCHA không hợp lệ, đã hết hạn hoặc đã sử dụng. Vui lòng thực hiện lại.');
    }
    if (errors.length || !result.hostname?.trim()) throw new Error('SITEVERIFY_RESPONSE_INVALID');
    if (!hostnames.includes(result.hostname.trim().toLowerCase())) {
      throw new CaptchaError('CAPTCHA_TOKEN_INVALID', 'CAPTCHA không thuộc hostname được phép. Vui lòng thực hiện lại.');
    }
  };

  try {
    await Promise.race([validate(), timeout]);
  } catch (error) {
    if (error instanceof CaptchaError) throw error;
    // Do not expose network errors or provider payloads, which may contain secrets or tokens.
    throw new CaptchaError('CAPTCHA_UNAVAILABLE', 'Chưa thể xác minh CAPTCHA. Vui lòng thử lại sau.');
  } finally {
    clearTimeout(timer);
  }
}
