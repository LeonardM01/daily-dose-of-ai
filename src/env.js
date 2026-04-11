import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    GOOGLE_AI_API_KEY: z.string().optional(),
    GOOGLE_TTS_SERVICE_ACCOUNT_JSON: z.string().optional(),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_ENCRYPTION_KEY: z
      .string()
      .min(8)
      .optional()
      .describe(
        "Encryption secret: openssl rand -base64 32, openssl rand -hex 32, or any passphrase (8+ chars)",
      ),
    CRON_SECRET: z.string().optional(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
  },

  client: {},

  runtimeEnv: {
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    GOOGLE_TTS_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
