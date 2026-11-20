import 'dotenv/config';
import nodemailer from 'nodemailer';
import { z } from 'zod';

const header = z.string().trim().min(1).refine(value => !/[\r\n]/.test(value));
const messageSchema = z.object({
  to: z.string().trim().email(),
  subject: header,
  text: z.string().min(1),
  html: z.string().optional(),
});

const smtpSchema = z.object({
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)),
  SMTP_SECURE: z.enum(['true', 'false']).transform(value => value === 'true'),
  SMTP_USER: z.string().trim().min(1),
  SMTP_PASS: z.string().min(1),
  MAIL_FROM: header,
});

export type MailMessage = z.input<typeof messageSchema>;
export type MailErrorCode = 'MAIL_CONFIG_INVALID' | 'MAIL_MESSAGE_INVALID' | 'MAIL_SEND_FAILED';

export class MailError extends Error {
  constructor(public readonly code: MailErrorCode, message: string) {
    super(message);
    this.name = 'MailError';
  }
}

/** Resolves when SMTP accepts the message, not when it reaches the recipient's inbox. */
export async function sendMail(message: MailMessage): Promise<void> {
  const config = smtpSchema.safeParse(process.env);
  if (!config.success) {
    const fields = [...new Set(config.error.issues.map(issue => String(issue.path[0])))];
    throw new MailError('MAIL_CONFIG_INVALID', `Cấu hình email thiếu hoặc không hợp lệ: ${fields.join(', ')}.`);
  }

  const parsed = messageSchema.safeParse(message);
  if (!parsed.success) {
    throw new MailError('MAIL_MESSAGE_INVALID', 'Địa chỉ nhận hoặc nội dung email không hợp lệ.');
  }

  const smtp = config.data;
  try {
    const transport = nodemailer.createTransport({
      host: smtp.SMTP_HOST,
      port: smtp.SMTP_PORT,
      secure: smtp.SMTP_SECURE,
      auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASS },
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const result = await transport.sendMail({ from: smtp.MAIL_FROM, ...parsed.data });
    if (result.rejected.length > 0 || !result.accepted.some(address => address.toLowerCase() === parsed.data.to.toLowerCase())) {
      throw new Error('SMTP did not accept the recipient.');
    }
  } catch {
    // Provider errors may contain credentials, recipients or message content; do not expose them.
    throw new MailError('MAIL_SEND_FAILED', 'Không gửi được email. Vui lòng thử lại sau.');
  }
}
