import 'dotenv/config';
import { z } from 'zod';
import path from 'node:path';
const schema = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
  S3_ENDPOINT: z.url(), S3_REGION: z.string().default('us-east-1'), S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1), S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.literal('true').default('true'),
  UPLOAD_TMP_DIR: z.string().refine(path.isAbsolute, 'Use an absolute temporary directory'),
  SESSION_SECRET: z.string().refine(v => Buffer.byteLength(v) >= 32, 'Minimum 32 bytes'),
  APP_ORIGIN: z.url().transform(v => new URL(v).origin),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development')
});
export type Config = z.infer<typeof schema>;
export function loadConfig(): Config {
  const result = schema.safeParse(process.env);
  if (!result.success) throw new Error(`Invalid configuration: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  return result.data;
}
