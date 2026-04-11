import { TextToSpeechClient } from "@google-cloud/text-to-speech";

const DEFAULT_VOICE = "en-US-Chirp3-HD-Algenib";
const SYNC_TTS_LIMIT_BYTES = 5000;
const TARGET_CHUNK_BYTES = 4200;

export type SynthesizeResult = {
  audioBuffer: Buffer;
  characterCount: number;
  contentType: "audio/mpeg" | "audio/wav";
  fileExtension: "mp3" | "wav";
};

/**
 * Synthesize speech using Chirp 3 HD (Google Cloud Text-to-Speech).
 * `serviceAccountJson` is the raw JSON key string for a GCP service account with TTS access.
 */
export async function synthesizeChirpHd(
  serviceAccountJson: string,
  ssml: string,
  options?: {
    voiceName?: string;
  },
): Promise<SynthesizeResult> {
  const normalizedJson = serviceAccountJson.trim();
  const credentials = parseServiceAccountJson(normalizedJson);
  const voiceName = options?.voiceName ?? process.env.TTS_VOICE_NAME ?? DEFAULT_VOICE;

  const characterCount = ssml.length;
  const client = new TextToSpeechClient({ credentials });

  if (Buffer.byteLength(ssml, "utf8") > SYNC_TTS_LIMIT_BYTES) {
    return synthesizeChunkedAudio(client, ssml, voiceName);
  }

  let response;
  try {
    [response] = await client.synthesizeSpeech({
      input: { ssml },
      voice: {
        languageCode: "en-US",
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 1.0,
      },
    });
  } catch (error) {
    throw new Error(
      `TTS SSML synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const audio = response.audioContent;
  if (!audio) {
    throw new Error("TTS returned empty audio");
  }

  return {
    audioBuffer: Buffer.from(audio),
    characterCount,
    contentType: "audio/mpeg",
    fileExtension: "mp3",
  };
}

function parseServiceAccountJson(
  normalizedJson: string,
): Record<string, unknown> & { project_id?: string } {
  try {
    return JSON.parse(normalizedJson) as Record<string, unknown> & {
      project_id?: string;
    };
  } catch {
    throw new Error(
      "GOOGLE_TTS_SERVICE_ACCOUNT_JSON is not valid JSON. Set it to the full raw service account JSON string, with properly escaped newlines/quotes if stored in an env var.",
    );
  }
}

async function synthesizeChunkedAudio(
  client: TextToSpeechClient,
  ssml: string,
  voiceName: string,
): Promise<SynthesizeResult> {
  const chunks = chunkSsml(ssml, TARGET_CHUNK_BYTES);
  const wavBuffers: Buffer[] = [];

  for (const chunk of chunks) {
    let response;
    try {
      [response] = await client.synthesizeSpeech({
        input: { ssml: chunk },
        voice: {
          languageCode: "en-US",
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: "LINEAR16",
          speakingRate: 1.0,
        },
      });
    } catch (error) {
      throw new Error(
        `TTS chunked synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const audio = response.audioContent;
    if (!audio) {
      throw new Error("TTS returned empty audio for one of the synthesized chunks");
    }

    wavBuffers.push(Buffer.from(audio));
  }

  return {
    audioBuffer: mergeLinear16WavBuffers(wavBuffers),
    characterCount: ssml.length,
    contentType: "audio/wav",
    fileExtension: "wav",
  };
}

function chunkSsml(ssml: string, maxBytes: number): string[] {
  const normalized = ssml.trim();
  if (Buffer.byteLength(normalized, "utf8") <= maxBytes) {
    return [normalized];
  }

  const inner = normalized
    .replace(/^<speak>/i, "")
    .replace(/<\/speak>$/i, "")
    .trim();
  const paragraphs = [...inner.matchAll(/<p>[\s\S]*?<\/p>/gi)].map(
    (match) => match[0],
  );

  const units =
    paragraphs.length > 0
      ? paragraphs.flatMap((paragraph) => splitParagraph(paragraph, maxBytes))
      : splitPlainSpeakBody(inner, maxBytes);

  const chunks: string[] = [];
  let currentUnits: string[] = [];

  for (const unit of units) {
    const nextUnits = currentUnits.length > 0 ? [...currentUnits, unit] : [unit];
    const nextChunk = wrapSpeak(nextUnits.join(""));
    if (Buffer.byteLength(nextChunk, "utf8") <= maxBytes) {
      currentUnits = nextUnits;
      continue;
    }

    if (currentUnits.length === 0) {
      throw new Error("Unable to split SSML into Google TTS-safe chunks under 5000 bytes.");
    }

    chunks.push(wrapSpeak(currentUnits.join("")));
    currentUnits = [unit];
  }

  if (currentUnits.length > 0) {
    chunks.push(wrapSpeak(currentUnits.join("")));
  }

  return chunks;
}

function splitParagraph(paragraph: string, maxBytes: number): string[] {
  if (Buffer.byteLength(wrapSpeak(paragraph), "utf8") <= maxBytes) {
    return [paragraph];
  }

  const body = paragraph.replace(/^<p>/i, "").replace(/<\/p>$/i, "");
  const sentences = [...body.matchAll(/<s>[\s\S]*?<\/s>/gi)].map(
    (match) => match[0],
  );

  if (sentences.length === 0) {
    throw new Error("SSML paragraph is too large and could not be split into sentences.");
  }

  const paragraphs: string[] = [];
  let currentSentences: string[] = [];

  for (const sentence of sentences) {
    const candidate = `<p>${[...currentSentences, sentence].join("")}</p>`;
    if (Buffer.byteLength(wrapSpeak(candidate), "utf8") <= maxBytes) {
      currentSentences.push(sentence);
      continue;
    }

    if (currentSentences.length === 0) {
      throw new Error(
        "A single SSML sentence exceeds Google TTS input limits. Shorten the generated briefing.",
      );
    }

    paragraphs.push(`<p>${currentSentences.join("")}</p>`);
    currentSentences = [sentence];
  }

  if (currentSentences.length > 0) {
    paragraphs.push(`<p>${currentSentences.join("")}</p>`);
  }

  return paragraphs;
}

function splitPlainSpeakBody(body: string, maxBytes: number): string[] {
  const paragraphs = body
    .split(/<break\b[^>]*\/>/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    throw new Error("Unable to split SSML body for chunked synthesis.");
  }

  return paragraphs.flatMap((paragraph) => splitParagraph(paragraph, maxBytes));
}

function wrapSpeak(body: string): string {
  return `<speak>${body}</speak>`;
}

type ParsedWav = {
  fmtChunk: Buffer;
  dataChunk: Buffer;
  channelCount: number;
  sampleRate: number;
  bitsPerSample: number;
};

function mergeLinear16WavBuffers(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 0) {
    throw new Error("No WAV chunks were generated");
  }

  const parsed = wavBuffers.map(parseWavBuffer);
  const first = parsed[0];
  if (!first) {
    throw new Error("Failed to parse merged WAV chunks");
  }

  for (const part of parsed.slice(1)) {
    if (
      part.channelCount !== first.channelCount ||
      part.sampleRate !== first.sampleRate ||
      part.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error("Synthesized WAV chunks used incompatible audio formats");
    }
  }

  const dataChunk = Buffer.concat(parsed.map((part) => part.dataChunk));
  const fmtChunk = first.fmtChunk;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataChunk.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  fmtChunk.copy(header, 20, 0, 16);
  header.write("data", 36);
  header.writeUInt32LE(dataChunk.length, 40);

  return Buffer.concat([header, dataChunk]);
}

function parseWavBuffer(buffer: Buffer): ParsedWav {
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Google TTS returned invalid WAV data");
  }

  let offset = 12;
  let fmtChunk: Buffer | null = null;
  let dataChunk: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > buffer.length) {
      throw new Error("WAV chunk extends beyond buffer length");
    }

    if (chunkId === "fmt ") {
      fmtChunk = buffer.subarray(chunkStart, chunkEnd);
    } else if (chunkId === "data") {
      dataChunk = buffer.subarray(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!fmtChunk || fmtChunk.length < 16 || !dataChunk) {
    throw new Error("WAV data is missing fmt or data chunks");
  }

  return {
    fmtChunk,
    dataChunk,
    channelCount: fmtChunk.readUInt16LE(2),
    sampleRate: fmtChunk.readUInt32LE(4),
    bitsPerSample: fmtChunk.readUInt16LE(14),
  };
}
