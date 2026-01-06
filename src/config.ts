import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // PostgreSQL
  DATABASE_URL: z.string().default('postgresql://localhost:5432/automation'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // API
  API_KEY: z.string().min(16).optional(),

  // LM Studio
  LM_STUDIO_URL: z.string().default('http://localhost:1234/v1'),

  // Limits
  MAX_CONTEXT_SIZE_BYTES: z.coerce.number().default(1_048_576), // 1MB
  MAX_STEP_OUTPUT_BYTES: z.coerce.number().default(262_144), // 256KB
  MAX_STEPS_PER_WORKFLOW: z.coerce.number().default(20),
  MAX_CONCURRENT_RUNS: z.coerce.number().default(100),
  DEFAULT_STEP_TIMEOUT_MS: z.coerce.number().default(300_000), // 5 min
  MAX_STEP_TIMEOUT_MS: z.coerce.number().default(1_800_000), // 30 min
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
