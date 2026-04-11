# Daily Dose of AI

Next.js (T3) app: daily **5–7 minute** AI/tech audio briefings from curated RSS feeds, **Gemini** summarization/ranking, and **Google Cloud Text-to-Speech (Chirp 3 HD)**.

## Prerequisites

- Node 20+
- Docker (for local Postgres / Redis)
- Google AI API key (Gemini)
- GCP service account JSON with **Cloud Text-to-Speech** access (Chirp 3 HD)

## Local setup

1. **Start databases**

   ```bash
   docker compose up -d
   ```

2. **Environment**

   ```bash
   cp .env.example .env
   ```

   - Set `DATABASE_URL` (default matches `docker-compose.yml`).
   - Set `GOOGLE_AI_API_KEY` for Gemini.
   - Set `GOOGLE_TTS_SERVICE_ACCOUNT_JSON` to the full raw service account JSON string for Cloud Text-to-Speech on a single line.
   - `CRON_SECRET`: required to call `/api/cron/daily` (local or production). Use `Authorization: Bearer <CRON_SECRET>`. Without it, the route returns `503`.
   - Optional: `BLOB_READ_WRITE_TOKEN` (Vercel Blob for MP3 URLs in production).
   - Optional: `TTS_VOICE_NAME` if you want to override the default Chirp voice. Example: `en-US-Chirp-HD-F`.

3. **Database**

   ```bash
   npx prisma migrate dev
   npx prisma db seed
   ```

4. **Run**

   ```bash
   npm run dev
   ```

   If you see `Unterminated string in JSON`, your
   `GOOGLE_TTS_SERVICE_ACCOUNT_JSON` env var is malformed. The most common issue
   is pasting multiline JSON directly into `.env` instead of a one-line JSON
   string with escaped `\\n` characters inside `private_key`.

5. **Run the app**

   The site is public. Daily briefings appear automatically after the scheduled
   generation job runs.

## Cron (production)

- Set `CRON_SECRET` in the environment and send the same value in the cron request: `Authorization: Bearer <CRON_SECRET>`. Pipeline failures return HTTP `500`; successful skips (e.g. already completed) return `200` with `skipped: true` in the JSON body.
- [`vercel.json`](vercel.json) schedules `/api/cron/daily` daily at 06:00 UTC (adjust as needed).

## Docker image

A multi-stage [`Dockerfile`](Dockerfile) builds the Next.js `standalone` output. Set `SKIP_ENV_VALIDATION=1` at build time if env is only injected at runtime. Run DB migrations against your production DB before or on deploy (`npx prisma migrate deploy`).

## RSS sources

Default feeds are seeded in [`prisma/seed.ts`](prisma/seed.ts) from [`src/server/data/default-feeds.ts`](src/server/data/default-feeds.ts). Add or disable rows in the `SourceFeed` table as needed.
