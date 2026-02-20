import { z } from 'zod';

export const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),

  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(3306),
  DB_USERNAME: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_SYNC: z.coerce.boolean().optional(),
  RUN_MIGRATIONS: z.coerce.boolean().optional(),

  // Security
  JWT_SECRET: z.string().min(10),
  PASSWORD_PEPPER: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string(),
  TELEGRAM_ADMIN_ID: z.coerce.string(),

  // CORS / Cookies
  CORS_ORIGINS: z.string().optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),
  COOKIE_SECURE: z.coerce.boolean().optional(),

  // Broadcast worker
  BROADCAST_RETENTION_DAYS: z.coerce.number().int().positive().optional(),
  BROADCAST_BATCH_SIZE: z.coerce.number().int().positive().optional(),
  BROADCAST_CONCURRENCY: z.coerce.number().int().positive().optional(),
  BROADCAST_MAX_ATTEMPTS: z.coerce.number().int().positive().optional(),
  BROADCAST_ACTIVE_SUBSCRIBER_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),

  // Public links
  DASHBOARD_URL: z.string().url().optional(),
  VISITOR_IP_SALT: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    console.error('❌ Invalid Environment Variables:', parsed.error.format());
    throw new Error('Invalid Environment Configuration');
  }
  return parsed.data;
}
