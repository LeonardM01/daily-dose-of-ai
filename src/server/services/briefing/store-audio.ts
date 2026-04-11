import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

import { env } from "~/env";

/**
 * Persists MP3 bytes and returns a public URL path usable by the browser.
 */
export async function storeBriefingAudio(
  briefingId: string,
  buffer: Buffer,
): Promise<string> {
  if (env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`briefings/${briefingId}.mp3`, buffer, {
      access: "public",
      token: env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }

  const dir = join(process.cwd(), "public", "audio");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${briefingId}.mp3`);
  await writeFile(file, buffer);
  return `/audio/${briefingId}.mp3`;
}
