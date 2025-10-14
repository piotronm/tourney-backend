/**
 * Environment variable validation and configuration.
 * Uses Zod for strict type checking and validation.
 */

import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file
config();

/**
 * Environment variable schema.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('file:./dev.db'),
});

/**
 * Parse and validate environment variables.
 */
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.flatten());
  process.exit(1);
}

/**
 * Validated and typed environment variables.
 */
export const env = parsedEnv.data;
