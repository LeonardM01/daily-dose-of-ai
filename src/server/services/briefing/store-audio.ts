import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

import { env } from "~/env";

/**
 * Persists generated audio bytes and returns a public URL path usable by the browser.
 */
export async function storeBriefingAudio(
  briefingDate: string,
  buffer: Buffer,
  options?: {
    extension?: "mp3" | "wav";
    contentType?: "audio/mpeg" | "audio/wav";
  },
): Promise<string> {
  const extension = options?.extension ?? "mp3";
  const contentType = options?.contentType ?? "audio/mpeg";

  if (
    env.R2_BUCKET &&
    env.R2_ENDPOINT &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_PUBLIC_BASE_URL
  ) {
    const key = `audio/${briefingDate}.${extension}`;
    const endpoint = normalizeR2Endpoint(env.R2_ENDPOINT, env.R2_BUCKET);
    const client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }

  const dir = join(process.cwd(), "public", "audio");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${briefingDate}.${extension}`);
  await writeFile(file, buffer);
  return `/audio/${briefingDate}.${extension}`;
}

function normalizeR2Endpoint(endpoint: string, bucket: string): string {
  const url = new URL(endpoint);
  const trimmedPath = url.pathname.replace(/\/+$/, "");
  if (trimmedPath === `/${bucket}`) {
    url.pathname = "";
  }
  return url.toString().replace(/\/$/, "");
}
